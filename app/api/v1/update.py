"""
版本管理端点

- /check     同步检查更新（fetch + 比对，通常 1~30s）
- /status    仓库元信息（只读本地，不发网络请求），供版本页与横幅展示
- /settings  任务脚本仓库地址 / 分支配置
- /pull      启动异步更新任务（立即返回任务快照，进度走 /progress 轮询）
- /reclone   备份并重新克隆仓库（异步任务，需 confirm）
- /progress  任务进度 + 日志（页面刷新后据此恢复进度）
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.schemas.device import UpdateCheckResult
from app.services.update_job import update_job_manager
from app.services.update_settings import UpdateSettingsError
from app.services.version_manager import version_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/update", tags=["update"])


class UpdateSettingsRequest(BaseModel):
    """仓库地址 / 分支配置请求"""

    repo_url: str = Field(
        "",
        description="GitHub 仓库地址；留空表示使用 .env 的 COIN11_TB_REPO_URL",
        examples=["https://github.com/czl0325/coin11-tb.git"],
    )
    branch: str = Field("", description="跟踪分支；留空表示自动探测远端默认分支")


class RecloneRequest(BaseModel):
    """重新克隆请求"""

    confirm: bool = Field(
        False,
        description="必须显式传 true：旧仓库会被改名备份，然后重新 clone",
    )


@router.get("/check", response_model=UpdateCheckResult)
async def check_update():
    """检查原项目是否有远程更新"""
    result = await version_manager.check_update()
    return result.to_dict()


@router.get("/status")
async def get_update_status():
    """获取仓库与部署环境信息（不发起网络请求）"""
    return await version_manager.get_status()


@router.get("/settings")
async def get_update_settings():
    """读取仓库地址 / 分支配置"""
    return version_manager.get_settings()


@router.put("/settings")
async def save_update_settings(body: UpdateSettingsRequest):
    """保存仓库地址 / 分支，并把已有仓库的 origin 同步到新地址"""
    try:
        return await version_manager.apply_settings(body.repo_url, body.branch)
    except UpdateSettingsError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/pull", status_code=202)
async def pull_update():
    """启动异步更新任务；已有任务运行中时返回当前任务快照"""
    return await update_job_manager.start("pull")


@router.post("/reclone", status_code=202)
async def reclone_repo(body: RecloneRequest):
    """备份现有仓库并重新克隆（异步任务）"""
    if not body.confirm:
        raise HTTPException(status_code=400, detail="重新克隆需要确认（confirm=true）")
    return await update_job_manager.start("reclone")


@router.get("/progress")
async def get_update_progress():
    """当前/最近一次更新任务的进度与日志"""
    return update_job_manager.snapshot()


@router.get("/repo-status")
async def get_repo_status():
    """获取 coin11-tb 仓库克隆状态（保留给旧前端/脚本）"""
    from app.services.repo_manager import repo_manager

    if repo_manager is None:
        return {"status": "unknown", "error": "RepoManager 未初始化"}
    return {
        "status": repo_manager.status,
        "error": repo_manager.error_msg,
        "path": repo_manager.repo_path,
    }
