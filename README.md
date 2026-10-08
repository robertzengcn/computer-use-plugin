# aifetchly-computer-use

First-party Computer Use plugin repository consumed by AiFetchly: versioned
contracts, desktop backend artifacts, grounding model exports, test fixtures,
evaluation tooling and reproducible release metadata. Windows ships first;
Apple Silicon macOS follows in Phase 3. Users install through AiFetchly and
need no developer tools.

- Product requirements: [`doc/computer-use-plugin-prd.md`](doc/computer-use-plugin-prd.md)
- Technical design: [`doc/computer-use-plugin-technical-design.md`](doc/computer-use-plugin-technical-design.md)
- Implementation plan (Phase 0): [`doc/plans/2026-09-27-phase0-foundation.md`](doc/plans/2026-09-27-phase0-foundation.md)

## Current status (Phase 0 + portable E-fixes, 2026-10-06)

Portable verification: `npm run check` green (154 Vitest tests, 15 schemas,
41 valid + 33 invalid fixtures). Windows: 81 passed + 2 skipped (native cases
are stubs, not qualification). Grounding: 72 passed. See
[`doc/2026-10-06-prd-audit-TODO.md`](doc/2026-10-06-prd-audit-TODO.md) for the
current PRD audit (E01–E18 portable defects fixed in this checkout; M01–M10
require hardware/consumers) and
[`doc/2026-10-03-implementation-TODO.md`](doc/2026-10-03-implementation-TODO.md)
as history (its Oct 4 completion banner is superseded — portable work remained).

| Area | Status |
| --- | --- |
| TypeScript toolchain + §2.2 command contract | ✅ implemented, `npm run check` green |
| Contracts: 15 schemas + 74 conformance fixtures (41 valid, 33 invalid) + transforms + generated types + complete archive closure (E01/E02) | ✅ `npm run contracts:check` / `contracts:build` (extracted archive validates independently) |
| Offline evaluation CLI (replay/compare/report with full identity + provenance, E09/E15) | ✅ `npm run eval -- replay …` (no backend, no input); `compare` saves JSON/HTML via `--out` |
| Release verifier (closure/hash/platform/licence/evidence + mandatory suites/binding, E04–E08) | ✅ `npm run release:verify -- --manifest …` (candidate vs qualified states preserved) |
| Windows backend integration package (E03/E10/E11/E12: hashed src closure, full lock validation, AX/W-1 bounds) | Portable units + packaging guards; native pin/provisioning/launch is P0-C/M02 (unpinned) |
| Grounding model engineering package (E14: explicit processing identities; 72 tests) | Manifest/parity cores; weights/export/parity/provider qualification are P0-D/M04 (unfetched) |
| macOS backend | lock + allowlist scaffolds; Ghost-vs-Swift decision and helper build/signing are P0-E/M07 (no Swift source) |
| Native qualification, model export, signing, host/Hub integration | **not claimed** — requires pinned environments, hardware runners and consumer evidence (M02–M09) |

Platform-bound commands fail closed with exit `3` (missing prerequisites) —
never a silent pass (PRD §6.1). `model:prepare` verifies the approved cache
against `models.lock.json` and never downloads; fetching weights is the
maintainer's explicit action (design §6.6).

## Developer workflows (design §2.5)

| You are | Do this | Prereqs |
| --- | --- | --- |
| Contract developer (any OS) | `npm ci && npm run check && npm run build && npm run contracts:check` | Node 22 LTS only |
| Windows backend developer | `cd adapters/windows && uv sync && uv run pytest` (platform-neutral units); native tests run on Windows with `--allow-input` after the P0-C pin | uv + Python 3.14 |
| Model engineer | `cd grounding && uv sync && uv run pytest`; `model:prepare`/`model:export`/`model:parity` activate when P0-D pins weights and the export stack | uv + approved weights |
| Release maintainer | `npm run contracts:build`, `npm run release:verify -- --manifest <path>` | Node only |

Exit codes (design §2.2): `0` ok · `1` gate/test failure · `2` invalid
arguments · `3` missing prerequisites · `4` cancelled. `--json` prints one
structured envelope on stdout; diagnostics go to stderr.

## Layout

```
tooling/      TypeScript developer tools (cli, contracts, processes, release)
contracts/    Canonical JSON Schemas + fixtures + generated types (shared with the host)
plugin/       Manifest, public tool descriptions, skill
eval/         Offline replay/compare CLI, datasets, metrics, reports
adapters/     windows/ (Python integration package) · macos/ (spike scaffolds)
grounding/    Model engineering package (reference/export/parity cores)
packaging/    Platform packaging shims (fail closed until pinned)
test/         Vitest suites + fixtures (trace bundles, release manifests)
```

Weights, virtualenvs, caches and customer traces are never committed.
