"""
版本管理服务
负责 Git fetch/pull、更新检测、仓库状态、仓库地址配置。
git 子进程逻辑统一走 app.services.git_ops（与 repo_manager 共享）。

更新动作本身由 app.services.update_job 编排（分阶段进度 + 日志）；
本模块只保留"一次性的检查/拉取"能力与仓库元信息。
"""

import logging
import time
from datetime import datetime

from app.core.config import Settings, get_settings
from app.core.runtime import app_version, deployment_mode
from app.services import git_ops
from app.services.update_settings import UpdateSettingsError, update_settings

logger = logging.getLogger(__name__)

# 仓库状态缓存时长：状态接口会被横幅与版本页同时请求，
# Windows 上每次要 spawn 5~6 个 git 进程，短 TTL 避免重复开销。
_STATUS_TTL_SECONDS = 2.0


class UpdateCheckResult:
    """版本检测结果 (数据类)"""

    def __init__(
        self,
        has_update: bool = False,
        current_commit: str = "",
        latest_commit: str = "",
        commits_behind: int = 0,
        commit_messages: list[str] | None = None,
        checked_at: str | None = None,
        *,
        branch: str = "",
        repo_url: str = "",
        fetch_ok: bool = True,
        warning: str = "",
    ):
        self.has_update = has_update
        self.current_commit = current_commit
        self.latest_commit = latest_commit
        self.commits_behind = commits_behind
        self.commit_messages = commit_messages or []
        self.checked_at = checked_at or datetime.now().isoformat()
        self.branch = branch
        self.repo_url = repo_url
        self.fetch_ok = fetch_ok
        self.warning = warning

    def to_dict(self) -> dict:
        return {
            "has_update": self.has_update,
            "current_commit": self.current_commit,
            "latest_commit": self.latest_commit,
            "commits_behind": self.commits_behind,
            "commit_messages": self.commit_messages,
            "checked_at": self.checked_at,
            "branch": self.branch,
            "repo_url": self.repo_url,
            "fetch_ok": self.fetch_ok,
            "warning": self.warning,
        }


