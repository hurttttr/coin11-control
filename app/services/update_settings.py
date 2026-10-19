"""版本管理设置 —— 任务脚本仓库地址与跟踪分支的持久化配置。

与 auto_task_settings 同构：JSON 文件 + 进程内缓存。
Docker 部署必须把文件放在持久卷（Dockerfile: UPDATE_SETTINGS_FILE=/app/data/update_settings.json），
否则重建容器后用户在页面上配置的仓库地址会丢失。
"""

import json
import logging
import os
import re
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# 配置文件路径（可用环境变量覆盖，便于测试隔离；默认: 项目根目录/update_settings.json）
SETTINGS_FILE = os.environ.get(
    "UPDATE_SETTINGS_FILE",
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "update_settings.json",
    ),
)

# git@github.com:owner/repo.git 这类 scp 风格地址
_SCP_LIKE_RE = re.compile(r"^[\w.-]+@[\w.-]+:[\w./~-]+$")
# 分支名：不允许以 - 开头（会被 git 当成选项），不允许 .. / 结尾斜杠 / .lock
_BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$")


class UpdateSettingsError(ValueError):
    """仓库地址或分支不合法"""


def normalize_repo_url(raw: str) -> str:
    """校验并规范化仓库地址；空串表示"使用 .env 默认值"。

    只接受 http(s)://、ssh://、git@host:path 三种形式：
    - 拒绝 file:// / ext:: 等可读写本地文件或执行命令的协议
    - 拒绝以 - 开头的值（git 会把它解析成命令行选项）
    """
    url = (raw or "").strip()
    if not url:
        return ""
    if any(ch.isspace() for ch in url):
        raise UpdateSettingsError("仓库地址不能包含空白字符")
    if url.startswith("-"):
        raise UpdateSettingsError("仓库地址不合法")
    if _SCP_LIKE_RE.match(url):
        return url

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https", "ssh"):
        raise UpdateSettingsError(
            "仅支持 https://、http://、ssh:// 或 git@host:path 形式的仓库地址"
        )
    if not parsed.netloc or not parsed.path.strip("/"):
        raise UpdateSettingsError("仓库地址缺少主机名或仓库路径")
    return url


def normalize_branch(raw: str) -> str:
    """校验分支名；空串表示自动探测远端默认分支。"""
    branch = (raw or "").strip()
    if not branch:
        return ""
    if (
        not _BRANCH_RE.match(branch)
        or ".." in branch
        or "//" in branch
        or branch.endswith("/")
        or branch.endswith(".lock")
    ):
        raise UpdateSettingsError("分支名不合法（例如含 ..、首字符为 . 或 -）")
    return branch


class UpdateSettingsStore:
    """仓库地址 / 分支配置的读写"""

    def __init__(self) -> None:
        self._cache: dict[str, str] | None = None

    def _load(self) -> dict[str, str]:
        if self._cache is not None:
            return self._cache

        data: dict[str, str] = {"repo_url": "", "branch": ""}
        if os.path.isfile(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE, encoding="utf-8") as f:
                    raw = json.load(f)
                if isinstance(raw, dict):
                    data = {
                        "repo_url": normalize_repo_url(str(raw.get("repo_url") or "")),
                        "branch": normalize_branch(str(raw.get("branch") or "")),
                    }
            except (json.JSONDecodeError, OSError, UpdateSettingsError) as e:
                # 配置损坏不应该让版本管理整体不可用：告警并回退默认值
                logger.warning("读取版本设置失败，回退默认值: %s", e)
        self._cache = data
        return data

    def get(self) -> dict[str, str]:
        return dict(self._load())

    @property
    def repo_url(self) -> str:
        return self._load()["repo_url"]

    @property
    def branch(self) -> str:
        return self._load()["branch"]

    def save(self, repo_url: str, branch: str) -> dict[str, str]:
        """校验并原子写入配置（先写临时文件再 replace，避免半截 JSON）"""
        payload = {
            "repo_url": normalize_repo_url(repo_url),
            "branch": normalize_branch(branch),
        }
        directory = os.path.dirname(SETTINGS_FILE)
        try:
            if directory:
                os.makedirs(directory, exist_ok=True)
            tmp = f"{SETTINGS_FILE}.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            os.replace(tmp, SETTINGS_FILE)
        except OSError as e:
            # 写盘失败时不留下与磁盘不一致的内存缓存
            self._cache = None
            raise UpdateSettingsError(f"保存版本设置失败: {e}") from e
        self._cache = payload
        return dict(payload)

    def reset_cache(self) -> None:
        """仅用于测试 / 外部修改文件后强制重读"""
        self._cache = None


# 全局单例
update_settings = UpdateSettingsStore()
