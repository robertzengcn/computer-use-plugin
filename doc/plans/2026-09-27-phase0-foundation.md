# Computer Use Plugin — Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the `aifetchly-computer-use` repository per PRD §7.1 implementation order: P0-A (TypeScript toolchain) and P0-B (versioned contracts + fixtures) fully implemented and verified Node-only, plus honest scaffolds for the platform spikes (P0-C/D/E), the offline evaluation CLI (P2-B groundwork), release verification tooling, packaging, and CI.

**Architecture:** One private TypeScript developer-tools package at the repo root (strict NodeNext ESM, Vitest, ESLint, Ajv 2020-12). Canonical JSON Schemas live under `contracts/` with positive/negative fixtures and generated `.d.ts` declarations. The evaluation CLI and release verifier consume only local files and bounded subprocess runners — no desktop backend, no model weights. Python components (`adapters/windows/`, `grounding/`) are independent uv projects whose platform-neutral logic is unit-tested on Linux with mocked Win32/torch boundaries. macOS/packaging/CI are scaffolds that fail closed until their Phase 0 spikes pin real upstream revisions.

**Tech Stack:** TypeScript 5.x / Node 22 LTS (npm, `.npmrc` → npmmirror registry), Vitest, ESLint, Ajv 8 (2020-12 dialect), json-schema-to-typescript; Python 3.14 + uv + pytest for the two Python packages.

**Environment constraints verified on this machine (Linux/WSL2):**
- npm default registry is unreachable; `registry.npmmirror.com` works → project `.npmrc`.
- PyPI reachable via uv.
- No Windows, no macOS, no GPU, no model weights → native/backend:model commands must exit `3` (missing prerequisites) exactly as the §2.2 command contract requires. Windows/Mac unit tests run directly via uv/pytest where platform-neutral; Windows-only tests are `skipif`-gated.

---

## File Structure (final state)

```text
computer-use-plugin/
├── .npmrc  .node-version  .gitignore  README.md  THIRD_PARTY_NOTICES
├── package.json  package-lock.json  tsconfig.json  eslint.config.js  vitest.config.ts
├── doc/plans/2026-09-27-phase0-foundation.md        (this plan)
├── tooling/
│   ├── cli.ts                    # arg parsing, exit codes 0/1/2/3/4, --json envelope
│   ├── commands.ts               # command registry (npm-script → TS entry)
│   ├── contracts/
│   │   ├── registry.ts           # local $id/$ref resolver, no network
│   │   ├── validate.ts           # fixtures:check / conformance runner
│   │   ├── generate-types.ts     # schema → .d.ts + drift check
│   │   └── archive.ts            # contracts:build → out/<run>/ zip + digest
│   ├── processes/run.ts          # bounded child process (argv[], shell:false, deadline, cancel, byte caps)
│   └── release/
│       ├── schemas/release-manifest-v1.schema.json
│       ├── hash.ts               # sha256 file/dir, canonical json digest
│       └── verify.ts             # release:verify closure/evidence gates
├── plugin/
│   ├── manifest.json             # identity, localAiRuntimes, compatibility
│   ├── tools.md                  # 9 public tool descriptions
│   └── skills/computer-use.md
├── contracts/
│   ├── registry.json             # $id → path map (the packaged local registry)
│   ├── tools/public-tools-v1.schema.json
│   ├── desktop/{error,capabilities,observation,action}-v1.schema.json
│   ├── grounding/{capabilities,request,result}-v1.schema.json
│   ├── models/model-manifest-v1.schema.json
│   ├── traces/trace-manifest-v1.schema.json
│   ├── types/*.d.ts              # generated declarations (committed, drift-checked)
│   └── fixtures/
│       ├── manifest.json         # {schema, file, expectation}[] machine-readable index
│       ├── tools/ desktop/ grounding/ models/ traces/   (valid/ + invalid/)
│       └── transforms/           # golden coordinate geometry cases + invalid cases
├── eval/
│   ├── cli.ts                    # replay / compare subcommands
│   ├── datasets/dataset-manifest-v1.schema.json + w1-smoke/*.json
│   ├── metrics/hits.ts           # region-hit, absence false-accept, percentiles
│   ├── report.ts                 # report-v1 assembly + JSON/HTML renderers
│   └── runner/{profiles.json, recorded.ts, synthetic.ts}
├── adapters/windows/
│   ├── pyproject.toml  uv.lock  .python-version  upstream.lock
│   ├── tool-allowlist.json  launch-profile.json
│   ├── src/aifetchly_windows/{__init__,entrypoint,integrity,window_at_point,normalize,allowlist}.py
│   └── tests/test_{integrity,window_at_point,normalize,allowlist,entrypoint}.py
├── adapters/macos/ghost-os/{upstream.lock,tool-allowlist.json} + ../README.md
├── grounding/
│   ├── pyproject.toml  uv.lock  .python-version  models.lock.json
│   ├── configs/{gui-actor-2b-fp16.json, gui-actor-2b-int4.json, tolerances-v1.json}
│   ├── src/aifetchly_grounding/{reference/decode.py, export/shard.py, export/manifest.py, parity/compare.py}
│   └── tests/test_{decode,shard,manifest,parity}.py
├── packaging/windows/build.ps1  packaging/macos/build.sh  (thin shims → node tooling)
├── test/                         # Vitest suites (tooling/, contracts/, eval/, release/)
└── .github/workflows/{portable-checks,windows-unit,mac-unit,model-smoke,release-verify}.yml
```

