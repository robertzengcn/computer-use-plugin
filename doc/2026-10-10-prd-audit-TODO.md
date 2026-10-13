# PRD implementation and bug audit — 2026-10-10

**Verdict: not all requirements are implemented.** The portable foundation is substantial and its existing tests pass, but the repository does not yet supply an operational upstream Windows backend, real reference/ONNX inference and export, a selected macOS helper, or a qualified host/Hub release. There are also **13 current defect groups** below. Remaining work is not solely waiting for hardware.

This audit supersedes the completion assessment in the October 6 audit for the reviewed revision. It does not reopen every historical issue: contract archive closure, source enumeration in `package:build`, prompt construction, transforms, and other improvements are present. However, several earlier claims about complete release verification remain stronger than the code supports.

## Scope and evidence

- Repository: `computer-use-plugin`, commit `1089984962cfa31c5133eaca30503e2d4ad585c7`; working tree was clean at audit start.
- Authoritative input: [user-specified PRD v1.5](../../aiFetchly/docs/prd/computer-use-plugin-prd.md), SHA-256 `2754efc7150bfcffd82fb30e3878f8a0c99ce8317bf3896cbc484f7ee9ebaa29`.
- Authoritative input: [user-specified technical design v1.5](../../aiFetchly/docs/prd/computer-use-plugin-technical-design.md), SHA-256 `e1dde6fa9edd66eba77328823543a095987c66e72c03a2450e83f6be3ec26efc`.
- Reviewed contracts, command dispatch, packaging/assembly/verifier, Windows extensions/server, grounding helpers/pipeline, evaluation, fixture coverage, CI and work-package documentation.
- Ran portable checks and targeted mutation/subprocess probes. Mutations used temporary directories; no production source was changed, no desktop input was sent, and no model weights were downloaded.
- Windows/Excel interaction, macOS signing/TCC, actual weights/providers/GPUs, clean-machine installation, and external host/Hub builds were **not run**. Native findings explicitly distinguish source analysis from native execution.
- Passing synthetic fixtures do not demonstrate production accuracy, stoppability, permission attribution, commercial licence provenance, or consumer compatibility. This is an implementation/correctness audit, not an exhaustive security certification.

| Check | Result |
| --- | --- |
| Local tools | Node 22.19.0, npm 10.9.3, uv 0.7.16 |
| `npm run check` | PASS: build, ESLint, TypeScript, **164 tests / 18 files**, declaration/conformance checks |
| Contract conformance | **15 schemas, 41 valid fixtures, 33 invalid fixtures** |
| `cd adapters/windows && uv run --locked pytest -q` | **93 passed, 2 skipped**; skips are not native qualification |
| `cd grounding && uv run --locked pytest -q` | **76 passed** |
| `uv run --locked ruff check src tests` in each Python project | PASS in both projects |
| Targeted release mutation probes | Confirmed false passes described in B05–B08 |
| Persistent MCP subprocess probe | Confirmed buffered response, B01 |
| Assembly and model-cache probes | Confirmed B08/B10 and B13 |

Priority: **P0** blocks trustworthy release verification; **P1** blocks required functionality/correctness; **P2** affects reliability or maintainability. Priorities are not rollout phase numbers. All checkboxes below are open. “Reproduced” means executed here; “source-confirmed” does not imply testing on the native OS.

## Requirement coverage — all 25 requirement IDs

“Partial” means useful implementation exists but the full acceptance criteria are unmet. “Portable met” is not product qualification. Tasks T01–T10 describe the missing deliverables; B01–B13 describe defects in existing code.

