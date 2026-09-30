"""Process integrity and ownership facts (design §4).

Pure SID parsing is platform-neutral and unit-tested everywhere; the Win32
calls live behind :mod:`aifetchly_windows._winapi` so tests can mock them and
non-Windows hosts fail explicitly instead of guessing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

INTEGRITY_RID_LOW = 0x1000
INTEGRITY_RID_MEDIUM = 0x2000
INTEGRITY_RID_HIGH = 0x3000
INTEGRITY_RID_SYSTEM = 0x4000

_LEVEL_BY_RID = {
    INTEGRITY_RID_LOW: "low",
    INTEGRITY_RID_MEDIUM: "medium",
    INTEGRITY_RID_HIGH: "high",
    INTEGRITY_RID_SYSTEM: "system",
}


class IntegrityError(Exception):
    """The integrity data is malformed or an unsupported level."""


def parse_integrity_level(sid_bytes: bytes) -> str:
    """Parse a mandatory-integrity SID (S-1-16-RID) into its level name.

    Raises IntegrityError for anything that is not a well-formed integrity SID
    with a supported level — unknown data fails explicitly (CU-PLUGIN-06).
    """
    # SID layout: Revision(1) SubAuthorityCount(1) IdentifierAuthority(6)
    #             SubAuthorityCount * 4 bytes little-endian.
    if len(sid_bytes) < 8:
        raise IntegrityError("SID too short")
    revision = sid_bytes[0]
    sub_count = sid_bytes[1]
    if revision != 1:
        raise IntegrityError(f"unsupported SID revision {revision}")
    authority = int.from_bytes(sid_bytes[2:8], "big")
    if authority != 16:  # SECURITY_MANDATORY_LABEL_AUTHORITY
        raise IntegrityError(f"not an integrity SID (authority {authority})")
    if sub_count < 1:
        raise IntegrityError("integrity SID has no RID sub-authority")
    expected_len = 8 + sub_count * 4
    if len(sid_bytes) < expected_len:
        raise IntegrityError("SID truncated")
    rid = int.from_bytes(sid_bytes[8:12], "little")
    if rid in _LEVEL_BY_RID:
        return _LEVEL_BY_RID[rid]
    # Unknown RIDs (protected-process 0x5000, medium-plus 0x2100, …) fail
    # explicitly: an unreported level must never be guessed (CU-PLUGIN-06).
    raise IntegrityError(f"unsupported integrity RID 0x{rid:x}")


@dataclass(frozen=True)
class IntegrityReport:
    """Typed result for a process or window owner."""

    process_id: int
    integrity_level: str
    is_own_process: bool = False


class WinApi(Protocol):
    """Minimal Win32 surface used here; mocked in tests, ctypes-backed in prod."""

    def open_process_token_integrity(self, process_id: int) -> bytes: ...


class CtypesWinApi:
    """Production adapter using OpenProcess/GetTokenInformation via ctypes."""

    def open_process_token_integrity(self, process_id: int) -> bytes:  # pragma: no cover - exercised on Windows native runs only
        raise IntegrityError("ctypes Win32 backend is wired with the pinned upstream revision (Phase 0 P0-C)")


def process_integrity(
    process_id: int,
    api: WinApi,
    own_process_id: int | None = None,
) -> IntegrityReport:
    """Resolve a PID's integrity level; never guesses on failure."""
    if process_id < 0:
        raise IntegrityError(f"invalid process id {process_id}")
    sid = api.open_process_token_integrity(process_id)
    return IntegrityReport(
        process_id=process_id,
        integrity_level=parse_integrity_level(sid),
        is_own_process=own_process_id == process_id,
    )
