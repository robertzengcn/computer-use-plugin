"""Backend entrypoint skeleton (design §4.2).

Fails closed while the upstream revision is unpinned: stdout stays
protocol-only, telemetry stays disabled, and no upstream server is started
behind another server. When P0-C pins the revision this module registers the
reviewed subset from tool-allowlist.json plus the read-only extensions.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .allowlist import AllowlistError, load_allowlist

PACKAGE_ROOT = Path(__file__).resolve().parent.parent.parent


class BackendNotPinnedError(Exception):
    """The pinned upstream backend revision is required and absent."""


def load_upstream_lock(path: Path | None = None) -> dict[str, object]:
    lock_path = path or (PACKAGE_ROOT / "upstream.lock")
    parsed = json.loads(lock_path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise BackendNotPinnedError("upstream.lock is malformed")
    return parsed


def require_pinned_backend(path: Path | None = None) -> frozenset[str]:
    """Load the allowlist only when the backend pin is complete."""
    lock = load_upstream_lock(path)
    if lock.get("status") != "pinned":
        raise BackendNotPinnedError(
            "upstream.lock status is "
            f"'{lock.get('status')}'; Phase 0 P0-C must pin the exact revision "
            "before the backend can start"
        )
    if not lock.get("selectedRevision") or not lock.get("pythonVersion"):
        raise BackendNotPinnedError("upstream.lock is missing selectedRevision/pythonVersion")
    return load_allowlist(PACKAGE_ROOT / "tool-allowlist.json")


def main() -> int:
    """Start the pinned backend; exit 3 (missing prerequisites) while unpinned."""
    try:
        require_pinned_backend()
    except (BackendNotPinnedError, AllowlistError, json.JSONDecodeError) as error:
        # Logs go to stderr; stdout stays protocol-only (design §1.3).
        print(f"aifetchly-windows: {error}", file=sys.stderr)
        return 3
    # Registration of the reviewed subset on the pinned upstream server is the
    # P1 deliverable; reaching here means the pin exists.
    print("aifetchly-windows: pinned backend registration not yet implemented", file=sys.stderr)
    return 3


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