| Requirement | Assessment at reviewed commit | Remaining work |
| --- | --- | --- |
| CU-PLUGIN-01: versioned schemas/fixtures | Partial: canonical registry, declarations, fixtures and complete archive builder exist; no accepted immutable consumer release demonstrated | T01, T09 |
| CU-PLUGIN-02: host authority boundary | Portable schemas and deny-by-name registration implemented; production upstream/native isolation unproven | B02, T02, T03, T07 |
| CU-PLUGIN-03: interchangeable grounding contract | Portable lifecycle/result/capability and second test-adapter fixtures exist; real consumers/models not qualified | T01, T04, T05 |
| CU-PLUGIN-04: compatible release identities | Partial; verifier accepts unsupported identity strings and unrelated evidence | B06–B08, T09 |
| CU-PLUGIN-05: pinned Windows-MCP | Incomplete: upstream lock is `unpinned`, dependencies empty, reviewed upstream tools explicitly not wired | B01–B02, T02 |
| CU-PLUGIN-06: native facts/geometry/CJK | Partial ctypes and normalization helpers; incorrect ownership flag and insufficient native input validation; no native matrix | B03–B04, T02, T03, T06 |
| CU-PLUGIN-07: bounded/stoppable input | Contract simulations exist; production atomic input, cancellation and held-input cleanup absent | T03 |
| CU-PLUGIN-08: Mac comparison | Missing measured decision report; README says spike pending | T07 |
| CU-MAC-01: managed native Mac helper | Missing selected source/build, signed/notarized artifact and Hub acceptance | B09, T07, T09 |
| CU-MAC-03: host-only visual lookup | Conditional Ghost requirement remains unimplemented; allowlist data cannot remove implicit sidecar/recipe calls | T07 |
| CU-INST-11: commercial model licence chain | Partial blocking policy and manifest fields exist; actual source/notice provenance unqualified and notice bytes not fully bound | B08, T04, T09 |
| CU-PLUGIN-09: reproducible ONNX export | Incomplete: pipeline implements only lock resolution; reference runner only checks a torch import | B13, T04 |
| CU-PLUGIN-10: separate model file sets | Schema/helper foundation only; no production graph/shard/tokenizer/health file set or immutable catalog handoff | T04, T09 |
| CU-PLUGIN-11: regression and held-out data | Partial: 17 synthetic workbooks (10 regression, 3 calibration, 4 held-out); eight vision smoke cases all regression; native/capture families missing | T06 |
| CU-PLUGIN-12: offline evaluation/replay | Recorded scoring and synthetic comparison exist and avoid desktop execution; actual reference/ONNX re-evaluation absent | T05 |
| CU-PLUGIN-13: platform delivery | Partial source/metadata staging; no complete managed Windows or signed Mac distribution; nested release closure not checked | B08–B12, T02, T07, T09 |
| CU-PLUGIN-14: consumer compatibility release | Missing complete release/upgrade and exact host/Hub evidence; verifier cannot enforce all gates | B05–B10, T08–T09 |
| CU-PLUGIN-15: isolated pinned toolchains | Node/npm, separate Python locks and hatchling pin exist; upstream/export/Swift toolchains unresolved | T02, T04, T07, T10 |
| CU-PLUGIN-16: lightweight default workflow | Portable workflow met in this checkout; fresh supported-OS installs not repeated here; output replacement reliability incomplete | B12, T10 |
| CU-PLUGIN-17: backend lifecycle | Fake lifecycle and limited stdio tests exist; live persistent transport and full cancellation/readiness not complete | B01–B02, T02–T03 |
| CU-PLUGIN-18: canonical cross-language contracts | TypeScript generation and Python fixture conformance exist; live MCP discovery lacks schemas; Swift and exact host decoder acceptance absent | B02, T01, T07 |
| CU-PLUGIN-19: structured results | Partial reports exist; complete provenance/measurements absent; release gate accepts empty/inconsistent evidence | B05–B06, T05 |
| CU-PLUGIN-20: portable versus native CI | Portable jobs exist; native/model/consumer jobs deliberately fail as placeholders; mandatory policy incomplete | B06, T08 |
| CU-PLUGIN-21: complete verifiable release closure | Partial direct-file checks; nested files, metadata, evidence binding, pins and native signatures still insufficient | B05–B12, T09 |
| CU-PLUGIN-22: reproducible work packages/handoff | Work-package document exists; completion labels are stale and exact artifact/consumer handoffs missing | T09–T10 |

## Confirmed defects in existing implementation

### B01 — P1: persistent MCP responses are buffered until EOF

- [x] Flush every protocol response independently of launcher environment; add a persistent request/response test that keeps stdin open.
- **Evidence — reproduced:** `adapters/windows/src/aifetchly_windows/server.py:202` uses `sys.stdout.write(payload + "\n")` without flushing. `adapters/windows/launch-profile.json` specifies neither `-u` nor `PYTHONUNBUFFERED`.
- **Reproduction:** launch the project Python with `-c "from aifetchly_windows.server import main; main(frozenset({'process_integrity'}))"`, connect pipes, send and flush one `initialize` line, and keep stdin open. With `PYTHONUNBUFFERED` absent, stdout was not readable after one second. Closing stdin caused the response to appear. The existing subprocess test uses `subprocess.run(input=...)`, which closes stdin and hides this defect.
- **Impact:** the host waits for initialization while the server waits for the next line; persistent sessions time out.
- **Acceptance:** initialize, list, and multiple subsequent calls return before stdin closure under the packaged launch profile, with diagnostics confined to stderr.
- **Requirements:** CU-PLUGIN-05/17; design §1.3, §3.8, §4.2.

