"""Entrypoint fails closed while upstream is unpinned (design §4.2)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from aifetchly_windows.entrypoint import BackendNotPinnedError, main, require_pinned_backend


def test_unpinned_lock_refuses_to_start() -> None:
    with pytest.raises(BackendNotPinnedError, match="P0-C"):
        require_pinned_backend()


def test_pinned_but_incomplete_lock_refuses() -> None:
    lock = {
        "status": "pinned",
        "selectedRevision": None,
        "pythonVersion": None,
    }
    path = Path(__file__).parent / "does-not-exist.json"
    path = path.with_name("_tmp-lock.json")
    path.write_text(json.dumps(lock))
    try:
        with pytest.raises(BackendNotPinnedError, match="selectedRevision"):
            require_pinned_backend(path)
    finally:
        path.unlink()


def test_main_exit_code_is_prerequisites_missing() -> None:
    assert main() == 3
