# PRD implementation audit and TODO

> **2026-10-04 fix update:** all portable defects **B01–B22 are fixed** with
> regression tests (see git history from this audit forward). The M01–M09
> milestone items below remain open where they require Windows hardware,
> approved model weights + provider GPUs, a Mac, or pinned host/Hub consumer
> builds; their entries stay accurate as written. The P0 false-qualification
> gates named in the suggested execution order (B01–B04, B10) are closed.

Audit date: 2026-10-03. Reviewed commit: `8a1db860fd360ec6124639120a6c8cb9c75fb643`.
Sources: [plugin PRD v1.5](computer-use-plugin-prd.md) and [technical design v1.5](computer-use-plugin-technical-design.md).

## Conclusion and scope

**No: not all requirements are implemented.** This is a tested foundation, not a qualified desktop-control/model release. Windows stdio registration, actual model inference/export, the selected Mac helper, complete release verification, and consumer qualification remain incomplete. Several portable implementation defects remain too; missing hardware is not the only blocker.

This audit inspected repository code, schemas, fixtures, workflows, packaging and work-package documents, ran available checks, and used temporary mutation probes. It did not modify runtime code, send desktop input, download model weights, or qualify native hardware. Host supervision/UI/runtime installation and Hub services remain external responsibilities; their missing integration evidence is recorded separately from plugin-owned implementation.

This is the current actionable audit at the commit above. Older `doc/TODO.md` and `doc/2026-10-01-prd-conformance-audit.md` contain historical findings and completion claims that should not be treated as current status. Findings below were checked against current source rather than copied wholesale.

Priority: **P0** = false qualification or authority-contract blocker; **P1** = required correctness/functionality before release; **P2** = workflow/reporting/maintenance defect. These are repair priorities, not rollout phase numbers. `Reproduced` means a local probe demonstrated the behavior; `source-confirmed` means the relevant code path was inspected without claiming native execution.

## Checks performed

| Check | Result |
| --- | --- |
| `npm run check` | Passed: build, ESLint, TypeScript, 138 tests in 16 files; 12 schemas, 31 valid and 23 invalid fixtures |
| `uv run --locked --project adapters/windows python -m pytest adapters/windows/tests -q` | 71 passed, 2 native tests skipped on Linux |
| `uv run --locked --project grounding python -m pytest grounding/tests -q` | 56 passed |
| `uv run --locked --project adapters/windows ruff check adapters/windows` | Passed |
| `uv run --locked --project grounding ruff check grounding` | **Failed: I001 and F811**; see B20 |
| Targeted schema, release, archive, parity, geometry, subprocess and pipeline probes | Confirmed defects listed below despite passing unit suites |
| Real Windows/Excel, macOS signed-host, GPU/provider and host/Hub acceptance | Not run; no qualification inferred |

## Requirement-by-requirement status

“Partial” means useful implementation exists but at least one acceptance condition remains unmet. “Missing” means the central deliverable is absent. “Implemented locally” does not imply consumer qualification.