### B02 — P1: MCP discovery and error/notification handling are incomplete

- [x] Publish real input schemas for each tool; implement protocol-compliant request/notification and tool-error handling; test with the pinned host SDK.
- **Evidence — reproduced:** `server.py:96` returns `{"tools":[{"name":"process_integrity"}]}` without `inputSchema`. A `notifications/cancelled` message returns a JSON-RPC error with `id: null` because exceptions return before the notification check. An off-Windows `process_integrity` failure returns text containing `ok:false` but no MCP `isError:true`.
- **Impact:** schema-validating clients cannot consume discovery; clients may misclassify execution failures; notifications produce unwanted responses. This is additional to the absent action-cancellation implementation in T03.
- **Acceptance:** tool schemas match actual accepted arguments, invalid arguments fail before native calls, notification errors never generate replies, and tool execution failures have the agreed MCP error shape. Add initialization/version, malformed-message and cancellation cases using a real persistent client.
- **Protocol reference:** the pinned [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) defines tool input schemas and distinguishes protocol errors from tool execution errors.
- **Requirements:** CU-PLUGIN-05/17/18; design §3.7–3.8, §4.2.

### B03 — P1: ownership extensions always report `isOwnProcess: false`

- [x] Define whose process “own” means and provide trusted owner context, or omit the unsupported flag and let the host compare the returned PID. Do not encode unknown ownership as false.
- **Evidence — source-confirmed, mocked reproduction:** `server.py:128` and `:145` call the helpers without `own_process_id`. `integrity.py:178` and `window_at_point.py:126` compare the target PID with the default `None`, so successful server calls always emit false. A fake PID 42 returns false through the server; passing owner PID 42 directly to the helper returns true.
- **Impact:** the extra field claims a negative ownership fact the backend never established. Native PID return remains useful, and a correctly implemented host PID comparison may compensate; this audit does not claim a demonstrated host bypass.
- **Acceptance:** own-host, own-helper, unrelated and unknown ownership have documented semantics and tests. Host input rejection must use trusted ownership facts.
- **Requirements:** CU-PLUGIN-06; design §4.2 integrity/ownership cases.

### B04 — P1: native point/PID arguments are not bounded before conversion

- [x] Reject booleans and values outside native integer ranges before calling Win32, consistently at both server and helper boundaries.
- **Evidence — reproduced with fake native API:** `window_at_point.py:105` accepts `DesktopPoint(True, 0)` and `DesktopPoint(2**40, 0)`; `server.py:142` also treats booleans as integers. The real `_Point` uses Win32 `LONG` fields. `processId` checks nonnegative integer type but no DWORD upper bound before `OpenProcess` conversion.
- **Impact:** malformed values can be narrowed to different coordinates/PIDs by the native ABI, yielding ownership facts for an unintended target. Native dispatch was not exercised here.
- **Acceptance:** reject `true`, floats, overflowing LONG coordinates and overflowing DWORD PIDs; retain valid negative desktop coordinates; verify no native API was invoked for rejected data.
- **Requirements:** CU-PLUGIN-06/18; design §3.7, §4.2.

### B05 — P0: malformed or skipped evidence can pass release verification

- [x] Validate required report fields and derive all counters from validated per-case outcomes; reject missing, skipped, duplicate or inconsistent required cases.
- **Evidence — reproduced:** in a copy of `test/fixtures/release/good`, replace `report-windows-native.json` with `{"schema":"anything","aggregate":{},"qualification":{"missingEvidence":[]}}`, update its artifact hash/size, and call `verifyRelease()`: **`failures: []`**. `verify.ts:636` returns without adding a failure when required counters are absent.
- **Second reproduction:** change the existing native case status to `skipped`, leave aggregate counts at one pass/zero skips, and rehash the report: **`failures: []`**. Per-case logic counts failed cases but does not reconcile skipped/pass counts.
- **Impact:** empty evidence and an unexecuted required case can satisfy a release gate despite the explicit PRD prohibition.
- **Acceptance:** canonical report schemas require identity, cases, counters and qualification fields; recomputed planned/executed/passed/failed/skipped totals match exactly; zero execution or required skip fails. Add mutation tests for every omitted counter and inconsistent status.
- **Requirements:** CU-PLUGIN-19/20/21; design §8.4–8.5.

### B06 — P0: required evidence is not bound to the artifact/consumer combination

