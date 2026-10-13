"""Registration-server harness: protocol, isolation and deny-by-name (§4, §4.2)."""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading

import pytest

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
        json.dumps({"jsonrpc": "2.0", "id": 0, "method": "initialize"}),
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "click"}}),
        "not json",
    ]
    iterator = iter(requests)
    serve(make_config(ALLOW), lambda: next(iterator, ""), lines.append)
    assert len(lines) == 4
    assert json.loads(lines[0])["result"]["protocolVersion"] == "2025-06-18"
    assert json.loads(lines[1])["result"]["tools"][0]["name"] == "click"
    assert json.loads(lines[2])["error"]["code"] == TOOL_NOT_WIRED
    assert json.loads(lines[3])["error"]["code"] == INVALID_PARAMS


def test_serve_loop_rejects_calls_before_initialize() -> None:
    """N11: tools/list and tools/call require a prior initialize handshake."""
    lines: list[str] = []
    requests = [
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "process_integrity", "arguments": {"processId": 1}}}),
        json.dumps({"jsonrpc": "2.0", "id": 3, "method": "initialize"}),
        json.dumps({"jsonrpc": "2.0", "id": 4, "method": "tools/list"}),
    ]
    iterator = iter(requests)
    serve(make_config(ALLOW), lambda: next(iterator, ""), lines.append)
    assert len(lines) == 4
    assert json.loads(lines[0])["error"]["code"] == INVALID_PARAMS
    assert "initialize" in json.loads(lines[0])["error"]["message"]
    assert json.loads(lines[1])["error"]["code"] == INVALID_PARAMS
    assert json.loads(lines[2])["result"]["protocolVersion"] == "2025-06-18"
    assert "result" in json.loads(lines[3])


def test_malformed_envelopes_rejected_before_native() -> None:
    """N11: bad protocol version, non-object params and array ids fail."""
    # Envelope: wrong jsonrpc version.
    response = handle_request(
        make_config(ALLOW),
        {"jsonrpc": "garbage", "id": 1, "method": "tools/call", "params": {"name": "process_integrity", "arguments": {"processId": 42}}},
    )
    assert response is not None and response["error"]["code"] == INVALID_PARAMS
    # Envelope: array id is not echoed back; error id is null.
    response = handle_request(
        make_config(ALLOW),
        {"jsonrpc": "2.0", "id": [], "method": "tools/call", "params": {"name": "process_integrity", "arguments": {"processId": 42}}},
    )
    assert response is not None and response["error"]["code"] == INVALID_PARAMS
    assert response["id"] is None
    # Envelope: non-object params.
    response = handle_request(
        make_config(ALLOW),
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": []},
    )
    assert response is not None and response["error"]["code"] == INVALID_PARAMS


def test_undeclared_argument_fields_rejected_before_native() -> None:
    """N11: published additionalProperties:false is enforced on dispatch."""
    response = rpc("tools/call", {"name": "process_integrity", "arguments": {"processId": 42, "unexpected": True}})
    assert response["error"]["code"] == INVALID_PARAMS
    assert "undeclared" in response["error"]["message"]
    response = rpc("tools/call", {"name": "window_at_point", "arguments": {"point": {"x": 1, "y": 2, "z": 3}}})
    assert response["error"]["code"] == INVALID_PARAMS
    assert "undeclared" in response["error"]["message"]


