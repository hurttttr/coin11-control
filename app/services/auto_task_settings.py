"""
自动任务设置服务
保存/读取自动运行任务配置（JSON 文件）
"""

import json
import os

# 配置文件路径（可用环境变量覆盖，便于测试隔离；默认: 项目根目录/auto_task_settings.json）
SETTINGS_FILE = os.environ.get(
    "AUTO_TASK_SETTINGS_FILE",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "auto_task_settings.json"),
)


class AutoTaskSettings:
    """自动任务设置管理"""

    def __init__(self):
        self._cache: list[str] | None = None
        self._cache_path: str | None = None

    def _settings_file(self) -> str:
        """运行时读取配置文件路径。

        不在 import 期固定：Docker / 测试会在进程启动后设置
        AUTO_TASK_SETTINGS_FILE（如 /app/data/auto_task_settings.json），
        固定值会让这些场景悄悄读写错误的位置。
        """
        return os.environ.get("AUTO_TASK_SETTINGS_FILE") or SETTINGS_FILE

    def _load(self) -> list[str]:
        """从 JSON 文件加载自动任务列表"""
        path = self._settings_file()
        if self._cache is not None and self._cache_path == path:
            return self._cache
        data: list[str] = []
        if os.path.isfile(path):
            try:
                with open(path, encoding="utf-8") as f:
                    raw = json.load(f)
                if isinstance(raw, dict):
                    data = raw.get("auto_tasks", [])
            except (json.JSONDecodeError, OSError):
                data = []
        self._cache = data
        self._cache_path = path
        return self._cache

    def get_auto_tasks(self) -> list[str]:
        """获取自动运行任务脚本名列表"""
        return self._load()

    def set_auto_tasks(self, tasks: list[str]) -> None:
        """设置自动运行任务脚本名列表"""
        path = self._settings_file()
        self._cache = tasks
        self._cache_path = path
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"auto_tasks": tasks}, f, ensure_ascii=False, indent=2)

    def has_auto_tasks(self) -> bool:
        """是否有配置自动任务"""
        return len(self._load()) > 0


# 全局单例
auto_task_settings = AutoTaskSettings()