- [x] Centralize target qualification policy, require producer and host/Hub suites, and bind every report to exact artifact digests, source, model configuration, provider/hardware and consumer builds.
- **Evidence — reproduced:** replacing the Windows native report's schema with `unrelated-schema`, runner with `synthetic`, source/configuration with unrelated values, and leaving `producerOnly:true` still yields **`failures: []`** after rehashing. Changing model `parityReport.sha256` to 64 ones and rehashing the model manifest also passes.
- **Source:** `verify.ts:504` derives only `parity`, `windows-native`, and `mac-native`; it does not independently require contract, host or Hub evidence. `verifyEvidenceBinding()` uses only the first model/parity artifact and checks count/runner conditions for `status: passed`, not complete identity equality or the declared parity digest. The release schema has no explicit per-target candidate/qualified state or required consumer-build identity.
- **Impact:** stale/unrelated reports can pass, missing consumer tests are not independently rejected, and additional model configurations/providers lack individual evidence binding. Current passing fixture status must not be interpreted as qualification.
- **Acceptance:** wrong source, provider, artifact, consumer, configuration or parity hash fails; each model/provider/target is checked; deleting required evidence declarations cannot remove gates. Candidate validation must report its limited state separately from qualified publication eligibility.
- **Requirements:** CU-PLUGIN-04/14/19/20/21; design §7.4–7.5, §8.5.

### B07 — P0: compatibility and required pins are presence checks

- [x] Validate supported compatibility tuples and require the exact lock set for each shipped role; cross-check recorded pins against delivered content.
- **Evidence — reproduced:** set the Windows artifact's compatibility to `{"hostAppRange":"not-a-semver-range","adapterId":"unsupported-adapter"}`: **`failures: []`**. Replace the entire release `lockDigests` object with the correctly hashed repository `package-lock.json`, omitting backend/model pins: **`failures: []`**.
- **Source:** `verify.ts:188` requires only a nonempty lock map; `:395–404` accepts any nonempty host/adapter/runtime string. Hashing an unrelated lock is not verification of the backend revision.
- **Impact:** unsupported consumers and incomplete pins can be presented as compatible; reproducibility and target identity are not established.
- **Acceptance:** parse version ranges, resolve them against approved consumer records, enforce required adapter/runtime/processing identities, and reject missing/substituted role-specific locks or mismatched package revisions. Include negative tests for each field, not only empty values.
- **Requirements:** CU-PLUGIN-04/15/21; design §1.1–1.2, §7.4.

### B08 — P0: release verification does not cover the full delivered closure

- [x] Recursively verify package manifests and hash every referenced launch profile, notice and model manifest actually consumed. Enumerate delivered files and reject unexpected/missing content.
- **Evidence — reproduced:** `assemble.ts:133` makes `package/package-manifest.json` the environment artifact, but `verifyRelease()` only hashes that JSON; it never verifies its `files`. After assembly, changing delivered `package/backend.py` to different bytes leaves the verifier's failures unchanged and adds no integrity failure. The synthetic assembly had other missing gates, which remained unchanged; this test does not claim that candidate was qualified.
- **Further independent baseline mutations, each yielding `failures: []`:** change `launch-profile.json` to `{"version":1,"argv":["wrong-executable"]}`; change `LICENSES/GUI-ACTOR` bytes; or point `modelManifestPath` at an unhashed alternate manifest with a different upstream revision while preserving the originally hashed artifact.
- **Source:** launch/notice references are existence-checked (`verify.ts:314–391`); alternate model manifest is separately read (`:411–451`) without hash binding. Model licence notices need not belong to `model.files` (`:817` onward). `assemble.ts:108–125` copies many files without creating individual release artifacts.
- **Impact:** executable source and metadata can diverge from the advertised release without an integrity error. Hashing a nested manifest is sufficient only if every reference it contains is also verified.
- **Acceptance:** tamper/delete any copied backend source, plugin skill, lock, launch profile, model manifest or notice and verification fails; validate launch schema and executable target; require exact closure membership after extraction; inspect real ONNX external-data references when model artifacts exist.
- **Requirements:** CU-INST-11, CU-PLUGIN-10/13/21; design §7.2–7.4.

### B09 — P0: Mac signature/notarization verification is not implemented