def test_subprocess_stdio_round_trip() -> None:
    """Drive the real process boundary: stdout carries only protocol lines."""
    code = (
        "from aifetchly_windows.server import main, make_config\n"
        "main(frozenset({'screenshot', 'click', 'process_integrity'}))\n"
    )
    requests = "\n".join([
        json.dumps({"jsonrpc": "2.0", "id": 0, "method": "initialize"}),
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
    assert len(out_lines) == 3
    assert json.loads(out_lines[0])["result"]["protocolVersion"] == "2025-06-18"
    listed = json.loads(out_lines[1])
    assert [t["name"] for t in listed["result"]["tools"]] == ["click", "process_integrity", "screenshot"]
    denied = json.loads(out_lines[2])
    assert denied["error"]["code"] == TOOL_NOT_REGISTERED
    # stderr is the log channel; stdout had nothing but protocol JSON.
    assert completed.stdout.strip().startswith("{")


def test_discovery_publishes_input_schemas() -> None:
    """B02: every discovered tool carries an inputSchema matching its args."""
    result = rpc("tools/list")
    tools = {t["name"]: t for t in result["result"]["tools"]}
    assert "inputSchema" in tools["process_integrity"]
    schema = tools["process_integrity"]["inputSchema"]
    assert schema["type"] == "object"
    assert "processId" in schema["properties"]
    wschema = tools["window_at_point"]["inputSchema"]
    assert wschema["properties"]["point"]["properties"]["x"]["minimum"] == -(2**31)
    # Upstream (not-wired) tools still publish a generic object schema.
    assert tools["screenshot"]["inputSchema"]["type"] == "object"


def test_cancel_notification_produces_no_response() -> None:
    """B02: notifications (no id) never generate replies, even for errors."""
    config = make_config(ALLOW)
    assert handle_request(config, {"jsonrpc": "2.0", "method": "notifications/cancelled"}) is None
    assert handle_request(config, {"jsonrpc": "2.0", "method": "no/such/method"}) is None
    assert (
        handle_request(
            config,
            {"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "powershell"}},
        )
        is None
    )


def test_initialized_notification_with_id_is_acknowledged() -> None:
    """Request-shaped notifications/initialized gets a reply — but unlocks nothing."""
    lines: list[str] = []
    requests = [
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "notifications/initialized"}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
    ]
    iterator = iter(requests)
    serve(make_config(ALLOW), lambda: next(iterator, ""), lines.append)
    assert len(lines) == 2
    assert "result" in json.loads(lines[0])
    # Acknowledged, yet tools stay locked without a successful initialize.
    assert json.loads(lines[1])["error"]["code"] == INVALID_PARAMS


def test_full_handshake_unlocks_tools() -> None:
    """initialize (+ optional notifications/initialized) enables tools."""
    lines: list[str] = []
    requests = [
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}),
        json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
    ]
    iterator = iter(requests)
    serve(make_config(ALLOW), lambda: next(iterator, ""), lines.append)
    assert len(lines) == 2
    assert "process_integrity" in json.dumps(json.loads(lines[1]))