| Requirement | Status and current evidence | Remaining tasks |
| --- | --- | --- |
| CU-PLUGIN-01 | Partial: local schema registry, fixtures, generated declarations and archive builder exist | B01, B07, B09; M01: complete public/lifecycle contracts and immutable consumer-tested release |
| CU-PLUGIN-02 | Partial: reviewed nine tool names and handle-based action schema; public `input`/`result` still unconstrained | B01; M02: real backend registration/dispatch isolation |
| CU-PLUGIN-03 | Partial: capabilities/request/result schemas, geometry rules, point-only and second-adapter fixtures | M01: load/cancel/unload schemas, complete lifecycle/identity and consumer conformance |
| CU-PLUGIN-04 | Partial: release schema and superficial artifact checks exist | B03–B05: enforce compatibility, source/lock/artifact bindings and evidence |
| CU-PLUGIN-05 | Missing operational backend: allowlist and entrypoint scaffold exist, upstream remains unpinned | M02, B13, B14: real persistent stdio backend, dependency closure and telemetry checks |
| CU-PLUGIN-06 | Partial: real ctypes code plus pure normalization/W-1 extractors exist | B11, B12; M02: wire live facts into typed observations and native fixtures |
| CU-PLUGIN-07 | Partial contract simulation only: test-local fake models cancellation/uncertainty | M03: native bounded action implementation and independently observed cleanup/last dispatch |
| CU-PLUGIN-08 | Missing: Mac comparison/selection report absent | M06 |
| CU-MAC-01 | Missing pending selection: no Swift source/package, native binary or signing pipeline | M06, B05, B06 |
| CU-MAC-03 | Missing conditional implementation: deny-list data exists, no selected helper enforces it | M06: explicit/implicit sidecar and recipe/learning isolation |
| CU-INST-11 | Partial: blocked 3B entry and both base/fine-tune licence presence checks | B04: canonical validation, approved licence evidence and complete notice closure |
| CU-PLUGIN-09 | Partial arithmetic/decode/manifest helpers; no actual reproducible export | B02, B08, B10, B15; M04 |
| CU-PLUGIN-10 | Missing production file set: candidate schema/configs only | M04: actual graphs/shards, health fixture, notices, immutable URLs and consumer-compatible files |
| CU-PLUGIN-11 | Partial: 10 synthetic workbooks, eight smoke evaluation cases and geometry fixtures | B17; M05: missing matrix cells, captures, handoff/native state and full workbook oracle |
| CU-PLUGIN-12 | Partial: offline recorded scoring and synthetic comparison, no desktop imports | B09, B16–B18; M04/M05: genuine local inference/replay, complete identities and measurements |
| CU-PLUGIN-13 | Partial: target-specific metadata copying, not a launchable delivered backend | B05–B07; M02/M06: real artifacts and extraction verification |
| CU-PLUGIN-14 | Partial scaffolding: release verifier and work-package handoff fields | B03–B05; M07/M08: complete candidate, upgrade notes and pinned consumers |
| CU-PLUGIN-15 | Partial: Node patch/npm lock and separate Python locks exist | M09: exact Python patch/uv/build stack and selected Swift/Xcode/dependency pins |
| CU-PLUGIN-16 | Implemented locally: Node-only check/build passes without desktop or weights | Retain this guarantee; archive reproducibility still needs B07 |
| CU-PLUGIN-17 | Partial: fake lifecycle examples; no real MCP lifecycle harness | M03, B13, B14, B19 |
| CU-PLUGIN-18 | Partial: canonical schemas/generated declarations and Python fixture validation | B08/B09/B20; M01: validate actual encoder outputs, publish semantics, Swift/previous-consumer tests |
| CU-PLUGIN-19 | Partial: case counts/status/splits and skipped-case rejection in evaluator | B03, B09, B16–B18: complete validated reports and fixture identity |
| CU-PLUGIN-20 | Partial: portable/native separation and explicit unqualified stubs | B20/B21; M07: working hardware/consumer jobs and mandatory release evidence |
| CU-PLUGIN-21 | Partial: selected file hashes/roles checked, full closure not checked | B03–B07; M08 |
| CU-PLUGIN-22 | Partial: `doc/work-packages.md` lists ownership/dependencies/commands/criteria | M08/M09: concrete executable commands, honest status and immutable handoff evidence |

## Confirmed errors to fix

### B01 — P0: public tool payloads do not enforce the authority boundary

- [ ] Define per-tool input/result schemas and bind each reviewed name to its shape.
- **Evidence (reproduced):** `contracts/tools/public-tools-v1.schema.json`, `$defs.toolEntry`, accepts arbitrary objects for `input` and `result`. Replacing `computer_act.input` in the valid surface fixture with `{x:100,y:200,approved:true,grant:"model-supplied"}` still validates. The separate desktop action schema does not validate this field automatically.
- **Impact:** the published public contract does not reject model-supplied authority or raw action coordinates as CU-PLUGIN-02/design §3.1 requires. This is a contract defect; no live host exploit was tested.
- **Done when:** all nine tool payloads/results have required identities, bounded fields and strict authority shapes; raw coordinates, grant/approval fields, missing session/target data and wrong-tool payloads fail fixtures.

### B02 — P0: export pipeline marks unimplemented stages successful

- [ ] Replace success assignments with actual stage execution; until implemented, return an explicit unqualified/unimplemented result.
- **Evidence (reproduced):** `grounding/src/aifetchly_grounding/export/pipeline.py:79–95` resolves config/lock, imports torch, then sets reference smoke, export, sharding, parity, calibration, provider report and assembly to `ok`. No functions perform these stages. A probe mocking only prerequisite resolution/import produced all eight stages `ok`, status `candidate`, and only `pipeline-report.json` on disk.
- **Impact:** once prerequisites are satisfied, command exit 0 falsely implies an exported candidate and parity execution. Current unapproved lock prevents normal access but does not make this branch correct.
- **Done when:** each stage consumes verified inputs, emits/verifies real outputs and fails independently; no graphs/weights or deliberately divergent tensors can produce success.

