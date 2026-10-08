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


def test_resources_resolve_from_environment_override(tmp_path, monkeypatch) -> None:
    # B14: an installed wheel resolves resources from packaged data or the
    # explicit env override — not only the source-checkout layout.
    from aifetchly_windows import entrypoint

    lock = {"status": "pinned", "selectedRevision": "r1", "pythonVersion": "3.14.1"}
    (tmp_path / "upstream.lock").write_text(json.dumps(lock))
    (tmp_path / "tool-allowlist.json").write_text(
        json.dumps({"version": 1, "policy": "deny-by-default", "allow": ["click"], "deny": []})
    )
    monkeypatch.setenv("AIFETCHLY_WINDOWS_RESOURCES", str(tmp_path))
    allow = entrypoint.require_pinned_backend()
    assert "click" in allow


def test_missing_resources_are_typed_prerequisite_failures(tmp_path, monkeypatch) -> None:
    from aifetchly_windows import entrypoint

    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setenv("AIFETCHLY_WINDOWS_RESOURCES", str(empty))
    monkeypatch.setattr(entrypoint, "PACKAGE_ROOT", empty)  # checkout fallback gone too
    with pytest.raises(entrypoint.ResourcesUnavailableError, match="upstream.lock"):
        entrypoint.load_upstream_lock()
    assert entrypoint.main() == 3  # no traceback, typed failure only


def test_pinned_entrypoint_serves_stdio(tmp_path, monkeypatch) -> None:
    # M02/M03: with a complete pin the entrypoint runs the registration
    # server; upstream tools answer not-wired and hidden tools are denied.
    import json
    import subprocess
    import sys as _sys


    lock = {
        "status": "pinned",
        "selectedRevision": "r1",
        "pythonVersion": "3.14.4",
        "sourceSha256": "b" * 64,
        "component": "windows-mcp-backend",
        "upstream": "https://example/Windows-MCP",
    }
    (tmp_path / "upstream.lock").write_text(json.dumps(lock))
    (tmp_path / "tool-allowlist.json").write_text(
        json.dumps({"version": 1, "policy": "deny-by-default",
                    "allow": ["screenshot", "process_integrity"], "deny": ["powershell"]})
    )
    monkeypatch.setenv("AIFETCHLY_WINDOWS_RESOURCES", str(tmp_path))
    code = (
        "from aifetchly_windows.entrypoint import main\n"
        "import sys\n"
        "sys.exit(main())\n"
    )
    requests = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}) + "\n"
    completed = subprocess.run(
        [_sys.executable, "-c", code], input=requests, capture_output=True, text=True, timeout=30, check=False
    )
    assert completed.returncode == 0
    listed = json.loads(completed.stdout.strip())
    assert [t["name"] for t in listed["result"]["tools"]] == ["process_integrity", "screenshot"]
