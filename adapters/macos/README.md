# macOS backend — spike pending (P0-E)

The Mac backend choice is **not made**. Per PRD §3.2 (CU-PLUGIN-08) a
time-boxed Phase 0 spike compares:

- **Option A — pinned Ghost OS fork** (MIT, macOS 14+, Swift 6.2): accessibility
  tools exist today; we would disable the MLX vision sidecar, recipes and
  learning, and own fork maintenance.
- **Option B — in-house Swift helper**: `AXUIElement` tree, `CGEvent` input,
  ScreenCaptureKit capture, NSWorkspace listing over stdio MCP.

Spike criteria (design §5): AX coverage on target Mac apps, CJK input, capture
geometry, binary size, signing/notarization effort, cancellation behavior with
dispatch timestamps, and estimated maintenance cost. A required safety gate
cannot be offset by convenience (design §5.3).

This directory holds only the reviewed tool surface and lock scaffolding; both
fail closed until the spike pins a source revision.