class VersionManager:
    """版本管理服务 — 仓库信息、更新检测、仓库地址配置"""

    def __init__(self):
        self._last_check: UpdateCheckResult | None = None
        self._status_cache: tuple[float, dict] | None = None

    @property
    def settings(self) -> Settings:
        """每次访问都取当前配置单例（理由同 DeviceManager.settings）"""
        return get_settings()

    @property
    def repo_path(self) -> str:
        """coin11-tb 仓库路径（延迟读取，随配置变化生效）"""
        return self.settings.coin11_tb_path_resolved

    @property
    def repo_url(self) -> str:
        """生效的仓库地址：页面配置优先，其次 .env 默认值"""
        return update_settings.repo_url or self.settings.COIN11_TB_REPO_URL

    @property
    def _repo_path(self) -> str:
        """兼容旧代码中的私有引用"""
        return self.repo_path

    def get_settings(self) -> dict:
        return {
            "repo_url": update_settings.repo_url,
            "branch": update_settings.branch,
            "default_repo_url": self.settings.COIN11_TB_REPO_URL,
            "effective_repo_url": self.repo_url,
        }

    def _invalidate_status(self) -> None:
        self._status_cache = None

    async def get_status(self) -> dict:
        """仓库元信息（只读本地，不发网络请求）"""
        now = time.monotonic()
        if self._status_cache and now - self._status_cache[0] < _STATUS_TTL_SECONDS:
            return dict(self._status_cache[1])

        repo = self.repo_path
        is_repo = git_ops.is_git_repo(repo)
        branch = (
            await git_ops.resolve_branch(repo, update_settings.branch)
            if is_repo
            else (update_settings.branch or git_ops.DEFAULT_BRANCH)
        )
        current_commit = await git_ops.get_head_commit(repo) if is_repo else ""
        remote_commit = (
            await git_ops.get_remote_commit(repo, branch) if is_repo else ""
        )
        origin_url = await git_ops.get_remote_url(repo) if is_repo else ""
        dirty_text = await git_ops.status_porcelain(repo) if is_repo else ""

        # 仓库克隆状态由 repo_manager 维护（main.py 启动时注入）
        import app.services.repo_manager as rm

        repo_mgr = rm.repo_manager
        last = self._last_check

        status = {
            "repo_url": self.repo_url,
            "origin_url": origin_url,
            "repo_url_source": "settings" if update_settings.repo_url else "env",
            "default_repo_url": self.settings.COIN11_TB_REPO_URL,
            "branch": branch,
            "branch_source": "settings" if update_settings.branch else "auto",
            "repo_path": repo,
            "is_git_repo": is_repo,
            "current_commit": current_commit,
            "remote_commit": remote_commit,
            "commits_behind": last.commits_behind if last else 0,
            "dirty": bool(dirty_text),
            "dirty_files": dirty_text.splitlines()[:20] if dirty_text else [],
            "deployment": deployment_mode(),
            "app_version": app_version(),
            "repo_status": repo_mgr.status if repo_mgr else "unknown",
            "repo_error": repo_mgr.error_msg if repo_mgr else "",
            "last_checked_at": last.checked_at if last else None,
        }
        self._status_cache = (now, status)
        return dict(status)

    async def check_update(self) -> UpdateCheckResult:
        """
        检查原项目是否有远程更新
        1. 探测远端默认分支（设置里指定则优先）
        2. git fetch origin <branch>（允许失败，但要明确告知而不是假装"无更新"）
        3. git rev-parse HEAD / origin/<branch>
        4. git rev-list --count（落后 commit 数）
        5. git log --oneline（commit 消息）
        """
        repo = self.repo_path
        if not git_ops.is_git_repo(repo):
            self._last_check = UpdateCheckResult(
                has_update=False,
                repo_url=self.repo_url,
                warning="任务脚本目录不是 Git 仓库，无法检查更新",
            )
            return self._last_check

        branch = await git_ops.resolve_branch(repo, update_settings.branch)

        # fetch 可能失败（无网络等），不阻塞后续本地查询，但要记录原因
        _, fetch_err, fetch_rc = await git_ops.fetch(repo, branch, timeout=30)
        fetch_ok = fetch_rc == 0
        warning = ""
        if not fetch_ok:
            warning = (
                f"拉取远程引用失败（{fetch_err or '未知错误'}），"
                "以下结果基于本地缓存的远端信息"
            )
            logger.warning("[VersionManager] %s", warning)

        current_commit = await git_ops.get_head_commit(repo)
        latest_commit = await git_ops.get_remote_commit(repo, branch) or current_commit

        commits_behind = 0
        commit_messages: list[str] = []
        if current_commit and latest_commit:
            commits_behind = await git_ops.count_commits_behind(repo, current_commit, branch)
            if commits_behind > 0:
                commit_messages = await git_ops.list_commit_messages(
                    repo, current_commit, branch
                )

        result = UpdateCheckResult(
            has_update=commits_behind > 0,
            current_commit=current_commit,
            latest_commit=latest_commit,
            commits_behind=commits_behind,
            commit_messages=commit_messages,
            branch=branch,
            repo_url=self.repo_url,
            fetch_ok=fetch_ok,
            warning=warning,
        )
        self._last_check = result
        self._invalidate_status()
        return result

    async def pull_update(self) -> dict:
        """
        拉取原项目更新（同步版本，供脚本/兼容调用；页面走 update_job 的带进度任务）
        执行 git pull origin <branch>（分支名支持设置指定或自动探测）
        """
        repo = self.repo_path
        if not git_ops.is_git_repo(repo):
            return {
                "success": False,
                "message": "不是 Git 仓库，无法拉取更新",
                "pulled_commits": [],
            }

        branch = await git_ops.resolve_branch(repo, update_settings.branch)
        stdout, stderr, rc = await git_ops.pull(repo, branch, timeout=60)
        if rc != 0:
            return {
                "success": False,
                "message": stderr or stdout or "git pull 失败",
                "pulled_commits": [],
            }

        self._invalidate_status()
        return {
            "success": True,
            "message": stdout.strip() or "已更新到最新版本",
            "pulled_commits": git_ops.parse_pulled_commits(stdout),
        }

    async def apply_settings(self, repo_url: str, branch: str) -> dict:
        """保存仓库地址/分支，并把已有仓库的 origin 同步到新地址。"""
        previous_url = self.repo_url
        payload = update_settings.save(repo_url, branch)
        effective_url = payload["repo_url"] or self.settings.COIN11_TB_REPO_URL

        applied: list[str] = []
        repo = self.repo_path
        if git_ops.is_git_repo(repo) and effective_url:
            current_url = await git_ops.get_remote_url(repo)
            if current_url != effective_url:
                stdout, stderr, rc = await git_ops.set_remote_url(repo, effective_url)
                if rc != 0:
                    raise UpdateSettingsError(
                        f"仓库地址已保存，但更新 origin 失败: {stderr or stdout}"
                    )
                applied.append(f"origin 已从 {current_url or '(空)'} 改为 {effective_url}")

        # 让后续 reclone 使用新地址（repo_manager 在 lifespan 中创建）
        import app.services.repo_manager as rm

        if rm.repo_manager is not None:
            rm.repo_manager.repo_url = effective_url

        # 仓库变了，旧的检查结果不再可信
        self._last_check = None
        self._invalidate_status()

        return {
            "settings": self.get_settings(),
            "previous_repo_url": previous_url,
            "effective_repo_url": effective_url,
            "applied": applied,
        }

    def remember_pull_result(
        self, previous_commit: str, current_commit: str, branch: str
    ) -> None:
        """更新任务成功后刷新缓存，避免页面再次检查时短暂显示旧状态。"""
        self._last_check = UpdateCheckResult(
            has_update=False,
            current_commit=current_commit,
            latest_commit=current_commit,
            commits_behind=0,
            branch=branch,
            repo_url=self.repo_url,
        )
        self._invalidate_status()


# 全局单例
version_manager = VersionManager()
