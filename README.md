# aifetchly-computer-use

First-party Computer Use plugin repository consumed by AiFetchly: versioned
contracts, desktop backend artifacts, grounding model exports, test fixtures,
evaluation tooling and reproducible release metadata. Windows ships first;
Apple Silicon macOS follows in Phase 3. Users install through AiFetchly and
need no developer tools.

- Product requirements: [`doc/computer-use-plugin-prd.md`](doc/computer-use-plugin-prd.md)
- Technical design: [`doc/computer-use-plugin-technical-design.md`](doc/computer-use-plugin-technical-design.md)
- Implementation plan (Phase 0): [`doc/plans/2026-09-27-phase0-foundation.md`](doc/plans/2026-09-27-phase0-foundation.md)

## Current status (portable E01–E09 fixes, 2026-10-11)

Portable verification: `npm run check` green (229 Vitest tests / 21 files,
23 schemas, 41 valid + 33 invalid fixtures). Windows: 113 passed + 3 skipped
(skips are not native qualification — native execution needs the P0-C Windows
machine; one skip is a Windows-only success-path test). Grounding: 76 passed.
See [`doc/2026-10-11-prd-remaining-TODO.md`](doc/2026-10-11-prd-remaining-TODO.md)
for the current audit: E01–E09 portable fixes are in this checkout, but no
requirement is fully complete — `release:verify` reports `candidate` (never
`qualified`) while locks are unpinned/unfetched, and T01–T09 still require
pinned environments, hardware runners, real weights and host/Hub consumer
evidence. The October 10/11 audit files are history for their closed
reproductions only, not for acceptance.

| Area | Status |
| --- | --- |
| TypeScript toolchain + §2.2 command contract | ✅ implemented, `npm run check` green |
| Contracts: 15 schemas + 74 conformance fixtures (41 valid, 33 invalid) + transforms + generated types + complete archive closure (E01/E02) | ✅ `npm run contracts:check` / `contracts:build` (extracted archive validates independently) |
| Offline evaluation CLI (replay/compare/report with full identity + provenance, E09/E15) | ✅ `npm run eval -- replay …` (no backend, no input); `compare` saves JSON/HTML via `--out` |
| Release verifier (report/case identity, per-model binding, semver/tuple/pin gates, package/launch/notice closure, Mac checks, N01–N05/N12) | ✅ `npm run release:verify -- --manifest …` (candidate vs qualified outcomes; Hub suite required) |
| Release assembler (explicit `--package` selection, provenance + pre-copy hash binding, containment, backup/restore publish, N06–N08) | ✅ `npm run release:assemble -- --version … [--source-commit …] [--package …] [--allow-dirty] --target …` (honored source identity with dirty-tree policy; unknown flags rejected; previous candidate restored on publish failure) |
| Windows backend integration package (E03/E10/E11/E12: hashed src closure, full lock validation, AX/W-1 bounds) | Portable units + packaging guards; native pin/provisioning/launch is P0-C/M02 (unpinned) |
| Grounding model engineering package (explicit processing identities; immutable/approved/symlink-safe cache) | Manifest/parity cores; weights/export/parity/provider qualification are P0-D/M04 (unfetched) |
| macOS backend | lock + allowlist scaffolds; helper artifact shape, launch schema and fat-slice signing checks exist in the verifier; Ghost-vs-Swift decision and helper build/signing are P0-E/M07 (no Swift source) |
| Native qualification, model export, signing, host/Hub integration | **not claimed** — requires pinned environments, hardware runners and consumer evidence (T02–T09) |

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
| Release maintainer | `npm run contracts:build`, `npm run package:build -- --target <t>`, `npm run release:assemble -- --version <v> [--source-commit <sha>] [--package <dir>] [--allow-dirty] --target <t>`, `npm run release:verify -- --manifest <path>` | Node only |

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
