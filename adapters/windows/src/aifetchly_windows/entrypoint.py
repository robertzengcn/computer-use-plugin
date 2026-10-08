"""Backend entrypoint (design §4.2).

Fails closed while the upstream revision is unpinned: stdout stays
protocol-only, telemetry stays disabled, and no upstream server is started
behind another server. Resources (upstream.lock, tool-allowlist.json) resolve
in order: packaged wheel data (B14), an explicit environment override, then
the source checkout — an installed wheel without packaged resources exits
with a typed prerequisite failure instead of a traceback. When P0-C pins the
revision this module registers the reviewed subset plus the read-only
extensions.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from .allowlist import AllowlistError, load_allowlist

PACKAGE_ROOT = Path(__file__).resolve().parent.parent.parent
RESOURCE_ENV = "AIFETCHLY_WINDOWS_RESOURCES"
LOCK_NAME = "upstream.lock"
ALLOWLIST_NAME = "tool-allowlist.json"


class BackendNotPinnedError(Exception):
    """The pinned upstream backend revision is required and absent."""


class ResourcesUnavailableError(Exception):
    """Neither packaged data nor the checkout provides the backend resources."""


def _candidate_roots() -> list[Path]:
    roots: list[Path] = []
    override = os.environ.get(RESOURCE_ENV)
    if override:
        roots.append(Path(override))
    try:  # Wheel data ships under aifetchly_windows/data/ (pyproject force-include)
        from importlib import resources

        data = resources.files("aifetchly_windows").joinpath("data")
        if data.is_dir():
            roots.append(Path(str(data)))
    except (ImportError, TypeError, ModuleNotFoundError):
        pass
    roots.append(PACKAGE_ROOT)  # source checkout layout
    return roots


def _find_resource(name: str) -> Path:
    for root in _candidate_roots():
        candidate = root / name
        try:
            if candidate.is_file():
                return candidate
        except OSError:
            continue
    raise ResourcesUnavailableError(
        f"{name} not found in packaged data, ${RESOURCE_ENV} or the checkout; "
        "the backend cannot determine its reviewed surface"
    )


def load_upstream_lock(path: Path | None = None) -> dict[str, object]:
    lock_path = path or _find_resource(LOCK_NAME)
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
    return load_allowlist(_find_resource(ALLOWLIST_NAME))


def main() -> int:
    """Start the pinned backend; exit 3 (missing prerequisites) while unpinned.

    With a complete pin the reviewed-subset registration server runs on
    stdio (server.py): upstream-pinned tools stay not-wired until the P0-C
    integration strategy lands, but discovery/dispatch isolation, the local
    read-only extensions and the protocol surface are exactly the production
    ones (M02/M03).
    """
    try:
        allowlist = require_pinned_backend()
    except (
        BackendNotPinnedError,
        AllowlistError,
        ResourcesUnavailableError,
        json.JSONDecodeError,
        OSError,
    ) as error:
        # Logs go to stderr; stdout stays protocol-only (design §1.3). A
        # missing resource is a prerequisite failure, never a traceback.
        print(f"aifetchly-windows: {type(error).__name__}: {error}", file=sys.stderr)
        return 3
    from .server import main as serve_main

    return serve_main(allowlist)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