### B03 — P0: release verifier accepts failed, empty or modified evidence

- [ ] Validate and hash evidence just like other artifacts, enforce suite results/counts and bind reports to the candidate/target/configuration.
- **Evidence (reproduced):** `tooling/release/verify.ts:107–113` skips evidence size/hash checks. Lines 179–196 only inspect `qualification.missingEvidence` and suite-name presence. In a temporary copy of the good release, replacing the report with `{qualification:{missingEvidence:[]},aggregate:{executed:0,failed:99,skipped:9}}` still yields no failures, despite its now-wrong recorded hash and size.
- **Impact:** failed/skipped/empty or unrelated results can satisfy publication gates. `requiredEvidence: []` and ignored `evidenceRequired` also allow callers to omit required qualification.
- **Done when:** required suites derive from claimed targets/roles; schema-invalid, empty, failed, skipped, synthetic-as-native, hash-mismatched and wrong-candidate reports all fail. Malformed JSON returns a structured gate failure.

### B04 — P0: release compatibility, model closure and licence validation are incomplete

- [ ] Validate source/lock/contract/model identities, compatibility tuples, graph/data/notice/health files and approved licence values against canonical schemas and actual bytes.
- **Evidence:** `tooling/release/verify.ts:80` never verifies `lockDigests`, `compatibleWith`, or the top-level contract digest against the contracts artifact. Changing `contractArchive.sha256` to 64 zeroes in the good fixture still verifies (reproduced). `checkModelLicence()` only reads licence strings and blocks one exact value; it never validates the model manifest schema or recursively verifies its files. Unknown licence strings therefore bypass the canonical enum restriction (source-confirmed).
- **Impact:** valid outer file hashes can accompany incompatible or incomplete artifacts and unreviewed licence identities. Presence of a base-model licence is already checked; that earlier bug is fixed.
- **Done when:** changed pins, unsupported host/adapter/runtime tuples, missing nested files, invalid model schemas, unapproved licence values and missing notices fail; complete approved fixtures pass.

### B05 — P1: launch paths, notices and native signatures are not verified

- [ ] Verify every referenced closure path before reading it, require files to exist, and verify extracted native code/signatures/notarization/permissions.
- **Evidence:** `tooling/release/verify.ts` ignores `launchProfile`; a temporary good manifest with `../../missing-launch.json` still passed. Notice paths are containment-checked but not existence-checked. `mac-native` needs only a nonempty `signingIdentity`; the passing fixture's helper is ASCII placeholder text. Containment uses lexical paths, not resolved symlinks; report/model reads continue even after escape failures are recorded.
- **Impact:** a release can verify without a usable launch profile or a real signed executable; references can escape through symlinks.
- **Done when:** missing/escaping/symlink-escaping references fail before reads; fake native files, wrong architecture, lost execute bits, invalid signatures and absent notarization evidence fail on suitable verification runners. Non-native runners must report unqualified.

### B06 — P1: package builder returns success without a runnable backend

- [ ] Assemble the selected Windows delivery format and actual Mac executable, then validate the extracted launch closure.
- **Evidence (source-confirmed):** `tooling/commands/package.ts:20–40,84–159` copies common docs plus Windows launch/allowlist/locks or Mac lock/allowlist only. It includes no Windows integration wheel/source/pyproject or native Mac helper. A nonempty selected revision and `status: pinned` are sufficient to return `ok`. `signed` is set to true for Windows without signature verification.
- **Impact:** pinning metadata alone produces an apparent target package that cannot provide the specified runtime. This is metadata staging, not CU-PLUGIN-13 completion.
- **Done when:** clean extraction launches the pinned backend through the declared profile, no tooling/model-engineering dependencies leak into it, and signing status derives from evidence. Keep unbuilt targets unqualified.

### B07 — P1: rebuilding reuses stale files outside the recorded closure