- [x] Validate real extracted helper architecture, executable mode, signing identity and notarization on macOS; keep placeholders explicitly unqualified on every platform.
- **Evidence — source-confirmed:** `verify.ts:347–378` recognizes a few magic bytes and rejects non-candidate verification off macOS, but on macOS invokes no signature/notarization check, checks no executable mode, and does not inspect CPU architecture. A signing-identity string matching `/PENDING|PLACEHOLDER|SPIKE|TEST|EXAMPLE/i` bypasses these checks; the placeholder fixture returns no failures.
- **Impact:** even on the proper OS, the implementation cannot establish that an executable is signed, notarized or Apple Silicon compatible. Naming a signing identity is not verifying one.
- **Acceptance:** on an appropriate runner, unsigned, wrong-team, wrong-architecture, non-executable and unnotarized packages fail after extraction; valid artifacts pass with immutable native evidence. Fixture-only validation must not share a successful qualification result with production artifacts.
- **Requirements:** CU-MAC-01, CU-PLUGIN-13/20/21; design §5.1, §7.4.

### B10 — P1: assembler and verifier use different native suite names

- [x] Share one canonical suite registry between assembly, verification, reports and workflows.
- **Evidence — reproduced/source:** `assemble.ts:37` forms `${role}-native`, yielding **`windows-env-native`** and **`mac-native-native`**. `verify.ts:510–514` requires **`windows-native`** and **`mac-native`**. A Windows assembly produced `['contract-conformance','host-consumer','windows-env-native']`, then verification independently required `windows-native` as well. The test currently asserts the incorrect assembler spelling.
- **Impact:** providing the documented native suite does not satisfy the assembled manifest; maintainers would need redundant aliases rather than one correctly identified report.
- **Acceptance:** assembly followed by genuine required reports verifies without invented duplicate suite aliases for both targets; update tests to compare assembler requirements to verifier policy.
- **Requirements:** CU-PLUGIN-14/20/21; design §7.4, §8.5.

### B11 — P1: assembly chooses a package by directory sort order

- [x] Require an explicit package manifest/digest and verify its target, revision, content and provenance before assembling.
- **Evidence — source-confirmed:** `assemble.ts:47–55` sorts `package-<target>-*` directory names and takes the last. Package suffixes are revision prefixes, not timestamps or version ordering. A stale `package-win32-x64-ffffffff...` wins over a newly built `...-aaaaaaaa...`. Assembly does not validate `packageManifest.target` or `upstreamRevision`, and records lock digests from the current checkout rather than proving they produced the selected package.
- **Impact:** an older or wrong-source package can be combined with current source/lock metadata. A remaining `.staging` directory can also participate in this prefix selection.
- **Acceptance:** multiple builds in `out/` cannot change explicitly selected inputs; wrong target/revision/digest and incomplete staging fail before publication. Output records exact selected package identity.
- **Requirements:** CU-PLUGIN-04/21/22; design §7.4, §9.2.

### B12 — P2: rebuilding deletes the previous artifact before success

- [x] Build and validate fresh staging before replacing an existing candidate; preserve the previous artifact on any failure and enforce output-path containment.
- **Evidence — source-confirmed:** `assemble.ts:88`, `tooling/contracts/archive.ts:103`, and `tooling/commands/package.ts:209` remove the existing final directory before copying/validating its replacement. A later missing file, copy failure or archive-validation failure loses the prior output. Comments/tests describe the replacement as atomic, but tests only cover successful rebuilding. Assembly also uses a CLI-supplied version in paths without local semver/containment validation.
- **Impact:** interrupted/failed builds destroy the prior candidate and can leave incomplete staging; concurrent readers cannot rely on the advertised atomic behavior. These are local outputs, not evidence that a remote published artifact was overwritten.
- **Acceptance:** inject failure midway through each build and confirm previous final bytes/digest remain intact; validate all path components and reject traversal; never silently replace a published identity; document the local candidate replacement policy.
- **Requirements:** CU-PLUGIN-16/21; design §7.5.

### B13 — P1: `model:prepare` can report success for an unknown, unverified configuration

- [x] Resolve and validate the selected configuration and model lock, require immutable revision/hash/size fields, and verify only that configuration's approved closure.
- **Evidence — reproduced:** in a temporary project, set `status:'approved'`, add an unrelated model with `revision:null`, one existing weight file with no SHA-256 and an incorrect declared size, and call `modelPrepare(root, 'nonexistent-config', cache)`: **`outcome:'ok'`, `present:1/1`**.
- **Source:** `tooling/commands/backends.ts:195–249` treats config as a reporting label, collects files from every model, makes hashes optional and ignores byte sizes. It does not filter blocked/future configurations. This can also require unrelated future-model files for the default model.
- **Impact:** a successful preparation result does not establish selected weights, revision, licence eligibility or integrity. Actual export currently remains blocked/unimplemented; no production model success was demonstrated.
- **Acceptance:** unknown config, missing revision/digest, wrong size/hash, blocked model, duplicate path, and escaping/symlink path fail; absent unrelated models do not block a valid selected config. Implement the explicit preparation workflow requested by design §2.2, as detailed in T04.
- **Requirements:** CU-PLUGIN-09/10/15, CU-INST-11; design §2.2, §6.6.

