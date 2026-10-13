"""Window-at-point resolution with a mocked Win32 chain (design §4)."""

from __future__ import annotations

import sys

import pytest

from aifetchly_windows.window_at_point import (
    CtypesWindowApi,
    DesktopPoint,
    WindowAtPointError,
    resolve_window_at_point,
)


class FakeWindowApi:
    def __init__(
        self,
        window_by_point: dict[tuple[int, int], int] | None = None,
        root_by_window: dict[int, int] | None = None,
        pid_by_window: dict[int, int] | None = None,
    ) -> None:
        self.window_by_point = window_by_point or {}
        self.root_by_window = root_by_window or {}
        self.pid_by_window = pid_by_window or {}

    def window_from_point(self, point: DesktopPoint) -> int:
        return self.window_by_point.get((point.x, point.y), 0)

    def ancestor_root(self, window_handle: int) -> int:
        return self.root_by_window.get(window_handle, 0)

    def window_thread_process_id(self, window_handle: int) -> tuple[int, int]:
        pid = self.pid_by_window.get(window_handle, 0)
        if pid == 0:
            raise OSError("invalid window handle (closed?)")
        return (1, pid)


def test_resolves_top_level_owner() -> None:
    api = FakeWindowApi(
        window_by_point={(944, 331): 0x00D1},
        root_by_window={0x00D1: 0x00F0},
        pid_by_window={0x00F0: 4210},
    )
    result = resolve_window_at_point(DesktopPoint(944, 331), api, own_process_id=7)
    assert result.window_handle == 0x00F0
    assert result.process_id == 4210
    assert result.is_own_process is False


def test_flags_own_window() -> None:
    api = FakeWindowApi(
        window_by_point={(10, 10): 5},
        root_by_window={5: 5},
        pid_by_window={5: 7},
    )
    result = resolve_window_at_point(DesktopPoint(10, 10), api, own_process_id=7)
    assert result.is_own_process is True


def test_no_window_at_point_is_typed_error() -> None:
    api = FakeWindowApi()
    with pytest.raises(WindowAtPointError, match="no window at point"):
        resolve_window_at_point(DesktopPoint(0, 0), api)


def test_closed_handle_reuse_fails_explicitly() -> None:
    api = FakeWindowApi(
        window_by_point={(50, 50): 9},
        root_by_window={9: 9},
        pid_by_window={},  # handle died between calls
    )
    with pytest.raises(WindowAtPointError, match="owner resolution failed"):
        resolve_window_at_point(DesktopPoint(50, 50), api)


def test_invalid_owner_pid_rejected() -> None:
    class ZeroPidApi(FakeWindowApi):
        def window_thread_process_id(self, window_handle: int) -> tuple[int, int]:
            return (1, 0)

    api = ZeroPidApi(window_by_point={(1, 1): 3}, root_by_window={3: 3})
    with pytest.raises(WindowAtPointError, match="invalid owner pid"):
        resolve_window_at_point(DesktopPoint(1, 1), api)


def test_ctypes_backend_fails_typed_off_windows() -> None:
    # The real ctypes backend is implemented; off Windows it must refuse with
    # the typed error rather than an ImportError (native runs happen on the
    # P0-C qualification machine).
    with pytest.raises(WindowAtPointError, match="requires Windows"):
        CtypesWindowApi()


def test_unknown_ownership_is_none_not_false() -> None:
    """B03: without a trusted owner, ownership stays unknown (None)."""
    api = FakeWindowApi(
        window_by_point={(1, 1): 3}, root_by_window={3: 3}, pid_by_window={3: 42}
    )
    result = resolve_window_at_point(DesktopPoint(1, 1), api)
    assert result.is_own_process is None


def test_bool_and_overflow_coordinates_rejected_without_native_call() -> None:
    """B04: malformed coordinates never invoke the native API."""
    calls: list[DesktopPoint] = []

    class CountingApi(FakeWindowApi):
        def window_from_point(self, point: DesktopPoint) -> int:
            calls.append(point)
            return 1

    for bad in (
        DesktopPoint(True, 0),  # type: ignore[arg-type]
        DesktopPoint(2**40, 0),
        DesktopPoint(0, -(2**31) - 1),
    ):
        with pytest.raises(WindowAtPointError):
            resolve_window_at_point(bad, CountingApi(root_by_window={1: 1}, pid_by_window={1: 5}))
    assert calls == []


def test_valid_negative_coordinates_retained() -> None:
    """B04: negative desktop coordinates (multi-monitor) remain valid."""
    api = FakeWindowApi(
        window_by_point={(-1920, -100): 9}, root_by_window={9: 9}, pid_by_window={9: 5}
    )
    result = resolve_window_at_point(DesktopPoint(-1920, -100), api, own_process_id=5)
    assert result.process_id == 5
    assert result.is_own_process is True


@pytest.mark.skipif(sys.platform != "win32", reason="native Win32 execution (P0-C qualification machine)")
def test_ctypes_chain_resolves_real_window() -> None:
    api = CtypesWindowApi()
    result = resolve_window_at_point(DesktopPoint(1, 1), api)
    assert result.window_handle > 0
    assert result.process_id > 0
