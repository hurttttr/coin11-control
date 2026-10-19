"""update_settings 单元测试 — 仓库地址/分支校验与持久化（不触碰真实网络/git）。"""

import json

import pytest

from app.services import update_settings as module
from app.services.update_settings import (
    UpdateSettingsError,
    UpdateSettingsStore,
    normalize_branch,
    normalize_repo_url,
)

# ---------- 仓库地址校验 ----------


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/czl0325/coin11-tb.git",
        "http://git.example.com/group/repo.git",
        "ssh://git@github.com/czl0325/coin11-tb.git",
        "git@github.com:czl0325/coin11-tb.git",
    ],
)
def test_repo_url_accepts_supported_forms(url):
    assert normalize_repo_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ext::sh -c whoami",
        "-oProxyCommand=touch /tmp/pwn",
        "https://github.com/a b/repo.git",
        "ftp://example.com/repo.git",
        "https://github.com",
    ],
)
def test_repo_url_rejects_unsafe_or_incomplete(url):
    with pytest.raises(UpdateSettingsError):
        normalize_repo_url(url)


def test_repo_url_empty_means_use_default():
    assert normalize_repo_url("   ") == ""


# ---------- 分支校验 ----------


@pytest.mark.parametrize("branch", ["main", "master", "release/1.2", "feat_foo"])
def test_branch_accepts_normal_names(branch):
    assert normalize_branch(branch) == branch


@pytest.mark.parametrize("branch", ["-x", "a..b", "a//b", "feat/", ".hidden", "bad.lock"])
def test_branch_rejects_invalid_names(branch):
    with pytest.raises(UpdateSettingsError):
        normalize_branch(branch)


def test_branch_empty_means_auto_detect():
    assert normalize_branch("") == ""


# ---------- 持久化 ----------


def test_save_and_reload(tmp_path, monkeypatch):
    settings_file = tmp_path / "update_settings.json"
    monkeypatch.setattr(module, "SETTINGS_FILE", str(settings_file))

    store = UpdateSettingsStore()
    store.save("git@github.com:owner/repo.git", "release/1.2")

    assert json.loads(settings_file.read_text(encoding="utf-8")) == {
        "repo_url": "git@github.com:owner/repo.git",
        "branch": "release/1.2",
    }

    # 新实例从磁盘读回
    reloaded = UpdateSettingsStore()
    assert reloaded.repo_url == "git@github.com:owner/repo.git"
    assert reloaded.branch == "release/1.2"


def test_invalid_value_is_not_written(tmp_path, monkeypatch):
    settings_file = tmp_path / "update_settings.json"
    monkeypatch.setattr(module, "SETTINGS_FILE", str(settings_file))

    store = UpdateSettingsStore()
    with pytest.raises(UpdateSettingsError):
        store.save("file:///etc/passwd", "main")
    assert not settings_file.exists()


def test_corrupted_file_falls_back_to_default(tmp_path, monkeypatch):
    settings_file = tmp_path / "update_settings.json"
    settings_file.write_text("{not json", encoding="utf-8")
    monkeypatch.setattr(module, "SETTINGS_FILE", str(settings_file))

    store = UpdateSettingsStore()
    assert store.get() == {"repo_url": "", "branch": ""}