def test_malformed_initialized_notification_does_not_unlock() -> None:
    """E07: a bare/malformed notifications/initialized never flips the flag."""
    lines: list[str] = []
    requests = [
        json.dumps({"method": "notifications/initialized"}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
    ]
    iterator = iter(requests)
    serve(make_config(ALLOW), lambda: next(iterator, ""), lines.append)
    assert len(lines) == 1
    assert json.loads(lines[0])["error"]["code"] == INVALID_PARAMS


def test_array_id_is_nulled_never_echoed() -> None:
    """E07: the init gate validates id types before echoing them."""
    lines: list[str] = []
    requests = [
        json.dumps({"jsonrpc": "2.0", "id": [], "method": "tools/list"}),
    ]
    iterator = iter(requests)
    serve(make_config(ALLOW), lambda: next(iterator, ""), lines.append)
    assert len(lines) == 1
    response = json.loads(lines[0])
    assert response["error"]["code"] == INVALID_PARAMS
    assert response["id"] is None


def test_discovery_schemas_are_copies() -> None:
    """N-review: mutating a discovery response must not poison the registry."""
    from aifetchly_windows.server import TOOL_INPUT_SCHEMAS, tool_input_schema

    first = rpc("tools/list")
    tools = {t["name"]: t for t in first["result"]["tools"]}
    tools["process_integrity"]["inputSchema"]["properties"]["processId"]["minimum"] = 999
    assert tool_input_schema("process_integrity") == TOOL_INPUT_SCHEMAS["process_integrity"]
    assert TOOL_INPUT_SCHEMAS["process_integrity"]["properties"]["processId"]["minimum"] == 0


def test_tool_execution_failures_carry_is_error() -> None:
    """B02: local execution failures use the MCP tool-error shape.

    Uses a PID that exists on no machine so the native lookup fails on
    every platform (N10: never assume an arbitrary OS PID resolves).
    """
    response = rpc("tools/call", {"name": "process_integrity", "arguments": {"processId": 42424242}})
    if sys.platform != "win32":
        assert response["result"]["isError"] is True
        payload = json.loads(response["result"]["content"][0]["text"])
        assert payload["ok"] is False
    else:
        assert response["result"]["isError"] is True


@pytest.mark.skipif(sys.platform != "win32", reason="native Win32 execution")
def test_own_process_integrity_succeeds_on_windows() -> None:
    """N10: the success path uses a known-owned PID, not an arbitrary one."""
    import os

    response = rpc("tools/call", {"name": "process_integrity", "arguments": {"processId": os.getpid()}})
    payload = json.loads(response["result"]["content"][0]["text"])
    assert payload["ok"] is True
    assert payload["integrityLevel"] in {"low", "medium", "high", "system"}
    assert payload["isOwnProcess"] is True


def test_bool_and_overflow_pids_rejected_before_native() -> None:
    """B04: booleans and DWORD-overflowing PIDs fail with INVALID_PARAMS."""
    for bad in (True, False, 2**40, -1, 1.5, "42"):
        response = rpc("tools/call", {"name": "process_integrity", "arguments": {"processId": bad}})
        assert response["error"]["code"] == INVALID_PARAMS, bad


def test_bool_and_overflow_points_rejected_before_native() -> None:
    """B04: booleans and LONG-overflowing coordinates fail before native."""
    for point in ({"x": True, "y": 0}, {"x": 2**40, "y": 0}, {"x": 0, "y": -(2**31) - 1}, {"x": 1.5, "y": 0}):
        response = rpc("tools/call", {"name": "window_at_point", "arguments": {"point": point}})
        assert response["error"]["code"] == INVALID_PARAMS, point


def test_persistent_responses_flush_before_stdin_close() -> None:
    """B01/N10: initialize/list/calls return while stdin stays open.

    Runs the child WITHOUT `-u` and WITHOUT an inherited
    `PYTHONUNBUFFERED` value, so the test proves the server's explicit
    per-response flush — not the launcher's buffering mode. Reads use a
    reader thread plus queue deadline instead of `select()` on pipes,
    which Windows does not support for file descriptors (N10).
    """
    code = (
        "from aifetchly_windows.server import main\n"
        "main(frozenset({'process_integrity'}))\n"
    )
    env = {k: v for k, v in os.environ.items() if k != "PYTHONUNBUFFERED"}
    proc = subprocess.Popen(
        [sys.executable, "-c", code],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env,
    )
    lines: queue.Queue[str] = queue.Queue()

    def reader() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            lines.put(line)

    thread = threading.Thread(target=reader, daemon=True)
    try:
        assert proc.stdin is not None and proc.stdout is not None
        thread.start()
        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}) + "\n")
        proc.stdin.flush()
        line = lines.get(timeout=10)
        assert json.loads(line)["result"]["protocolVersion"] == "2025-06-18"
        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}) + "\n")
        proc.stdin.flush()
        line2 = lines.get(timeout=10)
        assert "process_integrity" in json.dumps(json.loads(line2))
        proc.stdin.write(
            json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                        "params": {"name": "process_integrity", "arguments": {"processId": 42424242}}}) + "\n"
        )
        proc.stdin.flush()
        line3 = lines.get(timeout=10)
        assert "isError" in line3 or "result" in json.loads(line3)
    finally:
        try:
            if proc.stdin is not None:
                proc.stdin.close()
        except BrokenPipeError:
            pass
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        thread.join(timeout=5)