---

## Task 0: Git init + root toolchain (P0-A)

**Files:** `.gitignore`, `.npmrc`, `.node-version`, `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `tooling/cli.ts`, `tooling/commands.ts`, `test/tooling/cli.test.ts`

- [ ] `git init -b main`; `.gitignore`: `node_modules/ dist/ out/ .venv/ __pycache__/ .pytest_cache/ .ruff_cache/ .uv-cache/ *.onnx *.safetensors coverage/`
- [ ] `.npmrc`: `registry=https://registry.npmmirror.com`
- [ ] `.node-version`: `22.19.0`; `package.json` `packageManager: "npm@10.9.3"`, `"type":"module"`, `"private":true`
- [ ] `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module NodeNext`, `target ES2023`, `outDir dist`, excludes `adapters/** grounding/** test/fixtures/**`
- [ ] Dev deps: `typescript`, `vitest`, `@vitest/coverage-v8`, `eslint`, `typescript-eslint`, `ajv`, `json-schema-to-typescript`, `@types/node`
- [ ] `package.json` scripts — the full §2.2 contract: `check`, `build`, `contracts:check`, `contracts:build`, `backend:prepare`, `backend:test`, `model:prepare`, `model:export`, `model:parity`, `eval`, `package:build`, `release:verify` — each `node dist/tooling/cli.js <command>` so raw node works without npx ts runners
- [ ] **TDD** `test/tooling/cli.test.ts` first: parse `--flag value`/positional; exit code mapping `ok→0, failed→1, invalidArgs→2, missingPrerequisites→3, cancelled→4`; `--json` prints one JSON envelope `{status, command, result?, errors?}` to stdout, diagnostics to stderr
- [ ] `tooling/cli.ts`: `parseArgs(argv: string[]): ParsedArgs`; `type CliOutcome = 'ok'|'failed'|'invalidArgs'|'missingPrerequisites'|'cancelled'`; `runCommand(...)` dispatch via `tooling/commands.ts` registry; unknown command → `invalidArgs` + usage
- [ ] Commands not yet implemented dispatch to a stub returning `missingPrerequisites` with an explicit `"not implemented in phase 0"` message (contract-faithful fail-closed)
- [ ] `npm ci` (via mirror) → `npm run build` → `npx vitest run` green → commit `feat: bootstrap toolchain, cli framework and command contract`

## Task 1: Bounded subprocess runner (P0-A)

**Files:** `tooling/processes/run.ts`, `test/tooling/processes.test.ts`

- [ ] **TDD** tests first, using `node -e` children:
  - passes argv array with `shell:false` (arg containing spaces arrives intact)
  - captures stdout/stderr separately; JSON on stdout parseable
  - `timeoutMs` kills long child → outcome `cancelled`/`failed` with `timedOut:true`, SIGKILL escalation after grace
  - `AbortSignal` cancellation same path
  - `maxOutputBytes` truncates and flags `truncated:true` (no unbounded memory)
  - non-zero exit surfaces `exitCode`; spawn ENOENT → typed error
- [ ] `runProcess(options: RunProcessOptions): Promise<ProcessResult>` — `spawn(argv[0]!, argv.slice(1), {shell:false, cwd, env})`, accumulate with cap, deadline timer, `sigterm → 2s → sigkill`, return `{exitCode, stdout, stderr, timedOut, truncated, durationMs}`. Pure immutable options; no mutation of inputs. Export `buildArgv` helper used by later python/uv wrappers.
- [ ] Commit `feat: bounded child-process runner with deadlines and cancellation`

## Task 2: Desktop + tool schemas (P0-B)

