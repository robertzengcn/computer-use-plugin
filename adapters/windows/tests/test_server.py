"""Registration-server harness: protocol, isolation and deny-by-name (§4, §4.2)."""

from __future__ import annotations

import json
import subprocess
import sys

from aifetchly_windows.server import (
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    TOOL_NOT_REGISTERED,
    TOOL_NOT_WIRED,
    handle_request,
    make_config,
    serve,
)

ALLOW = frozenset({"screenshot", "click", "type_text", "process_integrity", "window_at_point"})


def rpc(method: str, params: dict | None = None, request_id: int | object = 1) -> dict:
    return handle_request(make_config(ALLOW), {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}})


def test_initialize_reports_protocol_and_server() -> None:
    result = rpc("initialize")
    assert result["result"]["protocolVersion"] == "2025-06-18"
    assert result["result"]["serverInfo"]["name"] == "aifetchly-windows"


def test_discovery_lists_only_the_reviewed_subset_sorted() -> None:
    result = rpc("tools/list")
    names = [t["name"] for t in result["result"]["tools"]]
    assert names == sorted(ALLOW)


def test_hidden_tools_fail_by_name_even_when_invoked_directly() -> None:
    for forbidden in ("powershell", "registry_write", "start_process"):
        response = rpc("tools/call", {"name": forbidden})
        assert response["error"]["code"] == TOOL_NOT_REGISTERED
        assert forbidden in response["error"]["message"]


def test_upstream_tools_are_declared_but_not_wired_without_the_pin() -> None:
    response = rpc("tools/call", {"name": "screenshot"})
    assert response["error"]["code"] == TOOL_NOT_WIRED
    assert "pinned upstream" in response["error"]["message"]


def test_local_extension_requires_typed_params() -> None:
    response = rpc("tools/call", {"name": "process_integrity", "arguments": {"processId": "x"}})
    assert response["error"]["code"] == INVALID_PARAMS


def test_local_extension_off_windows_returns_typed_json_not_crash() -> None:
    response = rpc("tools/call", {"name": "process_integrity", "arguments": {"processId": 42}})
    payload = json.loads(response["result"]["content"][0]["text"])
    if sys.platform != "win32":
        assert payload["ok"] is False
        assert payload["errorCode"] == "unsupported_platform_or_access"
    else:
        assert payload["ok"] is True
        assert payload["integrityLevel"] in {"low", "medium", "high", "system"}


def test_unknown_method_is_typed() -> None:
    response = rpc("resources/list")
    assert response["error"]["code"] == METHOD_NOT_FOUND


def test_notifications_produce_no_response() -> None:
    assert handle_request(make_config(ALLOW), {"jsonrpc": "2.0", "method": "notifications/initialized"}) is None


def test_internal_errors_carry_no_traceback() -> None:
    # Malformed top-level types produce safe messages, never argv/paths.
    bad = handle_request(make_config(ALLOW), [1, 2, 3])
    assert bad["error"]["code"] == INVALID_PARAMS


def test_serve_loop_is_newline_jsonrpc() -> None:
    lines: list[str] = []
    requests = [
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "click"}}),
        "not json",
    ]
    iterator = iter(requests)
    serve(make_config(ALLOW), lambda: next(iterator, ""), lines.append)
    assert len(lines) == 3
    assert json.loads(lines[0])["result"]["tools"][0]["name"] == "click"
    assert json.loads(lines[1])["error"]["code"] == TOOL_NOT_WIRED
    assert json.loads(lines[2])["error"]["code"] == INVALID_PARAMS


def test_subprocess_stdio_round_trip() -> None:
    """Drive the real process boundary: stdout carries only protocol lines."""
    code = (
        "from aifetchly_windows.server import main, make_config\n"
        "main(frozenset({'screenshot', 'click', 'process_integrity'}))\n"
    )
    requests = "\n".join([
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "powershell"}}),
    ]) + "\n"
    completed = subprocess.run(
        [sys.executable, "-c", code],
        input=requests,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert completed.returncode == 0
    out_lines = [line for line in completed.stdout.strip().splitlines() if line]
    assert len(out_lines) == 2
    listed = json.loads(out_lines[0])
    assert [t["name"] for t in listed["result"]["tools"]] == ["click", "process_integrity", "screenshot"]
    denied = json.loads(out_lines[1])
    assert denied["error"]["code"] == TOOL_NOT_REGISTERED
    # stderr is the log channel; stdout had nothing but protocol JSON.
    assert completed.stdout.strip().startswith("{")
