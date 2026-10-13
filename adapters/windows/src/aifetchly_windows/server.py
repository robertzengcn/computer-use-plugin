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
import os
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass

PROTOCOL_VERSION = "2025-06-18"
JSONRPC_VERSION = "2.0"

# Win32 bounds shared with helpers (B04).
LONG_MIN = -(2**31)
LONG_MAX = 2**31 - 1
DWORD_MAX = 0xFFFFFFFF


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


# MCP tool input schemas (B02): published on tools/list so
# schema-validating clients can consume discovery. Local tools carry strict
# schemas matching the accepted arguments; upstream tools carry a generic
# object schema until the P0-C pin wires them.
TOOL_INPUT_SCHEMAS: dict[str, dict[str, object]] = {
    "process_integrity": {
        "type": "object",
        "properties": {"processId": {"type": "integer", "minimum": 0, "maximum": DWORD_MAX}},
        "required": ["processId"],
        "additionalProperties": False,
    },
    "window_at_point": {
        "type": "object",
        "properties": {
            "point": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "minimum": LONG_MIN, "maximum": LONG_MAX},
                    "y": {"type": "integer", "minimum": LONG_MIN, "maximum": LONG_MAX},
                },
                "required": ["x", "y"],
                "additionalProperties": False,
            },
        },
        "required": ["point"],
        "additionalProperties": False,
    },
}

GENERIC_UPSTREAM_SCHEMA: dict[str, object] = {
    "type": "object",
    "description": "Requires the pinned upstream backend (P0-C); not wired in this build.",
}


def tool_input_schema(name: str) -> dict[str, object]:
    """Return the MCP inputSchema for a tool name (B02).

    Returns a copy — callers must not mutate the shared registry through a
    discovery response.
    """
    import copy

    if name in TOOL_INPUT_SCHEMAS:
        return copy.deepcopy(TOOL_INPUT_SCHEMAS[name])
    return dict(GENERIC_UPSTREAM_SCHEMA)


def _validate_envelope(request: dict[str, object]) -> str | None:
    """Validate the JSON-RPC envelope without side effects (N11).

    Returns an error message, or None when the envelope is well-formed.
    Unknown methods are left to ``_dispatch`` (typed METHOD_NOT_FOUND).
    """
    if request.get("jsonrpc") != JSONRPC_VERSION:
        return "protocol version must be '2.0'"
    if "params" in request and not isinstance(request.get("params"), dict):
        return "params must be an object"
    return None


def _validate_tool_arguments(name: str, arguments: object) -> str | None:
    """Validate tool arguments against the published input schema (N11).

    Mirrors ``TOOL_INPUT_SCHEMAS`` strictly (required fields, integer types
    with bool rejection, ranges, no undeclared fields) so the advertised
    boundary matches actual dispatch. Returns an error message or None.
    """
    if not isinstance(arguments, dict):
        return f"tool '{name}' arguments must be an object"
    if name == "process_integrity":
        extra = set(arguments.keys()) - {"processId"}
        if extra:
            return f"process_integrity rejects undeclared fields: {sorted(extra)}"
        if "processId" not in arguments:
            return "process_integrity requires integer processId 0..4294967295"
        process_id = arguments["processId"]
        if type(process_id) is not int or process_id < 0 or process_id > DWORD_MAX:
            return "process_integrity requires integer processId 0..4294967295 (booleans rejected)"
        return None
    if name == "window_at_point":
        extra = set(arguments.keys()) - {"point"}
        if extra:
            return f"window_at_point rejects undeclared fields: {sorted(extra)}"
        point = arguments.get("point")
        if not isinstance(point, dict):
            return "window_at_point requires point {x, y} integers (booleans rejected)"
        extra_point = set(point.keys()) - {"x", "y"}
        if extra_point:
            return f"window_at_point.point rejects undeclared fields: {sorted(extra_point)}"
        x = point.get("x")
        y = point.get("y")
        if type(x) is not int or type(y) is not int:
            return "window_at_point requires point {x, y} integers (booleans rejected)"
        if x < LONG_MIN or x > LONG_MAX or y < LONG_MIN or y > LONG_MAX:
            return f"window_at_point coordinates outside LONG range {LONG_MIN}..{LONG_MAX}"
        return None
    return None