## Missing implementation and qualification tasks

### T01 — P1: finish contract publication and consumer conformance

- [ ] Publish a version/digest-identified schema/fixture archive and record the host build that accepts it. Keep the existing registry, generated-type and extracted-archive tests.
- [ ] Exercise compatibility against the supported previous host decoder, not only producer schemas and simulated readers. Agree public tool meanings, backend diagnostics, lifecycle metadata and transport/message ceilings with the host.
- [ ] Add canonical report/package/launch metadata contracts where verification currently relies on handwritten optional shapes; validate actual Windows/Swift encoders against the same fixtures.
- **Owned paths:** `contracts/`, `tooling/contracts/`, `test/contracts/`; coordinate external host tests.
- **Done when:** archive hash, supported decoder versions, negative compatibility results and consumer report are retained together. CU-PLUGIN-01/02/03/18; design §3.7–3.8, P0-B.

### T02 — P1: deliver the real pinned Windows backend

- [ ] Select immutable Windows-MCP revision and extension/fork strategy; populate source/patch/interpreter/dependency digests and commercial notices. Choose managed uv versus prebuilt Python with the Hub consumer.
- [ ] Add real dependencies to `adapters/windows/pyproject.toml`/`uv.lock`; verify source and patches, not just lock-shaped metadata.
- [ ] Wire reviewed observation/capture/display/focus/input/key tools into one persistent server. All upstream entries currently return `TOOL_NOT_WIRED` in `server.py`; the entrypoint still refuses the checked-in unpinned lock.
- [ ] Register required read-only extensions and readiness/version/permission diagnostics; implement the design's handle/PID integrity resolution. Prove telemetry and denied tools are unreachable, including direct calls by name.
- [ ] Produce a launchable managed artifact/Hub lock, not only a source staging directory; install on a clean Windows machine without global developer tools.
- **Owned paths:** `adapters/windows/`, `tooling/commands/backends.ts`, `packaging/windows/`; fix B01–B04 first.
- **Done when:** `backend:prepare`, unit/native tests and target packaging pass against the exact pin; host/Hub consume the same immutable artifact. CU-PLUGIN-05/06/13/15/17; design §4, P0-C/P1.

### T03 — P1: implement bounded native actions and real lifecycle harness

- [ ] Add target/focus/freshness/ownership validation around each upstream atomic input; no retargeting, hidden retries, recipes or duplicate dispatch on reconnect.
- [ ] Implement bounded typing/drag/keys, deadlines, cancellation/disconnect, held-key/button cleanup, and orderly/forced termination. Record dispatch start/completion/last-input with a monotonic clock identity and host correlation.
- [ ] Test permission denial, locked desktop, target closed/reused/moved, focus loss, elevated/unknown-integrity and own-window cases; distinguish not-dispatched from uncertain outcomes.
- [ ] Implement a controlled-window harness behind `--allow-input`. `backendTest()` currently reports “native harness pending P1”; fake lifecycle tests do not exercise production input.
- **Owned paths:** Windows input integration, future Mac helper, native test harnesses and `tooling/commands/backends.ts`.
- **Done when:** long actions can be stopped, held input is cleaned up, uncertain calls are never retried, and independent host termination tests establish no input after stop acknowledgment. CU-PLUGIN-06/07/17; design §3.8, §4.2, §8.3.

### T04 — P1: implement actual model preparation/reference/export/parity

- [ ] Pin GUI-Actor-2B upstream/base revisions, approved source files, licence notices, exact Python/export dependencies, opset, processing/calibration revisions, quantization and pixel budget. `grounding/models.lock.json` is `unfetched`; project runtime dependencies are empty.
- [ ] Implement explicit environment synchronization and approved-weight preparation with download/size notice and configured cache. Current `model:prepare` only checks existing cache; design §2.2 calls for explicit fetch plus synchronization. A documented alternative requires an agreed specification change, not a completion claim.
- [ ] Implement reference image preprocessing/tokenization/positions/inference and decoded geometry. Existing prompt/decode helpers are useful, but `reference/runner.py` only imports torch.
- [ ] Implement graph export, quantization and external-data sharding; graph validation; stage-by-stage parity using frozen tolerances; calibration and held-out evaluation; per-provider latency/memory/cancellation reports. `export/pipeline.py:44` lists only `resolve_lock` as implemented; all seven later stages are unimplemented even with prerequisites installed.
- [ ] Assemble actual graphs, tokenizer/configuration, health fixture, notices and immutable per-file URLs/hashes within host limits; keep GUI-Actor-3B blocked without commercial clearance. Require each supported provider and exact host adapter/catalog/runtime consumer report.
- **Owned paths:** `grounding/`, model manifest/file-set tooling; fix B06/B08/B13.
- **Done when:** actual `model:export` and `model:parity` produce measured reports and the host accepts the exact file set. Export success alone remains a candidate. CU-INST-11, CU-PLUGIN-09/10/15; design §6, P0-D/P2-A.

