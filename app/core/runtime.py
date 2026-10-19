"""运行环境信息 —— 应用版本与部署形态。

版本管理页需要区分两件事：
- 平台自身版本（镜像/源码版本）：Docker 部署下只能通过镜像升级，页面无法自更新；
- 任务脚本仓库（coin11-tb）版本：可在页面内检查与拉取。
"""

import os
from functools import lru_cache
from importlib import metadata

# 与 pyproject.toml 的 version 保持一致；包未安装（源码直跑 / Docker 只装依赖）时回退
_VERSION_FALLBACK = "0.4.2"


@lru_cache
def app_version() -> str:
    """平台版本号：优先取已安装包元数据，读不到时回退常量。"""
    try:
        return metadata.version("coin11-control")
    except metadata.PackageNotFoundError:
        return _VERSION_FALLBACK


def deployment_mode() -> str:
    """部署形态：docker | source。

    镜像构建期显式注入 COIN11_DEPLOYMENT=docker；未注入的自建镜像
    回退检测 /.dockerenv（Docker 默认创建）。
    """
    if os.environ.get("COIN11_DEPLOYMENT", "").strip().lower() == "docker":
        return "docker"
    return "docker" if os.path.exists("/.dockerenv") else "source"