- [ ] Build into a fresh staging directory and atomically finalize exactly the listed files; normalize archive metadata for reproducibility.
- **Evidence (reproduced):** `tooling/contracts/archive.ts:34` reuses `contracts-v1` and zips every file found there. After a first build, adding `stale-unlisted.txt` and rebuilding preserves it in the ZIP while the closure digest remains unchanged. `tooling/commands/package.ts:84` likewise reuses a target/revision directory without removing old files (source-confirmed).
- **Impact:** removed/unlisted content can remain in delivered artifacts. ZIP metadata is inherited through `addLocalFile`, so the stable logical digest alone does not prove reproducible ZIP bytes.
- **Done when:** output-directory contamination and deleted source files cannot survive rebuilding; ZIP membership exactly matches closure; identical sources produce identical archive bytes across repeated builds and supported platforms.

### B08 — P1: Python model manifest builder fails its own canonical schema

- [ ] Accept and validate real preprocessing, graph, provider and health-fixture metadata and remove invented exporter/processing identities.
- **Evidence (reproduced):** `grounding/src/aifetchly_grounding/export/manifest.py:61` output, using `grounding/tests/test_manifest.py::inputs()`, fails `model-manifest-v1` for missing `preprocessing`, `graphs`, `executionProviders`, `healthFixture`. Exporter is hardcoded `pinned-by-spike`; identity revisions are hardcoded.
- **Done when:** actual builder outputs pass canonical validation, missing metadata fails before writing, and an integration test validates the builder output rather than only handwritten fixture manifests.

### B09 — P1: evaluation inputs bypass schemas and checked-in data is invalid

- [ ] Validate dataset, trace, annotation, profile and grounding records at load time, with unique IDs, safe relative paths and content-hash verification.
- **Evidence (reproduced):** the checked-in trace manifest fails its schema on step `caseId`; `eval/datasets/w1-smoke/dataset.json` fails its own schema because content hashes are 128 hex characters rather than 64. `eval/cli.ts:41` checks only `schemaVersion`; `eval/runner/runners.ts:149` casts parsed JSON and follows `step.grounding` paths without containment checks. The dataset schema and Windows lock schema are outside the contract registry/check coverage.
- **Impact:** malformed/unversioned data reaches scoring, missing fields become runtime errors, duplicate IDs can overwrite records, and grounding paths can read outside the bundle. The main green conformance check misses these files.
- **Done when:** fix the fixture/schema disagreement through deliberate version policy; check actual datasets/locks/bundles; reject duplicates, traversal/symlink escapes, bad hashes and missing required fields with typed diagnostics.

### B10 — P0: parity accepts NaN and empty tensor stages

- [ ] Require nonempty finite tensor values and finite, nonnegative tolerances; define and test the intended elementwise tolerance rule.
- **Evidence (reproduced):** `grounding/src/aifetchly_grounding/parity/compare.py:31` returns `passed=True` for both `reference=[]/actual=[]` and `reference=[1.0]/actual=[NaN]`, with tolerances 0.01. `max(0.0, NaN)` leaves the tracked error at zero. `first_failing_stage([])` also reports no failing stage.
- **Impact:** invalid or missing model output can be recorded as passing parity.
- **Done when:** empty stages/suites, NaN/Infinity and invalid tolerance profiles fail explicitly; the required stage list and sample counts are enforced.

### B11 — P1: AX normalization accepts nonfinite geometry and loses structure

- [ ] Check numeric types/finite values and preserve the hierarchy/grid metadata needed by consumers.
- **Evidence (reproduced):** `adapters/windows/src/aifetchly_windows/normalize.py:39` accepts `[NaN,0,Infinity,1]` and returns it as a frame; conversion to float does not test finiteness. `AxElement.children` is never populated, and row/column/selected/focused fields consumed by `w1.py` are absent from normalized elements (source-confirmed).
- **Impact:** invalid geometry survives normalization; the claimed normalized-tree-to-W-1 path is not currently composable.
- **Done when:** malformed/nonfinite geometry fails with typed errors; real encoder output preserves necessary relationships and grid fields and feeds W-1 extraction in an integration test.

### B12 — P1: W-1 extraction is not bounded and guesses header/used range

- [ ] Enforce depth/element limits during traversal, propagate truncation, and distinguish observed visible cells from actual header/used-range facts.
- **Evidence (reproduced):** `adapters/windows/src/aifetchly_windows/w1.py:52` walks the entire tree before checking count. A root with 64,001 children returns `elementCount=64002`; it marks truncation but processes them all. There is no depth limit. Lines near the final return use the minimum observed row as header and extrema as used range; a scrolled view can therefore label an ordinary data row as the header (source-confirmed).
- **Impact:** large trees are unbounded work; partial observations can be misrepresented to host column mapping. Malformed non-dict children are silently discarded.
- **Done when:** traversal stops at explicit limits; missing/ambiguous header and used-range evidence is represented explicitly; scrolled, sparse, malformed, deep and oversized tree cases pass.