**Files:** `contracts/registry.json`, `contracts/desktop/*-v1.schema.json`, `contracts/tools/public-tools-v1.schema.json`, plus fixtures in Task 5

- [ ] `registry.json`: `{ "version": 1, "schemas": [{ "$id": "https://aifetchly.dev/schemas/desktop/error-v1.json", "path": "desktop/error-v1.schema.json" }, ...] }` — every schema gets a stable `$id`; loader resolves only through this map (unknown `$ref` → error, never network)
- [ ] `desktop/error-v1.schema.json`: `$defs` → `errorCode` enum with **all 22 codes** from design §3.3 (`ai_disabled … stop_hotkey_unavailable, host_elevated`); object: `errorCode, message (safe, maxLength 500), stage, retryClass: 'none'|'retry_same'|'retry_after_reobserve'|'handoff', correlationId`; `unsupported_target` carries `reason` enum (`elevated_window|own_window|protected_view|unsupported_app|unsupported_display`); `model_not_ready` carries `readiness` string; `additionalProperties: false`
- [ ] `desktop/capabilities-v1.schema.json`: `backendVersion, protocolVersion, contractVersion, supportedActions[]` (enum of `click|type|scroll|move|drag|keys|key`), `permissions{accessibility, screenRecording, inputMonitoring}`, `plannerMode: local_only|visual_planner`, `displaySupport{multiMonitor, mixedDpi}`, `grounder{state, provider}`
- [ ] `desktop/observation-v1.schema.json`: `metadata` = ObservationMetadata per design §3.2 (all 12 fields, `captureWidthPx/HeightPx` integer ≥1, `sessionGeneration` ≥0, ISO-8601 `capturedAt`, 64-hex `imageSha256`); `state` bounded: `windows[]` (id, title ≤200 chars, processId ≥0, frame{x,y,w,h} finite), `focusedWindowId?`, `axTree?` with `elementCount` ≤ `maxElements` and `truncated: boolean`
- [ ] `desktop/action-v1.schema.json`: discriminated `action` (`click{targetHandle, button, count?}`, `type{text maxLength}`, `scroll{direction, amount}`, `move`, `drag`, `keys{combo}`) — **target handles only, never raw coordinates** (CU-PLUGIN-02); `outcome` = `ActionOutcome` per §3.2 (`state: not_dispatched|dispatched|failed|uncertain`, `verification`, optional `postObservationId/errorCode`)
- [ ] `tools/public-tools-v1.schema.json`: map of the 9 public tools → `{name, description, inputSchemaRef, resultSchemaRef}` with names enum `computer_capabilities|computer_start_session|computer_observe|computer_find|computer_act|computer_verify|computer_request_handoff|computer_resume_after_handoff|computer_stop_session`; `computer_find` result includes `target_not_found|target_ambiguous` + `groundingSource`
- [ ] All schemas: `$schema: "https://json-schema.org/draft/2020-12/schema"`, `additionalProperties:false` on authority-bearing records, finite numeric bounds (`exclusiveMinimum: 0` etc.), required arrays explicit
- [ ] Commit `feat: desktop and public-tool schemas v1`

## Task 3: Grounding, model, trace schemas (P0-B)

**Files:** `contracts/grounding/*-v1.schema.json`, `contracts/models/model-manifest-v1.schema.json`, `contracts/traces/trace-manifest-v1.schema.json`

