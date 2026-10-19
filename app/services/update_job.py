"""带进度的异步更新任务。

旧实现是一个同步 POST，前端只能转圈干等：看不到进度，失败原因也拿不到，
刷新页面后状态全丢。这里把 git 更新拆成 prepare/fetch/compare/pull/finish
几个阶段，状态与日志留在后端进程内，前端按固定间隔轮询 —— 刷新页面后
仍能接上正在进行的任务。

注意：任务状态是进程内内存，后端重启会丢失（更新本身可安全重试）。
"""

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime

from app.services import git_ops
from app.services.update_settings import update_settings
from app.services.version_manager import VersionManager, version_manager

logger = logging.getLogger(__name__)

_MAX_LOGS = 300

# (stage, 展示文案, 该阶段进度上限)
_STAGE_PREPARE = ("prepare", "检查仓库状态", 8)
_STAGE_FETCH = ("fetch", "拉取远程引用", 35)
_STAGE_COMPARE = ("compare", "比对提交差异", 50)
_STAGE_PULL = ("pull", "合并远程更新", 92)
_STAGE_FINISH = ("finish", "校验更新结果", 100)

_STAGE_RENAME = ("prepare", "备份现有仓库", 20)
_STAGE_CLONE = ("clone", "克隆仓库", 90)


def _now_iso() -> str:
    return datetime.now().isoformat()


def _redact_url(url: str) -> str:
    """日志中隐藏 URL 内嵌的凭据（https://user:token@host/... → https://***@host/...）"""
    return re.sub(r"//[^/@]+@", "//***@", url or "")


class UpdateJob:
    """一次更新任务的完整状态（可变，由 UpdateJobManager 驱动）"""

    def __init__(self) -> None:
        self.id = ""
        self.mode = ""  # pull | reclone
        self.status = "idle"  # idle | running | success | error
        self.stage = ""
        self.stage_label = ""
        self.progress = 0
        self.progress_cap = 0
        self.message = ""
        self.branch = ""
        self.previous_commit = ""
        self.current_commit = ""
        self.commits_pulled = 0
        self.started_at: str | None = None
        self.finished_at: str | None = None
        self.logs: list[dict] = []
        self.result: dict | None = None

    # ---------- 状态写入 ----------

    def begin(self, mode: str) -> None:
        self.id = uuid.uuid4().hex[:12]
        self.mode = mode
        self.status = "running"
        self.stage = "prepare"
        self.stage_label = "准备更新"
        self.progress = 1
        self.progress_cap = 5
        self.started_at = _now_iso()

    def set_stage(self, stage: str, label: str, cap: int) -> None:
        self.stage = stage
        self.stage_label = label
        self.progress = max(self.progress, min(cap, self.progress + 1))
        self.progress_cap = cap

    def log(self, text: str, level: str = "info") -> None:
        line = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "level": level,
            "text": text,
        }
        self.logs.append(line)
        if len(self.logs) > _MAX_LOGS:
            del self.logs[: len(self.logs) - _MAX_LOGS]

        if level == "error":
            logger.error("[update] %s", text)
        elif level == "warning":
            logger.warning("[update] %s", text)
        else:
            logger.info("[update] %s", text)

    def succeed(self, message: str, result: dict) -> None:
        self.status = "success"
        self.stage = "done"
        self.stage_label = "更新完成"
        self.progress = 100
        self.progress_cap = 100
        self.message = message
        self.result = result
        self.finished_at = _now_iso()
        self.log(message, "success")

    def fail(self, message: str) -> None:
        self.status = "error"
        self.stage = "error"
        self.stage_label = "更新失败"
        self.message = message
        self.result = {
            "success": False,
            "message": message,
            "pulled_commits": [],
            "previous_commit": self.previous_commit,
            "current_commit": self.current_commit,
            "commits_pulled": 0,
        }
        self.finished_at = _now_iso()
        self.log(message, "error")

    # ---------- 序列化 ----------

    def elapsed_seconds(self) -> float:
        if not self.started_at:
            return 0.0
        try:
            start = datetime.fromisoformat(self.started_at)
            end = datetime.fromisoformat(self.finished_at) if self.finished_at else datetime.now()
            return round(max(0.0, (end - start).total_seconds()), 1)
        except ValueError:
            return 0.0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "mode": self.mode,
            "status": self.status,
            "stage": self.stage,
            "stage_label": self.stage_label,
            "progress": self.progress,
            "message": self.message,
            "branch": self.branch,
            "previous_commit": self.previous_commit,
            "current_commit": self.current_commit,
            "commits_pulled": self.commits_pulled,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "elapsed_seconds": self.elapsed_seconds(),
            "logs": list(self.logs),
            "result": self.result,
        }