### T05 — P1: implement real offline inference evaluation and complete reports

- [ ] Add explicit Python reference and ONNX runner profiles that read saved images and execute the selected pinned model without importing desktop executors. Current profiles are recorded/synthetic only; compare rejects non-synthetic profiles.
- [ ] Preserve exact image/crop/transforms, model/runtime/adapter/provider identity and processing versions. Identify cross-runner disagreement as parity failure; keep recorded scoring clearly distinct from inference replay.
- [ ] Version report schemas and require source commit, run timestamps, dataset/split revision and hashes of actual image/workbook content, all per-stage timings, hardware/effective provider, quantization/pixel budget, RAM/VRAM method/availability, denominators and qualification bindings. Current CLI writes `sourceCommit: 'unknown (portable: git commit not recorded offline)'`; report fields are partly optional and measurements are placeholders.
- [ ] Keep absent/ambiguous invalid results non-actionable; compare identical evidence across configurations. Add independence checks and tests for missing files/versions/required cases and tampered source data.
- **Owned paths:** `eval/`, `grounding/`, report schemas, `test/eval/`; fix B05–B06.
- **Done when:** actual inference replay/compare produces independently validated complete reports, and required skips/empty runs cannot pass publication. CU-PLUGIN-12/19; design §8.2, §8.4, P2-B.

### T06 — P1: complete the W-1/native/vision fixture matrix

- [ ] Retain the 17 workbooks and independent cell oracle; extend actual coverage beyond the workbook manifest's narrower `missingCellCount:0` claim. That field does not establish the complete PRD matrix.
- [ ] Capture and label real/sanitized Excel targets for Microsoft 365 Current Channel and Excel 2021, English/Simplified Chinese, 100%/150%, light/dark, full/collapsed ribbons, small/icon-only targets, Name Box/tabs/filter arrows/gallery swatches and repeated/absent controls. Eight JSON smoke labels are not this screenshot corpus.
- [ ] Add protected/read-only and Protected View, edit mode/IME, sign-in/co-authoring, moved/closed/occluded/foreground-changed windows and ownership/integrity fixture families; track missing matrix cells explicitly.
- [ ] Separate versioned calibration and held-out vision data; preserve provenance/consent and hash actual assets. Exercise 20/200/500-row runs, local and desktop-open OneDrive/SharePoint workbooks, data preservation and bounded UIA read-back.
- [ ] Compare every expected output cell after host runs, including cells outside the host's live sample. Record the required accessibility, vision-only, combined and visual-planner benchmark arms and comparison baselines; missing arms remain explicit.
- **Owned paths:** `test/fixtures/w1/`, `eval/datasets/`, native fixture/harness code; external host owns workflow execution and authorization.
- **Done when:** matrix accounting covers all PRD families and supported platform/app combinations, with zero cell mismatch and independent native/host reports. CU-PLUGIN-06/11/19; PRD §4–4.1, design §8.2–8.4.

### T07 — P1: select and deliver the Mac backend

- [ ] Complete a time-boxed Ghost-versus-in-house comparison with measured AX, CJK, Retina/capture geometry, permission denial, cancellation/dispatch timestamps, signing trial, binary size and maintenance results; record winner before Phase 3.
- [ ] Add the selected Swift source, exact Swift/Xcode and dependency/source/patch locks, tests and real build pipeline. Current `adapters/macos/` contains scaffolds and no Swift package.
- [ ] If Ghost wins, remove explicit and implicit vision sidecar paths, recipes/learning and unauthorized action fallbacks; prove no sidecar contact even if upstream assets exist locally. If the in-house helper wins, document the conditional Ghost requirements as not applicable and test equivalent isolation.
- [ ] Implement required observation/input/diagnostics and bounded lifecycle; package/sign/notarize an Apple Silicon helper with correct permissions, notices and Hub metadata. Validate TCC attribution and signed updates with the packaged host.
- **Owned paths:** `adapters/macos/`, `packaging/macos/`, Mac workflows/tests; fix B09–B10.
- **Done when:** selected helper passes unit/native and signed-host tests with exact artifact evidence. CU-PLUGIN-08, CU-MAC-01/03; design §5, P0-E/P3.

