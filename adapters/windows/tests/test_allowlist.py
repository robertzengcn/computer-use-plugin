"""Allowlist loader tests: deny-by-default, no overlaps, no duplicates."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from aifetchly_windows.allowlist import (
    AllowlistError,
    assert_config_consistency,
    is_tool_allowed,
    load_allowlist,
)

HERE = Path(__file__).resolve().parent.parent
ALLOWLIST = HERE / "tool-allowlist.json"


def test_reviewed_surface_loads() -> None:
    allow = load_allowlist(ALLOWLIST)
    assert "click" in allow
    assert "process_integrity" in allow
    assert "window_at_point" in allow


def test_deny_by_default() -> None:
    allow = load_allowlist(ALLOWLIST)
    assert not is_tool_allowed(allow, "powershell")
    assert not is_tool_allowed(allow, "totally_unknown_tool")
    assert not is_tool_allowed(allow, "run_powershell")


def test_duplicate_tool_rejected(tmp_path: Path) -> None:
    path = tmp_path / "allow.json"
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "policy": "deny-by-default",
                "allow": ["click", "click"],
                "deny": [],
            }
        )
    )
    with pytest.raises(AllowlistError, match="duplicate"):
        load_allowlist(path)


def test_allow_deny_overlap_rejected(tmp_path: Path) -> None:
    path = tmp_path / "allow.json"
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "policy": "deny-by-default",
                "allow": ["click"],
                "deny": ["click"],
            }
        )
    )
    with pytest.raises(AllowlistError, match="both allowed and denied"):
        load_allowlist(path)


def test_wrong_policy_rejected(tmp_path: Path) -> None:
    path = tmp_path / "allow.json"
    path.write_text(json.dumps({"version": 1, "policy": "allow-all", "allow": [], "deny": []}))
    with pytest.raises(AllowlistError, match="unsupported policy"):
        load_allowlist(path)


def test_config_cannot_widen_surface() -> None:
    allow = load_allowlist(ALLOWLIST)
    with pytest.raises(AllowlistError, match="unreviewed tools"):
        assert_config_consistency(allow, {"allow": ["click", "reboot_machine"]})
    # A subset of reviewed tools is consistent and returns without raising.
    assert_config_consistency(allow, {"allow": ["click"]})
