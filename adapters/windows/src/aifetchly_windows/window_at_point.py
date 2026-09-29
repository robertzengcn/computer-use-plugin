"""Window-at-point resolution (design §4): top-level window and owner for a
desktop point — WindowFromPoint → GetAncestor(GA_ROOT) → GetWindowThreadProcessId.

The supervisor uses this for own-window and elevation checks; the backend only
reports facts, it never retargets an action (§4.2).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class WindowAtPointError(Exception):
    """Typed failure resolving the window at a desktop point."""


@dataclass(frozen=True)
class DesktopPoint:
    x: int
    y: int


@dataclass(frozen=True)
class WindowAtPointResult:
    point: DesktopPoint
    window_handle: int
    process_id: int
    is_own_process: bool = False


class WindowApi(Protocol):
    """Win32 chain used here; mocked in tests."""

    def window_from_point(self, point: DesktopPoint) -> int: ...

    def ancestor_root(self, window_handle: int) -> int: ...

    def window_thread_process_id(self, window_handle: int) -> tuple[int, int]: ...


class CtypesWindowApi:
    """Production adapter; wired with the pinned upstream revision (Phase 0)."""

    def window_from_point(self, point: DesktopPoint) -> int:  # pragma: no cover
        raise WindowAtPointError("ctypes Win32 backend is wired with the pinned upstream revision (Phase 0 P0-C)")

    def ancestor_root(self, window_handle: int) -> int:  # pragma: no cover
        raise WindowAtPointError("ctypes Win32 backend is wired with the pinned upstream revision (Phase 0 P0-C)")

    def window_thread_process_id(self, window_handle: int) -> tuple[int, int]:  # pragma: no cover
        raise WindowAtPointError("ctypes Win32 backend is wired with the pinned upstream revision (Phase 0 P0-C)")


def resolve_window_at_point(
    point: DesktopPoint,
    api: WindowApi,
    own_process_id: int | None = None,
) -> WindowAtPointResult:
    """Resolve the top-level window and owning PID at a desktop point."""
    if not isinstance(point.x, int) or not isinstance(point.y, int):
        raise WindowAtPointError("point coordinates must be integers")
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
        is_own_process=own_process_id == process_id,
    )