- [ ] `grounding/capabilities-v1.schema.json`: `contractVersion, adapterId, adapterVersion, acceptedArchitectures[], acceptedManifestVersions[], onnxRuntime{version, providers[]}`, `image{formats[], maxPixels, maxBytes, cropSupported}`, `output{point, region, heatmap, absencePolicy}`, `cooperativeCancel: boolean`
- [ ] `grounding/request-v1.schema.json`: envelope `{contractVersion, requestId, sessionGeneration, observationId, modelConfigurationId}`; `image{format, widthPx, heightPx, sha256?, crop?{x,y,w,h} in capture pixels with bounds check via maximum/exclusiveMinimum}`; `task{description ≤1000 chars, maxCandidates?, pixelBudget?}`
- [ ] `grounding/result-v1.schema.json`: **either** `candidates[]` (`geometry{point?{x,y}, region?{x,y,w,h}}` in `coordinateSpace: capture_pixels|model_input_pixels`, bounds-consistency stated via `imageDimensions` echo; `scores[]` with `name, value, semantics, version` — no assumed cross-model confidence) + `preprocessing{crop?, resize{inW,inH,outW,outH}, padding?, transformToCapture}` + `diagnostics{stageTimings, executionProvider, inferenceMs, attentionGrid?}`; **or** typed `failure` using the §3.3 code subset (`target_not_found, target_ambiguous, invalid_grounding_output, action_cancelled, resource_limit, backend_unavailable, model_not_ready, protocol_mismatch`) — point-only output without heatmap valid (CU-PLUGIN-03)
- [ ] `models/model-manifest-v1.schema.json` per design §6.4: `packageKind:"grounding-model"`, `runtimeId`, `version`, `upstream{modelId, revision, licence, baseModel{ id, licence }}`, `identity{contractVersion, adapterId, architecture, manifestVersion, preprocessingRevision, decodingRevision, calibrationRevision}`, `export{pipelineVersion, exporter, opset ≥7, quantization}`, `preprocessing` GUI-Actor constants (`patchSize:14, mergeSize:2, temporalPatchSize:2, pointerPadTokenId:151661, pixelBounds, defaultPixelBudget)`, `graphs[]{name ≤512MiB check done at verify not schema, inputs[], outputs[]}`, `executionProviders[]`, `files[]{path, bytes ≤ 1073741824, sha256 64-hex}`, envelope limits (`≤128 files, ≤8 GiB total` — enforced by verifier + declared as `limits`), `licences[]`, `parityReport{sha256, fixtureCount}`, `healthFixture{path, expectedPath}`; licence field enum includes `apache-2.0|mit|qwen-research-non-commercial` so release tooling can **block** the latter (CU-INST-11)
- [ ] `traces/trace-manifest-v1.schema.json` per design §3.6: `schemaVersion, traceId, contractVersions{tools, desktop, grounding}, target{windowTitle?, appId?, consent: boolean}`, `plannerMode`, `steps[]{stepId, observation?, grounding?, action?, verification?}` file references with `redacted: boolean` default true
- [ ] Commit `feat: grounding, model-package and trace schemas v1`

## Task 4: Local registry + conformance validator (P0-B)

**Files:** `tooling/contracts/registry.ts`, `tooling/contracts/validate.ts`, `test/tooling/contracts-registry.test.ts`

- [ ] **TDD**: registry resolves every `$id` in `contracts/registry.json`; unknown `$ref` target throws `SchemaReferenceError` (proves no-network fail-closed); duplicate `$id` detection
- [ ] `registry.ts`: `loadRegistry(contractsDir): Map<$id, schema>` via Ajv `addSchema` (2020-12 instance `new Ajv2020({allErrors:true, strict:false})`); compile cache
- [ ] **TDD** validator: every `expectation:"valid"` fixture passes its schema; every `expectation:"invalid"` fixture fails **and** the failure includes the named keyword; manifest referencing a missing file → hard error (CU-PLUGIN-18)
- [ ] `validate.ts`: `runConformance(contractsDir): ConformanceReport {schemaCount, validCount, invalidCount, failures[]}`; exit `1` when any expectation is violated or a required family has zero fixtures; deterministic diagnostics `schema/file/instancePath/keyword`
- [ ] Commit `feat: local schema registry and fixture conformance runner`

## Task 5: Fixtures corpus (P0-B) — positive + negative

**Files:** `contracts/fixtures/manifest.json`, `contracts/fixtures/{tools,desktop,grounding,models,traces}/{valid,invalid}/*.json`

- [ ] `manifest.json`: array `{schema: "<$id>", file: "desktop/invalid/error-unknown-code.json", expectation: "valid"|"invalid", description}` — split/consent never inferred from filename (CU-PLUGIN-19 style discipline)
- [ ] Minimum per family — **valid**: error (each retryClass, unsupported_target w/ reason), capabilities (both planner modes), observation (visual + accessibility mode, truncated axTree), action outcome (all 4 states incl. `uncertain`), public tools (all 9), grounding request (with crop) / result (point-only **without** heatmap — CU-PLUGIN-03; region+scores; typed failure `target_ambiguous`), model manifest (fp16 config with sharded files, MIT+Apache-2.0 chain), trace manifest
- [ ] **invalid**: `error-unknown-code`, `error-message-with-path-leak` (message containing `/Users/` rejected by `pattern: "^[^/]*$"`? — no: use `not: {pattern: "(^|\\s)(/|[A-Z]:\\\\)"}`), `observation-negative-dimensions`, `observation-bad-sha`, `action-raw-coordinates` (action input carrying `x/y` → rejected by `additionalProperties:false`), `grounding-result-desktop-coordinates` (`coordinateSpace:"desktop_physical_pixels"` not in enum), `grounding-result-nonfinite` (NaN rejected via `type:number` + bounds), `model-manifest-noncommercial-licence` (valid schema-wise — used later by release gate test, expectation `valid` here + separate licence-gate fixture for release verify), `model-manifest-oversize-file`, `trace-manifest-missing-consent`
- [ ] `contracts:check` green over the whole corpus; commit `feat: conformance fixtures for all contract families`

## Task 6: Transform fixtures (coordinate geometry golden cases)

**Files:** `contracts/fixtures/transforms/*.json` + entry in `manifest.json` (schema `transforms-v1` defined in `desktop/`? no — standalone `contracts/fixtures/transforms/transforms-v1.schema.json` for the case envelope)

- [ ] Case envelope schema: `{id, kind:"transform", input{capture{w,h}, window{frame, origin}, resize?{outW,outH}, crop?, padding?, executorUnits, dpi?}, expected{captureToDesktop, modelToCapture?, roundTripTolerance}, invalid?:true, invalidReason}`
- [ ] Golden cases from design §3.5: Windows 100%/150% DPI mapping; Retina 2× points↔pixels; anisotropic resize (different x/y scale); negative-origin multi-monitor; moved window (old geometry → stale, expected rejection flag); crop offset math; padding shift; **invalid**: mixed-scale mismatch, crop outside bounds, non-finite frame
- [ ] A Vitest "oracle" test recomputes each expected mapping with an independent formula and asserts the fixture value (fixtures are data the host will implement against — they must be self-consistent)
- [ ] Commit `feat: coordinate transform golden fixtures with independent oracle check`

## Task 7: Type generation + drift check + contracts:build (P0-B)

**Files:** `tooling/contracts/generate-types.ts`, `tooling/contracts/archive.ts`, `contracts/types/*.d.ts`, `test/tooling/contracts-types.test.ts`

- [ ] **TDD**: generation is deterministic (two runs byte-identical); drift check fails when a committed `.d.ts` is stale (test mutates temp copy)
- [ ] `generate-types.ts`: `json-schema-to-typescript` compile each schema → `contracts/types/<name>.d.ts`; `--check` mode diffs against committed → exit `1` on drift (CU-PLUGIN-16 "generated outputs reproducible")
- [ ] `archive.ts`: `contracts:build` → `out/contracts-<version>/` containing schemas + fixtures + types + `manifest.json` (version, file list, sha256 each, aggregate digest = sha256 of canonical JSON of list) → zip `computer-use-contracts-<version>.zip`; refuses when `contracts:check` fails (runs it first)
- [ ] Commit `feat: declaration generation, drift gate and contract archive builder`

## Task 8: Plugin manifest + descriptions

**Files:** `plugin/manifest.json`, `plugin/tools.md`, `plugin/skills/computer-use.md`

- [ ] `manifest.json`: `{"id":"aifetchly-computer-use","version":"0.1.0","contractVersions":{...pinned to v1...},"platforms":["win32-x64"],"localAiRuntimes":[{"runtimeId":"grounding-onnxruntime","minVersion":"0.1.0"},{"runtimeId":"grounding-model-gui-actor-2b-fp16","minVersion":"0.1.0"}],"backend":{"windows":{"status":"spike-pending"}},"mac":{"status":"spike-pending"}}` — no URLs, no executable entries (Hub/§7.1 boundary)
- [ ] `tools.md`: all 9 public tools with input/result semantics from design §3.1 table, target-handle (never coordinate) rule stated
- [ ] Vitest test validates `plugin/manifest.json` against a `plugin-manifest-v1` schema added under `contracts/tools/` (same registry) — schema drift impossible
- [ ] Commit `feat: plugin manifest and public tool descriptions`

## Task 9: Eval CLI — replay/compare, metrics, reports (P2-B groundwork)

**Files:** `eval/cli.ts`, `eval/runner/{profiles.json,recorded.ts,synthetic.ts}`, `eval/metrics/hits.ts`, `eval/report.ts`, `eval/datasets/{dataset-manifest-v1.schema.json, w1-smoke/dataset.json}`, `test/eval/*.test.ts`, plus a synthetic trace bundle fixture under `test/fixtures/trace-bundle/`

- [ ] `dataset-manifest-v1.schema.json` per design §8.4: cases `{id, contentSha256, provenance, consentClass: synthetic|reviewed, split: regression|calibration|held_out, taskDescription, imageRef{path,sha256}, expected{region? | absent | ambiguous | error}, displayMetadata{scaling, theme, locale}}`
- [ ] **TDD metrics**: `pointInRegion(point, region)` inclusive edges; `regionHit(candidate, expectedRegion)` any-inside-counts per §8.2; absence case fails if **any** candidate accepted (false-accept counter); `percentiles([t], p50/p95/max)` linear interpolation
- [ ] **TDD replay**: given `--bundle test/fixtures/trace-bundle` with `runner: recorded` profile → report echoes `manifest` identities (model config id, preprocessing/decoding/calibration revisions, contract versions); **mismatched identity → exit 1 with explicit "incompatible configuration", never substitutes** (design §3.6); replay output contains **zero** `action.dispatched` side effects — the invariant test asserts the report is produced from recorded candidates only and that `eval/` sources import no `child_process`/`node:child_process` (CU-PLUGIN-12)
- [ ] `runner/synthetic.ts`: deterministic stub (sha256-seeded candidate placement) so compare mode is testable without models; labelled `runner: "synthetic-deterministic"` in reports — never presented as model accuracy (design §8.4 runner labelling)
- [ ] **TDD compare**: `--dataset w1-smoke --configs a,b` → per-case Δgeometry, hit-rate deltas, latency table; identical evidence both arms (same fixture hashes asserted in report)
- [ ] `report.ts`: `report-v1` object per design §8.4 field groups (run/config/perCase/aggregate/qualification) + `reportSchemaRef`; JSON renderer always; HTML renderer minimal `<table>` dump; **empty executed-set or skipped-required-case → aggregate.qualification.missingEvidence non-empty → exit 1** (CU-PLUGIN-19)
- [ ] CLI wiring: `npm run eval -- replay|compare` through `tooling/commands.ts`; exit codes per contract
- [ ] Commit `feat: offline evaluation CLI with replay, compare and report schema`

## Task 10: Release verification tooling (P0/P4 groundwork)

**Files:** `tooling/release/{schemas/release-manifest-v1.schema.json, hash.ts, verify.ts}`, `test/release/*.test.ts`, fixtures `test/fixtures/release/{good,missing-evidence,wrong-platform}/release.json`

- [ ] `release-manifest-v1.schema.json` per design §7.4: `schemaVersion, releaseVersion, sourceCommit, lockDigests{...}, contractArchive{version, sha256}, artifacts[]` each `{role: contracts|plugin|windows-env|mac-native|model|evidence, platform? , location, bytes, sha256, launchProfile?, signingIdentity?, compatibleWith{hostAppRange?, adapterId?, runtimeId?}, evidenceRequired: boolean}`
- [ ] **TDD hash**: file sha256 matches known vector (empty string, `abc`); dir digest deterministic across orderings (sort paths)
- [ ] **TDD verify** (each fixture): `good` → exit 0; `missing-evidence` (model role artifact without parity report digest) → exit 1 naming the artifact+gate; `wrong-platform` (windows-env artifact claiming darwin) → exit 1; hash mismatch → exit 1; **non-commercial licence in a referenced model manifest → exit 1 blocked** (CU-INST-11); skipped/absent required evidence is never a pass (CU-PLUGIN-21)
- [ ] `verify.ts`: validates manifest against schema → closure (every file exists, size+sha match) → per-role gates (notices present for code+model; evidence entries reference existing report files whose `qualification` is non-empty; mac-native requires signingIdentity) → prints human or `--json` summary
- [ ] Commit `feat: release manifest schema, hashing and closure/evidence verifier`

## Task 11: Windows adapter scaffold (P0-C groundwork)

**Files:** `adapters/windows/{pyproject.toml, .python-version, upstream.lock, tool-allowlist.json, launch-profile.json, src/aifetchly_windows/*.py, tests/*.py}`

- [ ] `pyproject.toml`: package `aifetchly-windows`, requires-python `>=3.14`, deps on pinned `windows-mcp` **commented as pending Phase 0 pin** — the file declares dev deps (pytest, ruff) now; runtime upstream dep is added only when the spike pins it (no floating dep ever)
- [ ] `upstream.lock`: `{"$schema":".../adapters/windows/upstream-lock-v1.json", "status":"unpinned", "upstream":"https://github.com/CursorTouch/Windows-MCP", "selectedRevision": null, "notes":"Phase 0 P0-C selects the immutable revision; pythonVersion to be pinned from it"}` — verifier treats `status != "pinned"` as not qualified
- [ ] `tool-allowlist.json`: reviewed subset only (`screenshot, display info, app/window focus, click, type, scroll, move/drag, keys` + extension `process_integrity, window_at_point`) and explicit `deny` list (`powershell, registry, filesystem, process, telemetry`)
- [ ] **TDD (pytest, runs on Linux)** `test_allowlist.py`: allowlist loader rejects duplicates, denies-by-default unknown tools, `deny` entries can never appear in `allow`
- [ ] `integrity.py`: pure function `parse_integrity_level(sid_bytes: bytes) -> str` mapping sub-authority RID → `low|medium|high|system` (RID 0x1000/0x2000/0x4000/0x4000+ ranges, 4096/8192/12288/16384) + `ctypes`-behind-`_winapi.py` shim (`OpenProcess/GetTokenInformation`) that raises `UnsupportedPlatformError` off-Windows; tests feed synthetic SID byte strings incl. malformed → explicit error, no guessing (CU-PLUGIN-06)
- [ ] `window_at_point.py`: `resolve(point) -> WindowAtPointResult` calling `_winapi` chain (`WindowFromPoint → GetAncestor(GA_ROOT) → GetWindowThreadProcessId`); Linux tests mock the winapi layer, including closed-handle/reused-PID error paths → typed failures
- [ ] `normalize.py`: `normalize_ax_tree(raw, max_depth, max_elements)` → bounded tree + `elementCount/truncated`; tests: large tree truncation flag, CJK labels preserved, empty → explicit empty result, missing geometry → typed error not null-silence
- [ ] `entrypoint.py`: reads allowlist, wires stdio server registration surface; **exits 3-style `BackendNotPinnedError` when `upstream.lock.status != "pinned"`** (fail closed, honest scaffold); unit test asserts this
- [ ] `launch-profile.json`: `{argv:["<managed-python>","-m","aifetchly_windows.entrypoint"], cwd:"<managed>", envPolicy:{inherit:["SYSTEMROOT","TEMP"], telemetry:"disabled"}, stdio:"jsonrpc"}` — no global PATH writes
- [ ] Run `uv sync && uv run pytest` in `adapters/windows/` → green; commit `feat: windows adapter scaffold - integrity, window-at-point, normalizer`

## Task 12: Grounding scaffold (P0-D groundwork)

**Files:** `grounding/{pyproject.toml, .python-version, models.lock.json, configs/*.json, src/aifetchly_grounding/**/*.py, tests/*.py}`

- [ ] `models.lock.json`: GUI-Actor-2B entry `{modelId:"microsoft/GUI-Actor-2B-Qwen2-VL", revision:null(pending), weightsSha256:null, licences:{weights:"mit", base:"apache-2.0", baseModelId:"Qwen/Qwen2-VL-2B-Instruct"}, commercial use:"allowed"}` + 3B entry `commercialUse:"blocked"` (`qwen-research-non-commercial`) + explicit `status:"unfetched"` — downloads are explicit `model:prepare`, never implicit (design §6.6)
- [ ] **TDD `reference/decode.py`** — the GUI-Actor postprocess (design §6.2 step 6) in pure Python: `decode_candidates(attention_grid: list[list[float]], patch_threshold_ratio=0.3)` → keep patches ≥ `0.3×max`, group **4-connected** components, rank by mean activation, activation-weighted centers normalized `[0,1]`; tests: single-peak grid, two-separated-blobs ranking, empty/all-below-threshold → `[]` (absence path), tie ordering deterministic
- [ ] **TDD `export/shard.py`**: `plan_shards(file_specs, max_bytes=512*1024*1024, max_files=128, total_cap=8GiB)` → greedy partition honoring §6.4 producer limits; oversize single input → typed error; boundary-exact fits
- [ ] **TDD `export/manifest.py`**: `build_manifest(files, config, licences)` → model-manifest-v1-shaped dict; missing licence entry → error; **non-commercial base → `blocked` flag** release tooling consumes
- [ ] **TDD `parity/compare.py`**: `stage_compare(reference, actual, tolerances)` → per-stage `{maxAbsError, maxRelError, pass}`; region-hit agreement `regions_match(a, b)` center-in-region semantics; divergence report names the failing stage (design §6.3)
- [ ] `configs/`: `gui-actor-2b-fp16.json`, `gui-actor-2b-int4.json` (`quantization:"int4-weight-only-decoder"`, vision encoder fp16), `tolerances-v1.json` per-stage abs/rel + region-hit requirement
- [ ] Reference/export wrappers that need torch/onnx keep **lazy imports** with typed `MissingWeightsError`/`MissingToolchainError` — tests assert the lazy failure without torch installed
- [ ] `uv sync && uv run pytest` in `grounding/` → green; commit `feat: grounding package - decode, sharding, manifest and parity cores`

## Task 13: Mac scaffold + packaging shims + notices

**Files:** `adapters/macos/{README.md, ghost-os/{upstream.lock, tool-allowlist.json}}`, `packaging/windows/build.ps1`, `packaging/macos/build.sh`, `THIRD_PARTY_NOTICES`, `README.md` (root)

- [ ] `ghost-os/upstream.lock`: same unpinned structure, recording inspected constraints (`swiftTools:"6.2", macos:"14+"`, MIT) with `status:"unpinned"` — decision deferred to P0-E per PRD §8
- [ ] `ghost-os/tool-allowlist.json`: from design §5.2 — allow observation (`ghost_context, ghost_state, ghost_find, ghost_read, ghost_inspect, ghost_element_at, ghost_screenshot`), allow atomic input (`ghost_click, ghost_type, ghost_press, ghost_hotkey, ghost_scroll, ghost_hover, ghost_drag, ghost_focus`), **deny** vision (`ghost_ground, ghost_parse_screen`), workflows (`ghost_run, recipe*, ghost_learn_*`), broad window ops — deny-by-default
- [ ] `packaging/windows/build.ps1` + `packaging/macos/build.sh`: thin, versioned shims that (1) refuse when the corresponding `upstream.lock.status != "pinned"` (exit 3), (2) otherwise invoke `node dist/tooling/cli.js package:build --target ...`; testable logic stays in TS
- [ ] `THIRD_PARTY_NOTICES`: Ajv (MIT), typescript (Apache-2.0), vitest (MIT), GUI-Actor (MIT), Qwen2-VL-2B (Apache-2.0), Windows-MCP/Ghost OS entries marked *to be completed at pin time* — honest, no invented licence claims
- [ ] Root `README.md`: §2.5 developer workflows — what each role runs, what requires which platform, current phase status
- [ ] Commit `feat: mac scaffold, packaging shims, notices and readme`

## Task 14: CI workflows + final gates

**Files:** `.github/workflows/{portable-checks,windows-unit,mac-unit,model-smoke,release-verify}.yml`

- [ ] `portable-checks.yml`: matrix `[ubuntu-latest, windows-latest, macos-latest]` × `npm ci && npm run check && npm run build && npm run contracts:check` — path-filtered to `tooling|contracts|eval|test|package.json` (§8.5)
- [ ] `windows-unit.yml`: windows-latest, `uv sync && uv run pytest` in `adapters/windows/`; `mac-unit.yml`: macos-14, lock consistency checks (build is spike-gated); `model-smoke.yml`: ubuntu, grounding pytest; `release-verify.yml`: manual `workflow_dispatch` with candidate manifest → `npm run release:verify`
- [ ] **Final verification on this machine**: `npm run check` green; `npm run build` green; `npm run contracts:check` + `contracts:build` green; `npm run eval -- replay --bundle test/fixtures/trace-bundle --runner recorded` green; `npm run release:verify -- --manifest test/fixtures/release/good/release.json` green (in CI fixtures only — noted as fixture, not product evidence); `uv run pytest` green in both Python packages; coverage ≥80% on `tooling/`+`eval/` reported honestly
- [ ] Commit `feat: ci matrix and phase 0 completion gates` → final summary mapping deliverables to CU-PLUGIN-01..04/11..12/15..19 and honestly listing what remains for P0-C/D/E spikes

---

## Self-Review notes

- **Spec coverage:** P0-A → Task 0–1 (§1.2, §2.2); P0-B → Tasks 2–7 (§3, §3.5, §3.7); plugin manifest §7.1 → Task 8; P2-B eval §8.4 → Task 9; §7.4 release manifest → Task 10; P0-C groundwork → Task 11; P0-D groundwork → Task 12; P0-E scaffold + §7.2/§5.2 → Task 13; §8.5 CI → Task 14. Native qualification, real model export, Ghost fork work are explicitly out of scope — they require environments absent here and are marked spike-pending throughout (PRD §6.2: native binaries accepted only on qualified OS/arch).
- **Type consistency:** exit codes and `CliOutcome` names are defined once in Task 0 and reused by every later command; `$id` URLs under `https://aifetchly.dev/schemas/<family>/<name>-v1.json` used consistently in registry, fixtures manifest, and archive.
- **Placeholders:** every task lists exact files, test cases, and commands. Python upstream pins are deliberately *absent by design* (fail-closed `unpinned` state), not TODO stubs — that is the PRD-mandated Phase 0 behavior.