def handle_request(config: ServerConfig, request: object) -> dict[str, object] | None:
    """Handle one JSON-RPC request object; None for notifications (B02).

    JSON-RPC notifications (no ``id``) never produce a response — not even
    an error. Protocol errors on notifications are swallowed per spec.
    Envelopes and tool arguments are validated against the pinned protocol
    rules before any dispatch or native call (N11).
    """
    if not isinstance(request, dict):
        return _error(None, INVALID_PARAMS, "request must be an object")
    is_notification = "id" not in request
    request_id = request.get("id")
    # N11: validate the id type up front. An invalid id cannot be echoed
    # back (it may be an array/object); per JSON-RPC the error id is null.
    if not is_notification and not (
        request_id is None or isinstance(request_id, str) or type(request_id) is int
    ):
        return _error(None, INVALID_PARAMS, "id must be a string, integer or null")
    # N11: validate the JSON-RPC envelope before dispatch.
    envelope_error = _validate_envelope(request)
    if envelope_error is not None:
        if is_notification:
            return None
        return _error(request_id, INVALID_PARAMS, envelope_error)
    method = request.get("method")
    params = request.get("params") if isinstance(request.get("params"), dict) else {}
    if not isinstance(method, str):
        if is_notification:
            return None
        return _error(request_id, INVALID_PARAMS, "method must be a string")

    try:
        result = _dispatch(config, method, params)
    except DispatchError as error:
        if is_notification:
            return None
        return _error(request_id, error.code, str(error))
    except Exception as error:  # noqa: BLE001 - boundary: typed, safe message
        # No traceback/argv/paths in protocol output (design §3.3).
        if is_notification:
            return None
        return _error(request_id, INTERNAL_ERROR, f"internal error: {type(error).__name__}")

    if is_notification:
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
        # Each entry carries its MCP inputSchema (B02).
        return {
            "tools": [
                {"name": name, "inputSchema": tool_input_schema(name)}
                for name in sorted(config.allowlist)
            ],
        }
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

    # Trusted owner context: the backend's own PID lets the host compare
    # returned PIDs against a fact the backend established (B03). Helpers
    # return None (unknown) when no owner is supplied; the server always
    # supplies one, so its responses carry an exact boolean.
    try:
        own_pid = os.getpid()
    except Exception:  # noqa: BLE001 - getpid never fails in practice
        own_pid = None
    arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
    if name == "process_integrity":
        # N11: schema validation first — undeclared fields and malformed
        # values fail before any native call.
        schema_error = _validate_tool_arguments(name, params.get("arguments"))
        if schema_error is not None:
            raise DispatchError(INVALID_PARAMS, schema_error)
        process_id = arguments.get("processId")
        # Strict: bool is a subclass of int — reject it (B04). Range-check
        # DWORD before any native call.
        if type(process_id) is not int or process_id < 0 or process_id > DWORD_MAX:
            raise DispatchError(
                INVALID_PARAMS,
                "process_integrity requires integer processId 0..4294967295 (booleans rejected)",
            )
        try:
            report = integrity.process_integrity(process_id, integrity.CtypesWinApi(), own_process_id=own_pid)
        except integrity.IntegrityError as error:
            # MCP tool-error shape: isError true distinguishes execution
            # failures from protocol errors (B02).
            return {"content": [{"type": "text", "text": json.dumps({
                "ok": False, "errorCode": "unsupported_platform_or_access",
                "message": str(error),
            })}], "isError": True}
        payload: dict[str, object] = {
            "ok": True,
            "processId": report.process_id,
            "integrityLevel": report.integrity_level,
        }
        if report.is_own_process is not None:
            payload["isOwnProcess"] = report.is_own_process
        return {"content": [{"type": "text", "text": json.dumps(payload)}]}
    if name == "window_at_point":
        # N11: schema validation first — undeclared fields fail before any
        # native call.
        schema_error = _validate_tool_arguments(name, params.get("arguments"))
        if schema_error is not None:
            raise DispatchError(INVALID_PARAMS, schema_error)
        point = arguments.get("point")
        if (
            not isinstance(point, dict)
            or type(point.get("x")) is not int
            or type(point.get("y")) is not int
        ):
            raise DispatchError(INVALID_PARAMS, "window_at_point requires point {x, y} integers (booleans rejected)")
        x = point["x"]
        y = point["y"]
        assert isinstance(x, int) and isinstance(y, int)
        if x < LONG_MIN or x > LONG_MAX or y < LONG_MIN or y > LONG_MAX:
            raise DispatchError(
                INVALID_PARAMS,
                f"window_at_point coordinates outside LONG range {LONG_MIN}..{LONG_MAX}",
            )
        try:
            result = window_at_point.resolve_window_at_point(
                window_at_point.DesktopPoint(x, y),
                window_at_point.CtypesWindowApi(),
                own_process_id=own_pid,
            )
        except window_at_point.WindowAtPointError as error:
            return {"content": [{"type": "text", "text": json.dumps({
                "ok": False, "errorCode": "no_window_or_owner", "message": str(error),
            })}], "isError": True}
        payload2: dict[str, object] = {
            "ok": True,
            "windowHandle": result.window_handle,
            "processId": result.process_id,
        }
        if result.is_own_process is not None:
            payload2["isOwnProcess"] = result.is_own_process
        return {"content": [{"type": "text", "text": json.dumps(payload2)}]}
    raise DispatchError(TOOL_NOT_WIRED, f"tool '{name}' is not wired in this build")


