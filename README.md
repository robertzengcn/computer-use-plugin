# aifetchly-computer-use

First-party Computer Use plugin repository consumed by AiFetchly: versioned
contracts, desktop backend artifacts, grounding model exports, test fixtures,
evaluation tooling and reproducible release metadata. Windows ships first;
Apple Silicon macOS follows in Phase 3. Users install through AiFetchly and
need no developer tools.

- Product requirements: [`doc/computer-use-plugin-prd.md`](doc/computer-use-plugin-prd.md)
- Technical design: [`doc/computer-use-plugin-technical-design.md`](doc/computer-use-plugin-technical-design.md)
- Implementation plan (Phase 0): [`doc/plans/2026-09-27-phase0-foundation.md`](doc/plans/2026-09-27-phase0-foundation.md)

## Current status (Phase 0)

| Area | Status |
| --- | --- |
| TypeScript toolchain + §2.2 command contract | ✅ implemented, `npm run check` green |
| Contracts: 12 schemas + 47 conformance fixtures + transforms + generated types | ✅ `npm run contracts:check` / `contracts:build` |
| Offline evaluation CLI (replay/compare/report) | ✅ `npm run eval -- replay …` (no backend, no input) |
| Release verifier (closure/hash/platform/licence/evidence) | ✅ `npm run release:verify -- --manifest …` |
| Windows backend integration package | scaffold + 35 unit tests; native pin is P0-C |
| Grounding model engineering package | decode/shard/manifest/parity cores + 28 tests; weights/export are P0-D |
| macOS backend | lock + allowlist scaffolds; decision is P0-E |
| Native qualification, model export, signing | **not claimed** — requires the pinned environments and host integration evidence |

Platform-bound commands fail closed with exit `3` (missing prerequisites) —
never a silent pass (PRD §6.1).

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