class UpdateJobManager:
    """更新任务编排：同一时刻只允许一个任务运行"""

    def __init__(self, version_mgr: VersionManager):
        self._vm = version_mgr
        self._job = UpdateJob()
        self._task: asyncio.Task | None = None

    @property
    def job(self) -> UpdateJob:
        return self._job

    def snapshot(self) -> dict:
        return self._job.to_dict()

    @property
    def running(self) -> bool:
        return self._job.status == "running"

    async def start(self, mode: str = "pull") -> dict:
        """启动任务；已有任务在跑时原样返回当前进度（不重复启动）"""
        if self._task is not None and not self._task.done():
            return {"started": False, "reason": "already_running", "job": self.snapshot()}

        self._job = UpdateJob()
        self._job.begin(mode)
        self._task = asyncio.create_task(self._run(self._job, mode))
        return {"started": True, "reason": "", "job": self.snapshot()}

    # ---------- 内部执行 ----------

    async def _run(self, job: UpdateJob, mode: str) -> None:
        ticker = asyncio.create_task(self._tick(job))
        try:
            if mode == "reclone":
                await self._run_reclone(job)
            else:
                await self._run_pull(job)
        except asyncio.CancelledError:  # pragma: no cover - 进程退出时的兜底
            job.fail("更新任务被取消")
            raise
        except Exception as e:  # noqa: BLE001 - 任何异常都要落进任务状态供前端展示
            logger.exception("[update] 任务异常")
            job.fail(f"更新任务异常: {e}")
        finally:
            ticker.cancel()

    async def _tick(self, job: UpdateJob) -> None:
        """阶段内缓慢推进进度，让长耗时的 git 调用期间进度条仍在动"""
        while job.status == "running":
            await asyncio.sleep(1)
            if job.progress < job.progress_cap:
                job.progress = min(job.progress_cap, job.progress + 1)

    def _fail_dirty(self, job: UpdateJob, dirty: str) -> None:
        files = [line.strip() for line in dirty.splitlines() if line.strip()][:8]
        job.log("检测到未提交的本地修改：", "warning")
        for line in files:
            job.log(f"  {line}", "warning")
        job.fail(
            "仓库存在未提交的本地修改，已中止更新以免覆盖。"
            "请先提交或撤销这些文件，或在版本页「重新克隆」仓库。"
        )

    async def _run_pull(self, job: UpdateJob) -> None:
        repo = self._vm.repo_path
        job.log(f"仓库路径: {repo}")
        job.log(f"仓库地址: {_redact_url(self._vm.repo_url)}")

        job.set_stage(*_STAGE_PREPARE)
        if not git_ops.is_git_repo(repo):
            job.fail("任务脚本目录不是 Git 仓库，请使用「重新克隆仓库」初始化")
            return

        branch = await git_ops.resolve_branch(repo, update_settings.branch)
        job.branch = branch
        source = "设置指定" if update_settings.branch else "自动探测"
        job.log(f"目标分支: {branch}（{source}）")

        previous = await git_ops.get_head_commit(repo)
        job.previous_commit = previous
        if not previous:
            job.fail("无法读取本地提交，仓库可能不完整，请重新克隆")
            return
        job.log(f"当前提交: {previous[:8]}")

        dirty = await git_ops.status_porcelain(repo)
        if dirty:
            self._fail_dirty(job, dirty)
            return
        job.log("工作区干净，可以安全更新")

        # ---- fetch ----
        job.set_stage(*_STAGE_FETCH)
        job.log(f"$ git fetch origin {branch}")
        out, err, rc = await git_ops.fetch(repo, branch, timeout=120)
        if rc != 0:
            job.fail(
                "拉取远程引用失败："
                + (err or out or "未知错误，请检查网络或仓库地址")
            )
            return
        job.log("远程引用已更新")

        # ---- compare ----
        job.set_stage(*_STAGE_COMPARE)
        remote = await git_ops.get_remote_commit(repo, branch)
        if not remote:
            job.fail(f"远端分支 {branch} 不存在，请检查仓库地址或分支设置")
            return
        job.log(f"远端提交: {remote[:8]}")

        behind = await git_ops.count_commits_behind(repo, previous, branch)
        job.log(f"落后远端 {behind} 个提交")
        if behind == 0:
            job.commits_pulled = 0
            job.current_commit = previous
            job.succeed(
                "已是最新版本，无需更新",
                {
                    "success": True,
                    "message": "已是最新版本，无需更新",
                    "pulled_commits": [],
                    "previous_commit": previous,
                    "current_commit": previous,
                    "commits_pulled": 0,
                },
            )
            return

        messages = await git_ops.list_commit_messages(repo, previous, branch)
        for line in messages[:20]:
            job.log(f"  {line}")
        if len(messages) > 20:
            job.log(f"  ... 其余 {len(messages) - 20} 个提交已省略")

        # ---- pull（只允许快进，避免在脚本仓库里产生合并提交）----
        job.set_stage(*_STAGE_PULL)
        job.log(f"$ git pull --ff-only origin {branch}")
        out, err, rc = await git_ops.pull(repo, branch, timeout=180, ff_only=True)
        for line in (out or "").splitlines():
            if line.strip():
                job.log(f"  {line}")
        # git 会把进度/摘要写到 stderr（即使成功），成功时按 info 记录，避免满屏"警告"
        stderr_level = "info" if rc == 0 else "warning"
        for line in (err or "").splitlines():
            if line.strip():
                job.log(f"  {line}", stderr_level)
        if rc != 0:
            job.fail(
                "合并更新失败："
                + (
                    err
                    or out
                    or "本地分支可能已与远端分叉，建议在版本页「重新克隆」仓库"
                )
            )
            return

        # ---- finish ----
        job.set_stage(*_STAGE_FINISH)
        current = await git_ops.get_head_commit(repo)
        job.current_commit = current
        job.commits_pulled = behind
        self._vm.remember_pull_result(previous, current, branch)

        message = f"更新完成：{previous[:8]} → {current[:8]}（{behind} 个提交）"
        job.succeed(
            message,
            {
                "success": True,
                "message": message,
                "pulled_commits": list(messages[:20]),
                "previous_commit": previous,
                "current_commit": current,
                "commits_pulled": behind,
            },
        )

    async def _run_reclone(self, job: UpdateJob) -> None:
        """重新克隆：旧目录改名备份（不删除），克隆失败时自动回滚"""
        import app.services.repo_manager as rm

        repo = self._vm.repo_path
        url = self._vm.repo_url
        job.log(f"仓库路径: {repo}")
        job.log(f"仓库地址: {_redact_url(url)}")

        job.set_stage(*_STAGE_RENAME)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = ""
        if os.path.isdir(repo):
            backup = f"{repo}.bak-{stamp}"
            try:
                await asyncio.to_thread(os.rename, repo, backup)
            except OSError as e:
                job.fail(f"备份现有仓库失败（可能有程序正在占用）: {e}")
                return
            job.log(f"已备份旧仓库: {backup}")

        job.set_stage(*_STAGE_CLONE)
        job.log(f"$ git clone {url} {repo}")
        out, err, rc = await git_ops.clone(url, repo, timeout=300)
        if rc != 0:
            failed_dir = ""
            if os.path.isdir(repo):
                failed_dir = f"{repo}.failed-{stamp}"
                try:
                    await asyncio.to_thread(os.rename, repo, failed_dir)
                except OSError:
                    failed_dir = ""
            if backup and not os.path.isdir(repo):
                try:
                    await asyncio.to_thread(os.rename, backup, repo)
                    job.log("已回滚到更新前的仓库", "warning")
                    backup = ""
                except OSError:
                    job.log("回滚失败，原仓库保留在备份目录", "error")
            if rm.repo_manager is not None and os.path.isdir(repo):
                rm.repo_manager._status = "ready"  # noqa: SLF001 - 同模块内维护状态
            detail = err or out or "git clone 返回非零退出码"
            if failed_dir:
                job.fail(f"克隆失败：{detail}（残留目录: {failed_dir}）")
            else:
                job.fail(f"克隆失败：{detail}")
            return

        await git_ops.disable_file_mode(repo)
        branch = await git_ops.resolve_branch(repo, update_settings.branch)
        current = await git_ops.get_head_commit(repo)
        job.branch = branch
        job.current_commit = current
        job.log(f"克隆完成，当前分支 {branch}，提交 {current[:8] or '(未知)'}")

        if rm.repo_manager is not None:
            rm.repo_manager.repo_url = url
            rm.repo_manager._status = "ready"  # noqa: SLF001
            rm.repo_manager._error_msg = ""  # noqa: SLF001

        self._vm.remember_pull_result("", current, branch)

        message = f"仓库已重新克隆（{branch} @ {current[:8] or 'unknown'}）"
        job.succeed(
            message,
            {
                "success": True,
                "message": message,
                "pulled_commits": [],
                "previous_commit": "",
                "current_commit": current,
                "commits_pulled": 0,
                "backup_path": backup,
            },
        )


# 全局单例
update_job_manager = UpdateJobManager(version_manager)