### B13 — P1: pinned Windows native-test branch cannot construct its command

- [ ] Make subprocess project-path validation support explicitly permitted repository-relative project paths and compare targets without platform-dependent separators.
- **Evidence (reproduced):** `backendTest()` passes project `adapters/windows`, but `tooling/processes/run.ts:44–56` uses `^[a-z0-9_-]+$`. `buildArgv({kind:'uv-python',project:'adapters/windows',module:'aifetchly_windows.entrypoint'})` throws `invalid project 'adapters/windows'`. Additionally, `backends.ts` compares a `join()` result to the literal `adapters/windows`, which differs on Windows (source-confirmed).
- **Done when:** the pinned Windows branch reaches its intended harness on Windows, valid nested paths work, and absolute/traversal paths remain rejected.

### B14 — P1: installed Windows entrypoint depends on source-checkout layout

- [ ] Package lock/allowlist resources explicitly, resolve them through a supported installed location, and classify absent resources as prerequisite failures.
- **Evidence (source-confirmed):** `entrypoint.py:18–28` finds resources using three parent directories from `__file__`; `pyproject.toml` packages only `src/aifetchly_windows`. Lock and allowlist are outside that package. `main()` does not catch filesystem errors.
- **Impact:** an installed wheel looks for absent resources under the environment rather than the checkout and can emit a traceback instead of a typed failure.
- **Done when:** build/install into a fresh temporary environment without the checkout; startup loads packaged resources or exits cleanly with missing-prerequisite diagnostics and protocol-only stdout.

### B15 — P1: model parity ignores its dataset argument

- [ ] Route parity to an actual comparison entrypoint with configuration, dataset and frozen tolerances passed explicitly.
- **Evidence (source-confirmed):** `tooling/commands/model.ts:54` requires `dataset` but discards it, invoking the same export pipeline as `modelExport`. `pipeline.py` accepts no `--dataset` option.
- **Impact:** different requested datasets execute the same command and cannot provide the specified evidence identity.
- **Done when:** missing/unknown datasets fail, selected datasets change actual evaluated cases, and reports record exact dataset/config/provider/tolerance identities and counts.

### B16 — P1: compare substitutes synthetic results for any selected runner

- [ ] Dispatch according to explicit runner kind and reject unsupported modes instead of silently substituting.
- **Evidence (source-confirmed):** `eval/cli.ts` compare handler always calls `syntheticRunner(profile)`, including a `kind: recorded` profile, while reporting `runnerKind: profile.kind`. Replay only re-scores recorded candidate JSON; it does not re-run reference/ONNX inference.
- **Impact:** comparison output can be mislabeled, and current tooling does not satisfy real locate-only model evaluation.
- **Done when:** synthetic runs remain clearly separate and cannot qualify models; reference/ONNX comparison uses identical verified images/tasks and actual measured inference, and unsupported profile/mode pairs fail.

### B17 — P1: evaluation/report identity and complete case accounting are missing

- [ ] Implement design §8.4 report schema and validate all identities, expected cases, hashes and measurements.
- **Evidence:** `RunnerConfiguration` has six string identities but omits model runtime/version/manifest digest, contract/runtime/provider identity. `annotationsSource()` forces synthetic/regression and version `annotations-v1`; it scores whatever annotations remain. `evaluateCases()` accepts missing hashes as `unversioned`. `identicalEvidence` compares these strings rather than file content. Reports omit run/source/time identities, fixture manifest digest, transforms, stage timings, hardware/memory method and candidate binding.
- **Impact:** removing an annotation can shrink a replay silently, missing hashes can appear identical, and materially different runtimes can appear compatible.
- **Done when:** the required case set and dataset provenance are immutable and verified; missing/extra/duplicate cases are explicit; complete identity mismatches fail; all required report fields are populated or explicitly unavailable without implying qualification.

### B18 — P2: HTML reports interpolate unescaped external text

- [ ] Escape every string inserted into HTML, not just reasons/missing-evidence text.
- **Evidence (source-confirmed):** `eval/report.ts:193` directly interpolates case IDs, splits, dataset ID/version, runner labels and configuration/revision strings.
- **Impact:** a crafted local dataset/bundle can inject markup or script into a report opened in a browser.
- **Done when:** malicious tags/quotes in every externally sourced display field render as text; add focused renderer coverage.