### T08 — P1: replace qualification workflow placeholders with executable gates

- [ ] Wire Windows controlled-desktop/Excel, packaged signed Mac, reference/CPU and each claimed GPU/provider runner, and pinned host/Hub consumer suites. Current native/model/consumer workflows explicitly exit with UNQUALIFIED after preflight; they do not execute these suites.
- [ ] Preserve separate portable PR tests and explicit input qualification. Preflight hardware/permissions/licenses, capture exact artifact/runner identities and machine-readable failing/missing reports.
- [ ] Run Windows package/launch checks and selected Swift build/tests, not only Python units or Mac lock consistency. Require changed-target reports and identity-bound evidence reuse at promotion.
- **Owned paths:** `.github/workflows/`, native/model/consumer harness integration; fix B05–B07/B10.
- **Done when:** a real candidate triggers the correct suites; missing hardware, skipped required work, stale artifacts or absent consumer reports prevent qualification. CU-PLUGIN-20; design §8.5.

### T09 — P1: deliver immutable distribution artifacts and consumer handoff

- [ ] Fix B05–B12, then assemble separate common plugin ZIP, selected managed Windows resources, native Mac archive and independently delivered model files. Current staging/release JSON is not a tested Hub install plan.
- [ ] Supply the exact Hub ingestion mapping and target-conditional install plan fixtures; keep ONNX/model resources out of the Hub closure and development environments out of runtime packages.
- [ ] Add explicit candidate versus per-target qualified state, supported revision tuples, complete role-specific pins, source/toolchain provenance, notices, upgrade compatibility diff, exact producer/host/Hub evidence and immutable locations/digests.
- [ ] Validate clean-machine installation, repair/reinstall, upgrades, failed-candidate recovery, signature/permission continuity and previous-version availability with consumers. Never activate or replace host resources during a running session.
- [ ] Record each handoff's artifact role/version/digest, consumer build and accepted or missing gate. Do not substitute test fixture files for real artifacts.
- **Owned paths:** `tooling/release/`, `packaging/`, compatibility/upgrade docs and workflows; installation/activation remains host/Hub code.
- **Done when:** the complete extracted closure verifies and matching pinned consumers accept it; only supported target combinations are published as qualified. CU-PLUGIN-04/10/13/14/21/22; design §7, §9, P4.

### T10 — P2: reconcile toolchain/work-package documentation with verified reality

- [ ] Update README and work-package/audit status links to this audit; remove blanket “portable defects fixed” and “only hardware remains” language where B01–B13 show otherwise. Keep older findings as history rather than duplicating all old checkboxes as current work.
- [ ] Document current commands and correct test counts, distinguish unit scaffolds from native delivery, and expose/document the assembly command consistently (internal CLI exists; `package.json` has no `release:assemble` script).
- [ ] Finish exact production model/backend/Swift toolchain selection; ensure local wrappers verify the intended tool versions as well as CI pins. Preserve independent Python environments and Node-only default checks.
- [ ] For each design work package, record source/configuration, positive/negative tests, actual local command, output identity, named missing implementation, external prerequisite and acceptance report. Mark source implementation gaps separately from hardware/consumer dependencies.
- **Owned paths:** `README.md`, `doc/work-packages.md`, workflow/command/toolchain configuration.
- **Done when:** completion claims point to reproducible evidence for the current artifact and outstanding work is accurately categorized. CU-PLUGIN-15/16/22; design §1.2, §2.2, §9.1–9.2.

## Deferred scope and suggested execution order

Phase 5 expansions—larger/verifier models, Windows ARM, Intel Mac, Linux control, multi-display/mixed-DPI control, and offline bundles—remain unqualified future scope. Their absence is not a defect in the initial Windows release, but no support claim should be made before separate host/Hub and producer gates.

1. Fix B05–B10 to make release results trustworthy; fix B01–B04 before relying on the Windows server.
2. Fix B11–B13 and settle T01/T10 identities and workflow contracts.
3. Complete T02/T03 Windows delivery independently of model work; complete T04/T05 model/evaluation and T06 fixtures.
4. Perform T07 Mac selection before implementing its production artifact.
5. Finish T08/T09 qualification and exact consumer handoffs for each supported target.

A task is complete only when its stated acceptance passes against identified artifacts. Green portable tests alone do not close native/model/consumer tasks, and acquiring hardware alone does not implement the missing code.
