"""AiFetchly Computer Use Windows backend integration package.

Extensions and normalization layered on the pinned Windows-MCP revision.
Everything here runs inside the host-managed backend process; nothing in this
package starts a second MCP proxy or enforces host authority (design §4.2).
"""

__all__ = ["allowlist", "entrypoint", "integrity", "normalize", "window_at_point"]