### B19 — P1: subprocess cancellation does not reliably bound child work

- [ ] Handle already-aborted signals before spawning and terminate/reap owned descendant processes with platform-appropriate behavior.
- **Evidence (reproduced):** passing a previously aborted `AbortController.signal` to `runProcess()` executes the child and returns `ok`. `tooling/processes/run.ts` subscribes only to future abort events. Its `killTree()` only calls `child.kill`, so the name does not describe descendant cleanup (source-confirmed). Inherited stdout/stderr from surviving descendants can delay `close` beyond the timeout.
- **Done when:** a pre-aborted signal launches nothing, timeout/cancel reaps descendants and completes within a bounded grace period on Windows/macOS/Linux. Also fix byte capping: `slice(0,maxBytes)` slices characters, not UTF-8 bytes.

### B20 — P2: grounding lint fails and a test function is overwritten

- [ ] Fix import formatting and consolidate the duplicated conformance test while retaining semantic/format checks.
- **Evidence (reproduced):** Ruff reports `I001` at `grounding/src/aifetchly_grounding/export/pipeline.py:12` and `F811` at `grounding/tests/test_contracts_conformance.py:110`; the same test name was already defined at line 63. Python overwrites the earlier definition, so pytest passing does not mean both definitions ran.
- **Done when:** the exact grounding Ruff command above and pytest both pass, with no duplicate test names and explicit schema-plus-semantic fixture coverage.

### B21 — P2: native qualification preflight parses JSON locks as JavaScript

- [ ] Read `.lock` files with `readFileSync` and `JSON.parse`; use the appropriate shell syntax in each workflow.
- **Evidence (reproduced):** Windows and Mac native qualification workflows call `require('./.../upstream.lock')`. Node treats the unfamiliar extension as JavaScript and raises `SyntaxError: Unexpected token ':'` at the JSON `$schema`/property line.
- **Impact:** the intended typed unqualified diagnostic is replaced by a parser failure before future native qualification can start.
- **Done when:** unpinned/pinned/malformed lock cases yield deliberate preflight results on each target runner; qualification still cannot pass without the real suites in M07.

### B22 — P1: remaining schema semantics allow invalid readiness and package paths

- [ ] Constrain host readiness to its supported enum and add safe-path/uniqueness/aggregate-size validation for model packages.
- **Evidence (source-confirmed):** `contracts/desktop/error-v1.schema.json` uses an arbitrary string for `readiness`; its valid fixture uses `downloading`, absent from the host design enum. Model `files[].path` allows internal `../` segments, notice/health paths are unrestricted strings, and fixed `limits` declarations do not enforce actual total count/bytes or duplicate paths. The error-message path regex misses `path=/etc/hosts`; it is not a general safe-message sanitizer.
- **Done when:** unsupported readiness, traversal, duplicate paths, excess aggregate bytes/counts and unsafe emitted diagnostics fail fixtures/encoder checks. Use controlled error construction for secrets/tracebacks rather than assuming a schema regex can sanitize arbitrary exception text.

## Incomplete deliverables and acceptance tasks

### M01 — Complete the shared contract release (CU-PLUGIN-01/03/18)

- [ ] Add versioned load/cancel/unload request/result schemas and lifecycle fixtures, complete public contracts, and a distinct agreed private native-input contract where needed. Current `desktop/action-v1` is handle-based public action data, not the native dispatch envelope.
- [ ] Publish full configuration/runtime/provider identity and failure/cancellation correlation requirements; include clock identity/monotonic dispatch metadata in agreed backend serialization.
- [ ] Make semantic constraints discoverable as data/specification in the schema/fixture artifact; `rules.ts` currently applies extra checks only inside producer tooling, while consumers receive schemas/data. Do not ship a dynamically loaded host adapter to solve this.
- [ ] Validate actual Python encoders/builders and selected Swift encoders against the same fixtures; test previous supported host decoders and bump contract versions for breaking changes.
- **Evidence:** only capabilities/request/result exist under `contracts/grounding`; lifecycle classes live inside test files. Existing fake tests are useful examples, not published lifecycle serialization or consumer tests.
- **Exit:** an immutable archive with verified digest, complete valid/invalid coverage and passing pinned host conformance.

### M02 — Deliver the real Windows backend (CU-PLUGIN-05/06; design §4)

