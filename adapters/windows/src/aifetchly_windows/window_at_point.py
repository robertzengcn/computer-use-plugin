"""Window-at-point resolution (design §4): top-level window and owner for a
desktop point — WindowFromPoint → GetAncestor(GA_ROOT) → GetWindowThreadProcessId.

The supervisor uses this for own-window and elevation checks; the backend only
reports facts, it never retargets an action (§4.2).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Protocol


class WindowAtPointError(Exception):
    """Typed failure resolving the window at a desktop point."""


# Win32 LONG bounds for desktop coordinates (B04). Negative values are
# valid (multi-monitor layouts left/above the primary display).
LONG_MIN = -(2**31)
LONG_MAX = 2**31 - 1
DWORD_MAX = 0xFFFFFFFF


@dataclass(frozen=True)
class DesktopPoint:
    x: int
    y: int


@dataclass(frozen=True)
class WindowAtPointResult:
    point: DesktopPoint
    window_handle: int
    process_id: int
    # None means unknown ownership (no trusted owner supplied, B03).
    is_own_process: bool | None = None


class WindowApi(Protocol):
    """Win32 chain used here; mocked in tests."""

    def window_from_point(self, point: DesktopPoint) -> int: ...

    def ancestor_root(self, window_handle: int) -> int: ...

    def window_thread_process_id(self, window_handle: int) -> tuple[int, int]: ...


class CtypesWindowApi:
    """Production adapter over user32, per the §4 API chain. DLLs load
    lazily so the module imports anywhere; off-Windows use raises the typed
    error. Native execution is exercised on the P0-C qualification machine."""

    GA_ROOT = 2

    def __init__(self) -> None:
        if sys.platform != "win32":  # pragma: no cover - platform guard
            raise WindowAtPointError("ctypes Win32 backend requires Windows")
        import ctypes
        from ctypes import wintypes

        self._ctypes = ctypes
        self._wintypes = wintypes
        self._user32 = ctypes.WinDLL("user32", use_last_error=True)

        class _Point(ctypes.Structure):
            _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]

        self._Point = _Point
        self._user32.WindowFromPoint.argtypes = [_Point]
        self._user32.WindowFromPoint.restype = wintypes.HWND
        self._user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
        self._user32.GetAncestor.restype = wintypes.HWND
        self._user32.GetWindowThreadProcessId.argtypes = [
            wintypes.HWND, ctypes.POINTER(wintypes.DWORD),
        ]
        self._user32.GetWindowThreadProcessId.restype = wintypes.DWORD

    def window_from_point(self, point: DesktopPoint) -> int:
        hwnd = self._user32.WindowFromPoint(self._Point(point.x, point.y))
        if not hwnd:
            raise WindowAtPointError(
                f"WindowFromPoint({point.x}, {point.y}) returned null: WinError {self._ctypes.get_last_error()}"
            )
        return int(hwnd)

    def ancestor_root(self, window_handle: int) -> int:
        root = self._user32.GetAncestor(window_handle, self.GA_ROOT)
        if not root:
            raise WindowAtPointError(
                f"GetAncestor(GA_ROOT) failed for {window_handle}: WinError {self._ctypes.get_last_error()}"
            )
        return int(root)

    def window_thread_process_id(self, window_handle: int) -> tuple[int, int]:
        pid = self._wintypes.DWORD(0)
        thread_id = self._user32.GetWindowThreadProcessId(window_handle, self._ctypes.byref(pid))
        if not thread_id:
            raise WindowAtPointError(
                f"GetWindowThreadProcessId failed for {window_handle}: WinError {self._ctypes.get_last_error()}"
            )
        return int(thread_id), int(pid.value)


def resolve_window_at_point(
    point: DesktopPoint,
    api: WindowApi,
    own_process_id: int | None = None,
) -> WindowAtPointResult:
    """Resolve the top-level window and owning PID at a desktop point.

    Rejects booleans/non-integers and LONG-overflowing coordinates before
    any native call (B04); valid negative desktop coordinates are retained.
    Ownership is only reported with a trusted owner PID (B03).
    """
    if type(point.x) is not int or type(point.y) is not int:
        raise WindowAtPointError("point coordinates must be integers (booleans rejected)")
    for value in (point.x, point.y):
        if value < LONG_MIN or value > LONG_MAX:
            raise WindowAtPointError(f"point coordinate {value} outside LONG range {LONG_MIN}..{LONG_MAX}")
    if own_process_id is not None and (
        type(own_process_id) is not int or own_process_id < 0 or own_process_id > DWORD_MAX
    ):
        raise WindowAtPointError("owner process id outside DWORD range")
    try:
        window = api.window_from_point(point)
    except WindowAtPointError:
        raise
    except Exception as error:
        raise WindowAtPointError(f"WindowFromPoint failed: {error}") from error
    if window in (0, None):
        raise WindowAtPointError("no window at point")
    try:
        root = api.ancestor_root(window)
        _, process_id = api.window_thread_process_id(root)
    except Exception as error:
        raise WindowAtPointError(f"owner resolution failed: {error}") from error
    if process_id <= 0:
        raise WindowAtPointError(f"window {root} reported invalid owner pid {process_id}")
    return WindowAtPointResult(
        point=point,
        window_handle=root,
        process_id=process_id,
        is_own_process=(own_process_id == process_id) if own_process_id is not None else None,
    )
