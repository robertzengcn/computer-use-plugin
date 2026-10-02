# Implementation work packages (design §9.1, CU-PLUGIN-22)

Every package names its owned paths, prerequisite pins, local commands,
outputs and a completion criterion that is checked against an immutable
candidate — never file presence. Handoffs record the exact artifact version
and digest (design §9.2).

| Package | Owned paths | Prerequisites | Commands | Output | Completion check |
| --- | --- | --- | --- | --- | --- |
| **P0-A Toolchain** ✅ | `tooling/`, root configs | Node 22 LTS | `npm ci && npm run check && npm run build` | CLI framework, exit-code contract, bounded subprocess runner | Clean Node-only check/build; no desktop or model side effects — **done 2026-09-28** |
| **P0-B Contracts** ✅ | `contracts/`, `tooling/contracts/`, `test/contracts/` | P0-A | `npm run contracts:check && npm run contracts:build` | 12 schemas, 54 fixtures, semantic rules, generated types, checksummed archive | Conformance + drift + cross-language Python suites green; host decodes the pinned archive — **done 2026-09-28 (host consumer pending)** |
| **P0-C Windows spike** | `adapters/windows/`, `test/…` (native) | Windows 10/11 x64, controlled window | `npm run backend:prepare -- --target win32-x64`; `backend:test --suite unit`; `backend:test --suite native --allow-input` | Pinned `upstream.lock` (revision + interpreter), ctypes integrity/window-at-point, registration surface, spike report | Native spike report reviewed; integrity/window-at-point cases pass on Windows; entrypoint starts from the pin |
| **P0-D Model spike** | `grounding/` | Approved weights, GPU for claimed providers | `npm run model:prepare -- --config gui-actor-2b-fp16`; `model:export`; `model:parity` | Pinned `models.lock.json` (status approved), exported graphs + parity report, resource measurements | Per-stage parity within frozen tolerances; every claimed provider measured on matching hardware; failed stage ⇒ configuration unqualified |
| **P0-E Mac decision** | `adapters/macos/` | macOS 14+, Swift 6.2 | Ghost checkout at pin vs `swift-helper/` prototype | §5.3 decision report (AX coverage, CJK, geometry, signing, cancellation, size, maintenance) | Decision recorded before any Phase 3 claim; safety-gate failure cannot be offset |
| **P1 Windows artifact** | `adapters/windows/`, `packaging/windows/` | P0-C complete | `npm run package:build -- --target win32-x64` | Lifecycle-conformant backend, W-1 observations, platform closure | Backend suites + `release:verify` green; host accessibility W-1 + stop acceptance |
| **P2-A Model artifact** | `grounding/` export outputs | P0-D complete | `model:export`, `model:parity`, `release:verify` | Qualified model file set, health fixture, licences, reports | Every claimed provider gate passes; host worker + catalog consumer acceptance |
| **P2-B Evaluation** ✅ (core) | `eval/`, `eval/datasets/` | P0-B | `npm run eval -- replay/compare` | Replay/compare reports, W-1 smoke dataset, workbook corpus | Offline CLI tests prove no backend launch; report round-trip; remaining: held-out growth — **core done 2026-09-30** |
| **P3 Mac artifact** | `adapters/macos/` (winner), `packaging/macos/` | P0-E decision | `npm run package:build -- --target darwin-arm64` | Signed/notarized helper, patch set, conformance report | Swift/unit/native suites + signed-host CU-MAC acceptance |
| **P4 Release operations** | `tooling/release/`, workflows | target artifacts | `npm run release:verify -- --manifest <path>` | Compatibility closure, upgrade notes, support matrix | Clean-machine/upgrade matrix jointly with AiFetchly/Hub; §9.2 handoff records consumer build + artifact digest |

## Handoff checklist fields (§9.2)

Every consumer handoff records: artifact role, exact version, SHA-256 digest,
contract/schema versions consumed, consumer build identity, and the gate
results (or the named missing gate — never an implied pass). Template lives
with the release manifest: one row per artifact in `requiredEvidence`.

## Environment-blocked note

P0-C/P0-D/P0-E, P1, P2-A and P3 require Windows, approved weights + GPU, and
a Mac respectively. The Linux workstation this repository was bootstrapped on
cannot execute them; their commands fail closed with exit 3 until the pins
exist. The four `*-qualification.yml` workflows preflight the same gates and
report UNQUALIFIED rather than skipping.