- [ ] Choose immutable Windows-MCP revision, patch/extension strategy and exact interpreter; record full upstream/source/dependency/notices closure and verify it during preparation.
- [ ] Implement persistent stdio registration and real discovery/dispatch enforcement. Hidden shell/registry/filesystem/process/clipboard tools must fail even when invoked by name; verify telemetry remains disabled.
- [ ] Connect existing ctypes integrity/window-at-point functions and normalized UIA/capture/display/foreground facts to typed backend responses. Add live W-1 grid/value/ribbon/edit/IME/protected/read-only state observations.
- [ ] Decide Hub-managed uv versus qualified prebuilt interpreter packaging with the consumer; implement its complete launch closure and clean-machine tests.
- **Evidence:** upstream lock remains unpinned, runtime dependencies are empty, and `entrypoint.main()` still returns 3 even with a complete pin. `backendPrepare()` only checks status/revision then runs `uv sync`, without verifying selected upstream source/patch digest.
- **Exit:** selected Windows/Excel matrix passes backend qualification plus host accessibility W-1 integration. Existing ctypes implementations should be retained and qualified, not listed as absent.

### M03 — Test real lifecycle, bounded actions and stop behavior (CU-PLUGIN-07/17)

- [ ] Implement/reuse a transport harness exercising the actual pinned MCP process: initialization, capability mismatch, permission denial, request bounds, malformed stdout, exit/disconnect, readiness and shutdown.
- [ ] Exercise long typing, drag, held keys/buttons, timeout, cancellation and process termination on controlled windows; independently observe last native dispatch with correlated monotonic clocks.
- [ ] Prove no retry of uncertain actions, no queued input after stop, no target reselection, and typed stale/closed/own/elevated target outcomes.
- **Evidence:** `test/tooling/backend-lifecycle.test.ts` implements and tests a synchronous fake class in the same file. Its fake clock/cleanup prove no actual backend timing, transport or OS behavior. Native command currently reports its harness pending.
- **Exit:** immutable native reports identify backend revision, exact case counts, OS, controlled target and host stop acceptance; skipped hardware suites remain unqualified.

### M04 — Implement and qualify model engineering (CU-PLUGIN-09/10/12)

- [ ] Pin approved 2B weights, hashes, base/fine-tune notices, exact export toolchain and supported Python; keep 3B blocked without reviewed commercial clearance.
- [ ] Implement explicit preparation/cache/download orchestration. `modelPrepare()` currently returns prerequisites missing even when lock status is approved.
- [ ] Implement preprocessing/tokenization, vision, prefill, pointer/attention reference inference, graph export, quantization, actual ONNX external-data writing and graph reference updates. The current shard module plans names/sizes only.
- [ ] Implement all design §6.3 parity stages, frozen calibration/held-out data, absence/ambiguity evaluation, provider/operator checks, memory/cold-start/cancellation measurements and output assembly.
- [ ] Produce canonical model manifests with graph interfaces, processing revisions, health fixture, LICENSES, real per-file hashes/sizes and immutable host-catalog URLs. Bind parity report digest and qualified hardware/provider identities.
- **Exit:** real model file set independently consumed by the host's built-in adapter/catalog, with all claimed providers measured. Candidate export alone never implies qualification.

### M05 — Complete W-1 and visual fixture/evaluation coverage (CU-PLUGIN-11/19; PRD §4.1)

- [ ] Fill the workbook manifest's **eight explicitly missing matrix cells**, including Chinese 20/500-row layouts and scaled preservation cases.
- [ ] Add labeled saved images for ribbon/filter/gallery/distractors/absence/ambiguity, themes/scales/crops and CJK; current trace fixtures contain grounding JSON, not real capture evidence for inference.
- [ ] Add moved/closed/foreground/own/elevated/unknown-integrity native states and protected/read-only/IME/sign-in/coauthoring handoff fixtures. These are explicitly deferred in the workbook manifest.
- [ ] Implement an independent benchmark oracle comparing **every expected output cell** after host runs. `sampleExpected` contains only three sample rows; current workbook tests check committed file hashes/counts and selected cells, not all cells of a produced result workbook.
- [ ] Record exact missing matrix cells, stable case/content identities and consent review/sanitization workflow; preserve held-out/calibration separation by dataset version.
- **Exit:** a mismatch outside the host's live sample fails the benchmark; both specified Excel versions/locales and supported workbook origins are measured, with unsupported cells explicit.

