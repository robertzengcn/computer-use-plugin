"""Reviewed tool-surface loader (design §4): deny-by-default, no overlaps."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path


class AllowlistError(Exception):
    """The allowlist file is malformed or internally inconsistent."""


def load_allowlist(path: str | Path) -> frozenset[str]:
    """Load the reviewed allow set; raise AllowlistError on any inconsistency."""
    raw = Path(path).read_text(encoding="utf-8")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise AllowlistError(f"allowlist is not valid JSON: {error}") from error

    for key in ("version", "policy", "allow", "deny"):
        if key not in parsed:
            raise AllowlistError(f"allowlist missing '{key}'")
    if parsed["policy"] != "deny-by-default":
        raise AllowlistError(f"unsupported policy '{parsed['policy']}'")

    allow = _tool_list(parsed["allow"], "allow")
    deny = _tool_list(parsed["deny"], "deny")

    overlap = allow & deny
    if overlap:
        raise AllowlistError(f"tools both allowed and denied: {sorted(overlap)}")
    return frozenset(allow)


def is_tool_allowed(allowlist: frozenset[str], tool: str) -> bool:
    """Deny-by-default membership check; unknown tools are never allowed."""
    return tool in allowlist


def _tool_list(items: object, field: str) -> set[str]:
    if not isinstance(items, list) or not all(isinstance(item, str) for item in items):
        raise AllowlistError(f"'{field}' must be a list of tool name strings")
    names: set[str] = set()
    for item in items:  # type: ignore[union-attr]
        if item in names:
            raise AllowlistError(f"duplicate tool in '{field}': {item}")
        names.add(item)
    return names


def assert_config_consistency(allowlist: frozenset[str], declared: Mapping[str, object]) -> None:
    """A tool declared in another config must not silently widen the surface."""
    declared_allow = declared.get("allow")
    if isinstance(declared_allow, list):
        extra = set(declared_allow) - set(allowlist)
        if extra:
            raise AllowlistError(f"configuration enables unreviewed tools: {sorted(extra)}")
