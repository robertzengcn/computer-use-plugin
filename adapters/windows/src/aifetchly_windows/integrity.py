"""Process integrity and ownership facts (design §4).

Pure SID parsing is platform-neutral and unit-tested everywhere; the Win32
calls live in :class:`CtypesWinApi` (lazy DLL loading, typed errors) so tests
can mock them and non-Windows hosts fail explicitly instead of guessing.
"""

from __future__ import annotations

import sys
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
    """Production adapter: OpenProcess → OpenProcessToken → GetTokenInformation
    (TokenIntegrityLevel) via ctypes, per the §4 API list.

    DLLs load lazily so the module imports on any OS; off-Windows use raises
    the typed error instead of guessing. Native execution is exercised on the
    P0-C Windows qualification machine.
    """

    def __init__(self) -> None:
        if sys.platform != "win32":  # pragma: no cover - platform guard
            raise IntegrityError("ctypes Win32 backend requires Windows")
        import ctypes
        from ctypes import wintypes

        self._ctypes = ctypes
        self._kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self._advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)

        self._kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        self._kernel32.OpenProcess.restype = wintypes.HANDLE
        self._kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
        self._kernel32.CloseHandle.restype = wintypes.BOOL
        self._advapi32.OpenProcessToken.argtypes = [
            wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE),
        ]
        self._advapi32.OpenProcessToken.restype = wintypes.BOOL
        self._advapi32.GetTokenInformation.argtypes = [
            wintypes.HANDLE, wintypes.INT, wintypes.LPVOID, wintypes.DWORD,
            ctypes.POINTER(wintypes.DWORD),
        ]
        self._advapi32.GetTokenInformation.restype = wintypes.BOOL
        self._advapi32.GetLengthSid.argtypes = [wintypes.LPVOID]
        self._advapi32.GetLengthSid.restype = wintypes.DWORD

    def open_process_token_integrity(self, process_id: int) -> bytes:
        """Return the process's integrity SID bytes (S-1-16-RID)."""
        ctypes = self._ctypes
        from ctypes import wintypes

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        TOKEN_QUERY = 0x0008
        TokenIntegrityLevel = 25

        process = self._kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, False, process_id
        )
        if not process:
            raise IntegrityError(
                f"OpenProcess({process_id}) failed: WinError {ctypes.get_last_error()}"
            )
        try:
            token = wintypes.HANDLE()
            if not self._advapi32.OpenProcessToken(
                process, TOKEN_QUERY, ctypes.byref(token)
            ):
                raise IntegrityError(
                    f"OpenProcessToken({process_id}) failed: WinError {ctypes.get_last_error()}"
                )
            try:
                length = wintypes.DWORD(0)
                self._advapi32.GetTokenInformation(
                    token, TokenIntegrityLevel, None, 0, ctypes.byref(length)
                )
                if length.value == 0:
                    raise IntegrityError("GetTokenInformation returned a zero length")
                buffer = ctypes.create_string_buffer(length.value)
                if not self._advapi32.GetTokenInformation(
                    token, TokenIntegrityLevel, buffer, length.value, ctypes.byref(length)
                ):
                    raise IntegrityError(
                        f"GetTokenInformation failed: WinError {ctypes.get_last_error()}"
                    )
                # TOKEN_MANDATORY_LABEL starts with SID_AND_ATTRIBUTES whose
                # first field is the SID pointer.
                sid_pointer = ctypes.cast(
                    buffer, ctypes.POINTER(ctypes.c_void_p)
                ).contents.value
                if not sid_pointer:
                    raise IntegrityError("TOKEN_MANDATORY_LABEL has no SID")
                sid_length = self._advapi32.GetLengthSid(sid_pointer)
                if sid_length == 0:
                    raise IntegrityError("GetLengthSid failed")
                return ctypes.string_at(sid_pointer, sid_length)
            finally:
                self._kernel32.CloseHandle(token)
        finally:
            self._kernel32.CloseHandle(process)


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