### M06 — Select and deliver the Mac helper (CU-PLUGIN-08, CU-MAC-01/03)

- [ ] Conduct the time-boxed Ghost versus in-house Swift comparison covering AX/CJK/geometry/TCC/signing/cancellation/size/maintenance; record duration and safety vetoes before Phase 3.
- [ ] Pin selected source/patches, Swift/Xcode/deployment target and `Package.resolved`; implement helper source and real Swift/unit/native tests.
- [ ] If Ghost wins, enforce allowlist in registration and dispatch, disable explicit and implicit visual sidecar calls plus recipes/learning, and test with an upstream sidecar installed.
- [ ] Build/sign/notarize/package native helper with stable identity, notices and Hub metadata; verify extracted permissions/signature and signed-host TCC attribution/denial/update behavior.
- **Evidence:** `adapters/macos` contains README/lock/allowlist only; `mac-unit.yml` explicitly says Swift build/test still must be added. No comparison report or Swift package exists.
- **Exit:** selected helper passes Apple Silicon native and integrated host gates. Conditional Ghost requirements must not be claimed implemented by deny-list JSON alone.

### M07 — Replace qualification stubs with actual jobs (CU-PLUGIN-20)

- [ ] Wire controlled interactive Windows/Excel, signed-host Mac, matching model-provider hardware, and pinned host/Hub consumer jobs. The four newly added workflows always exit failure after preflight; they are honest placeholders, not implemented qualification.
- [ ] Extend unit/package jobs to verify real launch/profile/package closure; run actual Swift build/tests after selection.
- [ ] Upload schema-validated evidence bound to candidate/source/lock/configuration/fixture identities; enforce required jobs at release time even if a workflow was not dispatched.
- **Exit:** each affected target has actual passing nonempty producer and consumer evidence, or remains explicitly unqualified. A CPU run does not qualify DML/CoreML.

### M08 — Complete release operations and concrete handoff (CU-PLUGIN-14/21/22)

- [ ] Generate full immutable compatibility manifests and per-target qualification states, upgrade/schema/signing/host-adapter notes, unresolved limitations and measured support matrix.
- [ ] Test upgrade, failed-candidate recovery, repair/reinstall, artifact reuse and clean-machine installation jointly with host/Hub; never overwrite bytes under a published identity.
- [ ] Handoff exact artifact version/digest and pinned consumer build/results for contracts, backend launch/install plans and model catalog/adapter interfaces.
- [ ] Update documentation status: P0-B cannot be fully complete while its stated host-consumer exit remains pending; model pipeline/package scaffolds and test-local lifecycle examples must be labeled accurately.
- **Exit:** release verifier independently reconstructs the full closure and enforces all required evidence; consumer build/version/digest is concrete rather than a template.

### M09 — Finish toolchain reproducibility and work-package commands (CU-PLUGIN-15/22)

- [ ] Pin Python to qualified exact patch versions (both `.python-version` files currently say `3.14`), record exact uv/build backend/export toolchain, and add selected Swift/Xcode/SPM locks after the spike. Separate Python environments already exist.
- [ ] Make work-package commands directly executable: include `npm run`, required `--target`, `--config`, `--dataset`, output paths and prerequisite instructions rather than abbreviated fragments.
- [ ] Align old TODO/audit banners and README completion claims with this commit's actual evidence. Preserve historical findings as history and link to the current audit instead of retaining contradictory “done” summaries.
- **Exit:** a maintainer can reproduce each artifact and its evidence from the documented pins/commands and identify its immutable consumer handoff.

## Suggested execution order

1. Close false-positive gates B01–B04/B10 and stop reporting unimplemented export stages as successful.
2. Fix portable validation, archive, geometry, command, subprocess and lint defects B07–B22; most do not require hardware.
3. Complete contract release M01 and run Windows/model/Mac spike work M02/M04/M06 independently.
4. Deliver actual target artifacts and native lifecycle/evaluation work M03/M05; fix B05/B06 against those concrete outputs.
5. Wire consumer/native qualification M07 and finish complete release/upgrade/handoff evidence M08/M09.

Phase 5 items—larger models/verifier, multi-display control, offline bundles, Windows ARM and Intel Mac—remain deliberately deferred under PRD §5/§7. They require separate future qualification, not inclusion in the initial Windows release. No host planner/supervisor/UI/runtime installer should be added to this repository to close this TODO.