def _error(request_id: object, code: int, message: str) -> dict[str, object]:
    return {
        "jsonrpc": JSONRPC_VERSION,
        "id": request_id,
        "error": {"code": code, "message": message},
    }


#: Methods that require a prior `initialize` handshake (N11). The pure
#: :func:`handle_request` stays stateless for unit tests; the stateful
#: :func:`serve` loop enforces the lifecycle.
_METHODS_REQUIRING_INIT = frozenset({"tools/list", "tools/call"})


def serve(config: ServerConfig, read_line: Callable[[], str], write_line: Callable[[str], None]) -> None:
    """Newline-delimited JSON-RPC loop. stdout stays protocol-only (§1.3).

    Enforces the MCP lifecycle: ``tools/list`` and ``tools/call`` before a
    successful ``initialize`` fail with ``INVALID_PARAMS`` instead of
    dispatching (N11). Notifications never produce responses.
    """
    initialized = False
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
            responses = []
            for item in request:
                response, initialized = _serve_one(config, item, initialized)
                if response is not None:
                    responses.append(response)
            if responses:
                write_line(json.dumps(responses))
        else:
            response, initialized = _serve_one(config, request, initialized)
            if response is not None:
                write_line(json.dumps(response))


def _serve_one(
    config: ServerConfig, request: object, initialized: bool
) -> tuple[dict[str, object] | None, bool]:
    """Serve one request object, threading initialization state (N11).

    The initialized flag flips only on a successful `initialize` result or
    a well-formed `notifications/initialized` notification (E07) — a bare
    or malformed notification never unlocks the server. Id types are
    validated before any error that echoes `id`, so a non-string/non-integer
    id is never reflected back.
    """
    if isinstance(request, dict):
        # E07: validate the id first — errors below must not echo an
        # array/object id back to the client.
        request_id = request.get("id")
        if "id" in request and not (
            request_id is None or isinstance(request_id, str) or type(request_id) is int
        ):
            return _error(None, INVALID_PARAMS, "id must be a string, integer or null"), initialized
        method = request.get("method")
        if method == "initialize":
            response = handle_request(config, request)
            if response is not None and "result" in response:
                initialized = True
            return response, initialized
        if method == "notifications/initialized":
            # The initialized flag flips ONLY on a successful `initialize`
            # result below — never on this notification. A bare or malformed
            # notification is swallowed without effect; a request-shaped one
            # (with id) is acknowledged but still unlocks nothing, so a
            # well-formed notifications/initialized alone can never enable
            # tools/list or tools/call.
            envelope_error = _validate_envelope(request)
            if envelope_error is not None:
                return None, initialized
            response = handle_request(config, request)
            if "id" not in request:
                return None, initialized
            return response, initialized
        if method in _METHODS_REQUIRING_INIT and not initialized:
            if "id" not in request:
                return None, initialized
            return (
                _error(request.get("id"), INVALID_PARAMS, f"{method} requires a prior initialize handshake"),
                initialized,
            )
    response = handle_request(config, request)
    return response, initialized


def main(allowlist: frozenset[str] | None = None) -> int:
    """Run the stdio loop against real stdin/stdout (used by the harness)."""
    if allowlist is None:
        from .allowlist import load_allowlist
        from .entrypoint import _find_resource

        allowlist = load_allowlist(_find_resource("tool-allowlist.json"))

    def write_flushed(payload: str) -> None:
        # B01: flush every protocol response independently so persistent
        # sessions receive initialize/list/calls before stdin closes.
        sys.stdout.write(payload + "\n")
        sys.stdout.flush()

    serve(
        make_config(allowlist),
        sys.stdin.readline,
        write_flushed,
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
