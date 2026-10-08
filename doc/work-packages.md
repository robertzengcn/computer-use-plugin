# Implementation work packages (design §9.1, CU-PLUGIN-22)

> 2026-10-06 scope note (E18): the portable rows below were labeled COMPLETE
> before the [PRD audit](2026-10-06-prd-audit-TODO.md) found portable defects
> E01–E18. Those defects are fixed in this checkout (archive closure, package
> hashing, release binding, replay identity, AX/W-1 bounds, subprocess bounds,
> manifest identities, eval provenance, public observe state, CI triggers).
> Remaining work is split into portable-done vs hardware/consumer-gated
> (M01–M10): Windows backend provisioning/launch (M02/M03), reference/export/
> parity/providers (M04/M05), fixtures/harness/native CI (M06/M08), Mac helper
> selection/build/signing (M07), delivery/upgrade (M09) and toolchain pins
> (M10). `model:prepare` verifies the approved cache and never downloads;
> fetching weights is always the maintainer's explicit action (design §6.6).
> The [Oct 3 TODO](2026-10-03-implementation-TODO.md) banner is history.

Every package names its owned paths, prerequisite pins, the exact commands a
maintainer runs, its outputs and a completion criterion checked against an
immutable candidate — never file presence. Handoffs record the exact artifact
version and digest (design §9.2).

Common setup (all packages): `npm ci` (Node 22 LTS via `.node-version`);
Python packages additionally need `uv` — each syncs its own locked env with
`uv sync --locked` run inside its directory (`adapters/windows/`, `grounding/`).

## Portable foundation — DONE (E01–E18 fixed, M-handoffs open)

| Package | Status | Verification commands (run from repo root) |
| --- | --- | --- |
| **P0-A Toolchain** | ✅ done | `npm run check` · `npm run build` |
| **P0-B Contracts** | ✅ done (producer side) | `npm run contracts:check` · `npm run contracts:build` · `cd adapters/windows && uv run pytest tests/test_contracts_conformance.py -q` · `cd grounding && uv run pytest tests/test_contracts_conformance.py -q` |
| **P2-B Evaluation core** | ✅ done (smoke scale) | `npm run eval -- replay --bundle test/fixtures/trace-bundle --runner recorded` · `npm run eval -- replay --bundle test/fixtures/trace-bundle --runner recorded --dataset w1-smoke` · `npm run eval -- compare --dataset w1-smoke --configs synthetic-deterministic,synthetic-b` |
| **Release verifier** | ✅ done (fixture level) | `npm run release:verify -- --manifest test/fixtures/release/good/release.json` |
| **W-1 workbook corpus** | ✅ done (synthetic) | `python3 test/fixtures/w1/generate.py && npx vitest run test/fixtures-w1.test.ts` |

## Spike and delivery packages — OPEN (hardware-gated)

| Package | Owned paths | Prerequisites | Exact commands | Output | Completion check |
| --- | --- | --- | --- | --- | --- |
| **P0-C Windows spike** | `adapters/windows/` | Windows 10/11 x64 with a controlled test window; uv | 1. `npm run backend:prepare -- --target win32-x64` (validates `adapters/windows/upstream.lock`, runs `uv sync --locked`)<br>2. `npm run backend:test -- --target win32-x64 --suite unit`<br>3. `npm run backend:test -- --target win32-x64 --suite native --allow-input` (interactive session required) | Pinned lock (`status: pinned`, revision, interpreter, digests), registered stdio backend, native spike report | Native report reviewed; integrity/window-at-point/W-1 cases pass on Windows; host accessibility W-1 + stop acceptance |
| **P0-D Model spike** | `grounding/` | Approved GUI-Actor-2B weights (~4.45 GB explicit fetch), provider GPU for claims | 1. Pin `grounding/models.lock.json` (`status: approved`, revisions, hashes)<br>2. `npm run model:prepare -- --config gui-actor-2b-fp16` (explicit fetch + cache verification)<br>3. `npm run model:export -- --config gui-actor-2b-fp16`<br>4. `npm run model:parity -- --config gui-actor-2b-fp16 --dataset w1-smoke` | Exported graphs/shards, staged parity report, provider/memory measurements | Per-stage parity within `grounding/configs/tolerances-v1.json`; each claimed provider measured on matching hardware; failed stage ⇒ unqualified |
| **P0-E Mac decision** | `adapters/macos/` | macOS 14+, Swift 6.2 | Compare Ghost fork vs `adapters/macos/swift-helper/` on the §5.3 criteria; record the winner in `adapters/macos/ghost-os/upstream.lock` | Decision report before any Phase 3 claim | Safety-gate failure cannot be offset by size/convenience |
| **P1 Windows artifact** | `adapters/windows/`, `packaging/windows/` | P0-C complete | `npm run package:build -- --target win32-x64` (on Windows) · `pwsh packaging/windows/build.ps1` | Launchable environment closure + W-1 observations | `release:verify` green; host accessibility W-1/stop acceptance |
| **P2-A Model artifact** | `grounding/` outputs | P0-D complete | `npm run model:export -- --config <id>` → `npm run release:verify -- --manifest <candidate>` | Qualified model file set, health fixture, licences, reports | Every claimed provider gate passes; host worker + catalog consumer acceptance |
| **P3 Mac artifact** | `adapters/macos/` (winner), `packaging/macos/` | P0-E decision | `npm run package:build -- --target darwin-arm64` (on macOS) · `bash packaging/macos/build.sh` → sign/notarize on the signed-host Mac | Signed/notarized helper, patch set, conformance report | Swift/unit/native suites + signed-host CU-MAC acceptance |
| **P4 Release operations** | `tooling/release/`, workflows | target artifacts | `npm run release:verify -- --manifest out/<candidate>/release.json` | Compatibility closure, upgrade notes, support matrix | Clean-machine/upgrade matrix jointly with AiFetchly/Hub; §9.2 handoff records consumer build + artifact digest |

## Handoff checklist fields (§9.2)

Every consumer handoff records: artifact role, exact version, SHA-256 digest,
contract/schema versions consumed, consumer build identity, and gate results
(or the named missing gate — never an implied pass). The release manifest's
`requiredEvidence` list is the machine-readable form.

## Environment-blocked note

P0-C/P0-D/P0-E, P1, P2-A and P3 require Windows, approved weights + GPU, and
a Mac respectively. Their commands fail closed with exit 3 until the pins
exist; the four `*-qualification.yml` workflows preflight the same gates and
report UNQUALIFIED rather than skipping.
