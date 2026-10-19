"""update_job 单元测试 — 用假 git 操作验证分阶段进度、脏工作区中止、重新克隆。

不发起任何真实 git/网络操作。
"""

import asyncio
import contextlib
import os

from app.services import git_ops
from app.services import update_job as job_module
from app.services.update_job import UpdateJobManager

PREV = "aaaaaaaa1111"
LATEST = "bbbbbbbb2222"


class FakeVersionManager:
    def __init__(self, repo_path: str):
        self.repo_path = repo_path
        self.repo_url = "https://github.com/czl0325/coin11-tb.git"
        self.remembered: tuple | None = None

    def remember_pull_result(self, previous: str, current: str, branch: str) -> None:
        self.remembered = (previous, current, branch)


async def _finish(manager: UpdateJobManager) -> None:
    """等待任务结束（任务在事件循环里通过 create_task 启动）"""
    assert manager._task is not None
    await manager._task


def _patch_common(monkeypatch, tmp_path, state):
    monkeypatch.setattr(job_module.update_settings, "_cache", {"repo_url": "", "branch": ""})
    monkeypatch.setattr(git_ops, "is_git_repo", lambda path: True)
    monkeypatch.setattr(git_ops, "resolve_branch", _async("main"))
    monkeypatch.setattr(git_ops, "status_porcelain", _async(""))
    monkeypatch.setattr(git_ops, "get_head_commit", _async_state(state))
    monkeypatch.setattr(git_ops, "get_remote_commit", _async(LATEST))
    monkeypatch.setattr(git_ops, "fetch", _async(("", "", 0)))
    monkeypatch.setattr(git_ops, "count_commits_behind", _async(3))
    monkeypatch.setattr(git_ops, "list_commit_messages", _async(["feat: a", "fix: b"]))


def _async(value):
    async def fake(*args, **kwargs):
        return value

    return fake


def _async_state(state):
    async def fake(*args, **kwargs):
        return state["head"]

    return fake


async def test_pull_success_reports_progress_and_result(monkeypatch, tmp_path):
    state = {"head": PREV}
    _patch_common(monkeypatch, tmp_path, state)

    async def fake_pull(repo_path, branch, timeout=60, ff_only=False):
        assert ff_only is True, "更新任务应只允许快进合并，避免在脚本仓库产生 merge commit"
        state["head"] = LATEST
        return ("Updating aaaaaaaa..bbbbbbbb\nFast-forward\n", "", 0)

    monkeypatch.setattr(git_ops, "pull", fake_pull)

    manager = UpdateJobManager(FakeVersionManager(str(tmp_path)))
    start = await manager.start("pull")
    assert start["started"] is True
    assert start["job"]["status"] == "running"

    await _finish(manager)
    snapshot = manager.snapshot()

    assert snapshot["status"] == "success"
    assert snapshot["progress"] == 100
    assert snapshot["commits_pulled"] == 3
    assert snapshot["current_commit"] == LATEST
    assert snapshot["previous_commit"] == PREV
    assert any("git pull --ff-only" in line["text"] for line in snapshot["logs"])
    assert manager.job.result is not None
    assert manager.job.result["success"] is True


async def test_pull_aborts_on_dirty_worktree(monkeypatch, tmp_path):
    state = {"head": PREV}
    _patch_common(monkeypatch, tmp_path, state)
    monkeypatch.setattr(git_ops, "status_porcelain", _async(" M 2026淘金币618活动.py\n?? notes.txt"))

    pull_called = {"value": False}

    async def fake_pull(*args, **kwargs):
        pull_called["value"] = True
        return ("", "", 0)

    monkeypatch.setattr(git_ops, "pull", fake_pull)

    manager = UpdateJobManager(FakeVersionManager(str(tmp_path)))
    await manager.start("pull")
    await _finish(manager)

    snapshot = manager.snapshot()
    assert snapshot["status"] == "error"
    assert "未提交的本地修改" in snapshot["message"]
    assert pull_called["value"] is False
    # 日志里要能看到具体是哪些文件，便于用户处理
    assert any("2026淘金币618活动.py" in line["text"] for line in snapshot["logs"])


async def test_pull_reports_fetch_failure(monkeypatch, tmp_path):
    state = {"head": PREV}
    _patch_common(monkeypatch, tmp_path, state)
    monkeypatch.setattr(git_ops, "fetch", _async(("", "Could not resolve host: github.com", 128)))

    manager = UpdateJobManager(FakeVersionManager(str(tmp_path)))
    await manager.start("pull")
    await _finish(manager)

    snapshot = manager.snapshot()
    assert snapshot["status"] == "error"
    assert "Could not resolve host" in snapshot["message"]


async def test_pull_no_update(monkeypatch, tmp_path):
    state = {"head": PREV}
    _patch_common(monkeypatch, tmp_path, state)
    monkeypatch.setattr(git_ops, "count_commits_behind", _async(0))

    manager = UpdateJobManager(FakeVersionManager(str(tmp_path)))
    await manager.start("pull")
    await _finish(manager)

    snapshot = manager.snapshot()
    assert snapshot["status"] == "success"
    assert snapshot["progress"] == 100
    assert snapshot["commits_pulled"] == 0
    assert "已是最新" in snapshot["message"]


async def test_start_is_idempotent_while_running(monkeypatch, tmp_path):
    state = {"head": PREV}
    _patch_common(monkeypatch, tmp_path, state)

    async def slow_pull(*args, **kwargs):
        await asyncio.sleep(0.5)
        return ("", "", 0)

    monkeypatch.setattr(git_ops, "pull", slow_pull)

    manager = UpdateJobManager(FakeVersionManager(str(tmp_path)))
    first = await manager.start("pull")
    second = await manager.start("pull")

    assert first["started"] is True
    assert second["started"] is False
    assert second["reason"] == "already_running"

    # 收尾，避免留下未完成的任务
    manager._task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await manager._task


async def test_reclone_backs_up_old_directory(monkeypatch, tmp_path):
    repo = tmp_path / "coin11_tb"
    repo.mkdir()
    (repo / "old.py").write_text("print(1)", encoding="utf-8")

    monkeypatch.setattr(job_module.update_settings, "_cache", {"repo_url": "", "branch": ""})
    monkeypatch.setattr(git_ops, "resolve_branch", _async("main"))
    monkeypatch.setattr(git_ops, "get_head_commit", _async(LATEST))

    async def fake_disable(repo_path):
        return None

    async def fake_clone(url, repo_path, timeout=300):
        os.makedirs(repo_path, exist_ok=True)
        with open(os.path.join(repo_path, "fresh.py"), "w", encoding="utf-8") as f:
            f.write("print(2)")
        return ("", "", 0)

    monkeypatch.setattr(git_ops, "disable_file_mode", fake_disable)
    monkeypatch.setattr(git_ops, "clone", fake_clone)

    import app.services.repo_manager as rm

    monkeypatch.setattr(rm, "repo_manager", None)

    manager = UpdateJobManager(FakeVersionManager(str(repo)))
    await manager.start("reclone")
    await _finish(manager)

    snapshot = manager.snapshot()
    assert snapshot["status"] == "success", snapshot["message"]
    assert (repo / "fresh.py").exists()
    backups = list(tmp_path.glob("coin11_tb.bak-*"))
    assert len(backups) == 1
    assert (backups[0] / "old.py").exists()
    assert snapshot["result"]["backup_path"].endswith(backups[0].name)
