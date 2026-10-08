"""Reviewed-subset stdio registration server (design §4, §4.2, CU-PLUGIN-05).

Implements the plugin-owned registration surface: JSON-RPC over stdin/stdout
with initialize / tools/list / tools/call, deny-by-name allowlist enforcement
on BOTH discovery and dispatch, stdout reserved for protocol, logs on stderr.
Local implementations exist only for the plugin-added read-only extensions
(process_integrity, window_at_point); upstream-pinned tools are declared but
return a typed not-wired error until the P0-C pin selects the integration
strategy (extension module vs patched fork) — this server never starts a
second server behind the upstream one.

The loop is pure and transport-testable: the harness feeds requests and reads
responses, so registration/dispatch isolation is proven without Windows.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass

PROTOCOL_VERSION = "2025-06-18"
JSONRPC_VERSION = "2.0"


class DispatchError(Exception):
    """Typed tools/call failure with a safe message."""

    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code


# JSON-RPC error codes we use.
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
TOOL_NOT_REGISTERED = -32001  # deny-by-name: not in the reviewed allowlist
TOOL_NOT_WIRED = -32002  # reviewed but requires the pinned upstream backend


@dataclass(frozen=True)
class ServerConfig:
    backend_version: str
    allowlist: frozenset[str]
    """Tools implemented locally by this package (read-only extensions)."""
    local_tools: frozenset[str]
    """Reviewed tools whose implementation comes from the pinned upstream."""
    upstream_tools: frozenset[str]


def make_config(allowlist: frozenset[str]) -> ServerConfig:

    local = frozenset({"process_integrity", "window_at_point"})
    return ServerConfig(
        backend_version="0.1.0",
        allowlist=allowlist,
        local_tools=local & allowlist,
        upstream_tools=allowlist - local,
    )


def handle_request(config: ServerConfig, request: object) -> dict[str, object] | None:
    """Handle one JSON-RPC request object; None for notifications."""
    if not isinstance(request, dict):
        return _error(None, INVALID_PARAMS, "request must be an object")
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params") if isinstance(request.get("params"), dict) else {}
    if not isinstance(method, str):
        return _error(request_id, INVALID_PARAMS, "method must be a string")

    try:
        result = _dispatch(config, method, params)
    except DispatchError as error:
        return _error(request_id, error.code, str(error))
    except Exception as error:  # noqa: BLE001 - boundary: typed, safe message
        # No traceback/argv/paths in protocol output (design §3.3).
        return _error(request_id, INTERNAL_ERROR, f"internal error: {type(error).__name__}")

    if "id" not in request:
        return None  # notification
    return {"jsonrpc": JSONRPC_VERSION, "id": request_id, "result": result}


def _dispatch(config: ServerConfig, method: str, params: Mapping[str, object]) -> object:
    if method == "initialize":
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "aifetchly-windows", "version": config.backend_version},
        }
    if method == "notifications/initialized":
        return None
    if method == "tools/list":
        # Discovery is allowlist-filtered: hidden tools never appear.
        return {"tools": [{"name": name} for name in sorted(config.allowlist)]}
    if method == "tools/call":
        name = params.get("name")
        if not isinstance(name, str):
            raise DispatchError(INVALID_PARAMS, "tools/call requires a string tool name")
        if name not in config.allowlist:
            # Deny-by-name even when called explicitly (design §4).
            raise DispatchError(
                TOOL_NOT_REGISTERED,
                f"tool '{name}' is not in the reviewed allowlist",
            )
        if name in config.upstream_tools:
            raise DispatchError(
                TOOL_NOT_WIRED,
                f"tool '{name}' requires the pinned upstream backend (P0-C); "
                "no floating dependency is started",
            )
        return _call_local(name, params)
    raise DispatchError(METHOD_NOT_FOUND, f"unknown method '{method}'")


def _call_local(name: str, params: Mapping[str, object]) -> object:
    from . import integrity, window_at_point

    arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
    if name == "process_integrity":
        process_id = arguments.get("processId")
        if not isinstance(process_id, int) or isinstance(process_id, bool) or process_id < 0:
            raise DispatchError(INVALID_PARAMS, "process_integrity requires integer processId >= 0")
        try:
            report = integrity.process_integrity(process_id, integrity.CtypesWinApi())
        except integrity.IntegrityError as error:
            return {"content": [{"type": "text", "text": json.dumps({
                "ok": False, "errorCode": "unsupported_platform_or_access",
                "message": str(error),
            })}]}
        return {"content": [{"type": "text", "text": json.dumps({
            "ok": True,
            "processId": report.process_id,
            "integrityLevel": report.integrity_level,
            "isOwnProcess": report.is_own_process,
        })}]}
    if name == "window_at_point":
        point = arguments.get("point")
        if not isinstance(point, dict) or not isinstance(point.get("x"), int) or not isinstance(point.get("y"), int):
            raise DispatchError(INVALID_PARAMS, "window_at_point requires point {x, y} integers")
        try:
            result = window_at_point.resolve_window_at_point(
                window_at_point.DesktopPoint(point["x"], point["y"]),
                window_at_point.CtypesWindowApi(),
            )
        except window_at_point.WindowAtPointError as error:
            return {"content": [{"type": "text", "text": json.dumps({
                "ok": False, "errorCode": "no_window_or_owner", "message": str(error),
            })}]}
        return {"content": [{"type": "text", "text": json.dumps({
            "ok": True,
            "windowHandle": result.window_handle,
            "processId": result.process_id,
            "isOwnProcess": result.is_own_process,
        })}]}
    raise DispatchError(TOOL_NOT_WIRED, f"tool '{name}' is not wired in this build")


def _error(request_id: object, code: int, message: str) -> dict[str, object]:
    return {
        "jsonrpc": JSONRPC_VERSION,
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def serve(config: ServerConfig, read_line: Callable[[], str], write_line: Callable[[str], None]) -> None:
    """Newline-delimited JSON-RPC loop. stdout stays protocol-only (§1.3)."""
    for line in iter(read_line, ""):
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            write_line(json.dumps(_error(None, INVALID_PARAMS, "malformed JSON line")))
            continue
        if isinstance(request, list):
            responses = [handle_request(config, item) for item in request]
            responses = [r for r in responses if r is not None]
            if responses:
                write_line(json.dumps(responses))
        else:
            response = handle_request(config, request)
            if response is not None:
                write_line(json.dumps(response))


def main(allowlist: frozenset[str] | None = None) -> int:
    """Run the stdio loop against real stdin/stdout (used by the harness)."""
    if allowlist is None:
        from .allowlist import load_allowlist
        from .entrypoint import _find_resource

        allowlist = load_allowlist(_find_resource("tool-allowlist.json"))
    serve(
        make_config(allowlist),
        sys.stdin.readline,
        lambda payload: sys.stdout.write(payload + "\n"),
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
