"""Integrity SID parsing: pure logic, runs on every platform (CU-PLUGIN-06)."""

from __future__ import annotations

import struct

import pytest

from aifetchly_windows.integrity import (
    IntegrityError,
    IntegrityReport,
    parse_integrity_level,
    process_integrity,
)


def integrity_sid(rid: int) -> bytes:
    # S-1-16-RID: revision 1, one sub-authority, authority 16, RID little-endian.
    return bytes([1, 1]) + (16).to_bytes(6, "big") + struct.pack("<I", rid)


@pytest.mark.parametrize(
    ("rid", "level"),
    [
        (0x1000, "low"),
        (0x2000, "medium"),
        (0x3000, "high"),
        (0x4000, "system"),
        (0x5000, "system"),  # protected-process range collapses to system
    ],
)
def test_supported_levels(rid: int, level: str) -> None:
    assert parse_integrity_level(integrity_sid(rid)) == level


@pytest.mark.parametrize(
    "payload",
    [
        b"",
        b"\x01",  # truncated header
        bytes([2, 1]) + (16).to_bytes(6, "big") + struct.pack("<I", 0x2000),  # bad revision
        bytes([1, 1]) + (5).to_bytes(6, "big") + struct.pack("<I", 0x2000),  # wrong authority
        bytes([1, 0]) + (16).to_bytes(6, "big"),  # no sub-authorities
        bytes([1, 1]) + (16).to_bytes(6, "big"),  # declared RID missing
    ],
)
def test_malformed_sids_fail_explicitly(payload: bytes) -> None:
    with pytest.raises(IntegrityError):
        parse_integrity_level(payload)


def test_unsupported_rid_rejected() -> None:
    with pytest.raises(IntegrityError, match="unsupported integrity RID"):
        parse_integrity_level(integrity_sid(0x0800))


class FakeApi:
    def __init__(self, sid_by_pid: dict[int, bytes]) -> None:
        self._sid_by_pid = sid_by_pid

    def open_process_token_integrity(self, process_id: int) -> bytes:
        try:
            return self._sid_by_pid[process_id]
        except KeyError as error:
            raise IntegrityError(f"cannot open process {process_id}") from error


def test_process_integrity_report() -> None:
    api = FakeApi({4210: integrity_sid(0x3000), 9999: integrity_sid(0x2000)})
    report = process_integrity(4210, api, own_process_id=9999)
    assert report == IntegrityReport(process_id=4210, integrity_level="high", is_own_process=False)
    own = process_integrity(9999, api, own_process_id=9999)
    assert own.is_own_process is True


def test_process_integrity_never_guesses_on_error() -> None:
    api = FakeApi({})
    with pytest.raises(IntegrityError, match="cannot open process"):
        process_integrity(1234, api)
    with pytest.raises(IntegrityError, match="invalid process id"):
        process_integrity(-1, api)
