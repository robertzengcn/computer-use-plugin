# Remaining PRD work and confirmed errors — 2026-10-11

**The PRD is not complete, and the current tree still has release and protocol errors.** Portable tests pass. The original October 11 reproductions for N01–N12 no longer fail in the same way. Treating that as “N01–N12 fixed” or as a qualified plugin release is inaccurate: a hand-edited evidence set is still marked `qualified` while Windows is unpinned and the model lock is unfetched, and the Windows MCP server still accepts tool calls without a successful `initialize`.

This file replaces the status assessment in [2026-10-11-prd-audit-TODO.md](2026-10-11-prd-audit-TODO.md). It keeps that audit’s requirement IDs. It does not close a requirement because a unit suite is green.

## What was checked

- PRD v1.5 SHA-256 `2754efc7150bfcffd82fb30e3878f8a0c99ce8317bf3896cbc484f7ee9ebaa29` (unchanged).
- Technical design v1.5 SHA-256 `e1dde6fa9edd66eba77328823543a095987c66e72c03a2450e83f6be3ec26efc` (unchanged).
- Base HEAD `1089984962cfa31c5133eaca30503e2d4ad585c7`. The implementation under review is the uncommitted working tree.
- Working-tree diff SHA-256 (`git diff --binary`): `698f29b3637a2c58701216b7266bb32d55810463d7f13effc08df377133f7525`. This is **not** the tree the previous audit hashed (`00924dd6…`).
- `npm run check`: PASS. Build, ESLint, TypeScript, **216 tests / 20 files**, `contracts:check` — 15 schemas, 41 valid fixtures, 33 invalid fixtures.
- `adapters/windows`: `uv run --locked pytest -q` — **110 passed, 3 skipped**; `ruff check` PASS. The three skips are `@pytest.mark.skipif(sys.platform != "win32")` in integrity, window-at-point, and the owned-PID server success path. Linux execution does not qualify Windows.
- `grounding`: `uv run --locked pytest -q` — **76 passed**; `ruff check` PASS.
- Probes below used temporary copies or in-process server calls. No native input, weight download, signing, or publication was run.
- Native Windows/Excel, signed Mac, real models/providers, and pinned host/Hub builds were **not run**.

Priorities: **P0** blocks a trustworthy qualified release; **P1** is required behavior that is still wrong or absent; **P2** is reliability or status accuracy. Priority is independent of rollout phase.

## Original N01–N12 reproductions

These earlier failures are closed **as reproductions**. Their acceptance criteria are not closed. Follow the E-items, not the old checkboxes.

| Earlier item | Original reproduction now | What remains |
| --- | --- | --- |
| N01 minimal `{status:pass}` report | Fails. Reports require schema, counters, `caseId`, 64-hex `fixtureHash`, run and configuration strings | E01. No canonical report schema. A zero hash counts. Design §8.4 measurements are optional |
| N02 wrong `sourceCommit` / unknown runner / second model parity | Those three mutations fail. `qualification` is `candidate` or `qualified` | E01, E02. `qualified` is still a flag inside the reports |
| N03 `1..2` and `>=999.0.0` | `1..2` fails parse. `>=999.0.0` fails the plugin-major heuristic. `0.1.0 - 0.2.0` passes | E03. The heuristic is the plugin manifest major (`0.1.0`), not a host build |
| N04 empty `files`, renamed manifest, escaping symlink, JSON `null` | Those mutations return structured failures | E04. Non-package blobs and Mac helper artifacts skip closure |
| N05 profile byte drift, missing profile, marker argv | Those mutations fail. Profile bytes are hashed | E05. Interpreter path and Mac telemetry are still loose |
| N06 ignored `--source-commit`, stale revision, same-length tamper | Explicit commit is recorded. Revision and file-hash mismatches fail before copy | E06. An explicit commit hides a dirty tree. There is no package-digest argument |
| N07 `../../` package entry | Rejected before copy | E09. Symlinked sources are dropped silently |
| N08 delete-then-rename | `publishStaging` moves the previous candidate aside and restores it if the final rename fails | Closed for that failure. Concurrent readers can still observe a missing final path during the swap |
| N09 `revision: main`, `not-qualified`, outside symlink | Those selections fail | Model preparation still only verifies a cache. Export is not implemented (T04) |
| N10 `select()` on pipes and assumed PID 42 | The flush test uses a reader thread and runs without `-u`. Success on Windows uses `os.getpid()` and is skipped off Windows | Windows CI was not executed here |
| N11 `additionalProperties` ignored on local tools | Undeclared fields on `process_integrity` and `window_at_point` fail before the native call | E07. `notifications/initialized` alone unlocks the server |
| N12 Mac package JSON treated as the helper; Windows argv rules applied to `[helper, mcp]` | Assembly requires a `helper` entry. Mac argv is a separate check. Fat headers are inspected. `codesign`/`spctl` have timeouts | E08. No signed helper. Team matching can miss. Candidate blobs skip Mach-O |

## Confirmed errors

### E01 — P0: a release can be marked qualified without pins, measurements, or a real artifact

- [x] Make `qualified` depend on pinned lock status, immutable revisions, real package closures, non-placeholder fixture hashes, and consumer identities that this repository can actually check. Keep producer-only results as `candidate`.
- **Reproduced** from `test/fixtures/release/good`: set every report’s `qualification.producerOnly` to `false`, set the parity report `run.runnerKind` to `reference`, set the model `parityReport.status` to `passed` and point `parityReport.sha256` at the edited parity file, drop the `mac-native` artifact and the `mac-native` suite, and rehash artifact bytes. `verifyRelease()` returned **`qualification: "qualified"` and `failures: []`**.
- At that moment `adapters/windows/upstream.lock` status was **`unpinned`** (`selectedRevision: null`) and `grounding/models.lock.json` status was **`unfetched`**.
- The same reports still use `fixtureHash` `0000…0000`. `validateEvidenceReport()` accepts any 64 hex digits. There is no `computer-use-*-report` schema under `contracts/`. Design §8.4 run timestamps, fixture-manifest hash, hardware, p50/p95 latency, peak memory, and measurement method are not required.
- The Windows artifact in that fixture is the text `windows-env-payload-v0-spike`. It is not a package record, so nested closure never runs, and the result is still eligible for `qualified` once the flags above are flipped.
- **Source:** `deriveQualification()` in `tooling/release/verify.ts` returns `qualified` when Mac identities are absent or non-placeholder, model `parityReport.status === 'passed'`, and every report has `producerOnly === false`. It never reads lock `status`. The comment above the pin loop says unpinned locks stay candidate-only; that downgrade is not implemented.
- **Impact:** publication eligibility is a claim inside the evidence files. The README statement that N01–N12 are fixed, and `work-packages.md` marking the portable foundation DONE, describe a stronger gate than the one that just returned `qualified`.
- **Acceptance:** the probe above returns `candidate` or a structured failure while either lock is unpinned/unfetched, while any case `fixtureHash` does not identify a file in the release, or while a backend artifact is not a verified package/helper closure. A `qualified` result requires the design §8.4 fields and a machine-readable consumer build identity. Reports are validated with canonical schemas, not only handwritten field lists.
- **Mapping:** CU-PLUGIN-04/14/19/21; design §7.5, §8.4–8.5.

### E02 — P0: evidence is bound to the release commit and to model parity bytes, and not to the Windows or consumer artifacts

- [x] Require each native, host, and Hub report to name the exact artifact digest, consumer build, and measured provider/hardware it claims to cover.
- **Reproduced as part of E01:** the Windows report has `sourceCommit: "abc1234"` and `provider: "cpu"` and no `run.artifactDigest`. After the E01 edits, verification still succeeded. `verifyEvidenceBinding()` checks `run.artifactDigest` only for `suite === 'mac-native'`.
- Host and Hub reports are accepted when `runnerKind` is `host-suite` or `hub-check` and `provider` is one of `host`, `hub`, `cpu`, `native`, `contract`. Those strings are not compared to a pinned AiFetchly or Hub build, a machine, or a provider package.
- **Source:** `verifyEvidenceBinding()` and `PROVIDER_ALLOWLIST` in `tooling/release/verify.ts`. `mandatorySuitesForRoles()` does require `hub-ingest` for a plugin artifact and `host-consumer` for plugin, Windows, Mac, and model artifacts. Requiring a suite name is not the same as binding that report to an artifact.
- **Impact:** a report written for another Windows package or another host build gates this candidate whenever the commit string and the report’s own hash match.
- **Acceptance:** changing the Windows package digest, the host build id, or the measured provider without a matching report field fails. An accessibility-only Windows release does not need a model parity report. A model release needs one parity report per model digest, which the current per-model digest loop already requires.
- **Mapping:** CU-PLUGIN-04/14/19/21; design §7.4–7.5, §8.5.

### E03 — P0: compatibility checks parse ranges and compare them to this repo’s own version

- [x] Validate host ranges against pinned consumer builds, and require production pins to be full SHAs whose dependency digests match the shipped locks.
- **Current behavior:** `isSupportedSemverRange()` rejects `1..2` and accepts hyphen ranges. `minSatisfyingMajor()` then compares the range with `plugin/manifest.json` version `0.1.0`. `>=999.0.0` fails. `>=0.1.0` passes. No AiFetchly build is consulted. The comment in `verify.ts` says host-consumer build records do not exist yet.
- **Current behavior:** `selectedRevision` is checked only when it is a non-empty string. The committed Windows lock has `selectedRevision: null`, so the full-SHA and `dependencyLockSha256` checks are skipped, and hashing the unpinned lock file still satisfies `lockDigests`.
- **Current behavior:** model `runtimeId` / `adapterId` are compared with `compatibleWith` only when both sides are strings. An omitted manifest field does not fail the tuple.
- **Acceptance:** a production candidate with a null or floating revision fails closed. A host range that no recorded consumer build satisfies fails. Model runtime, architecture, quantization, and processing revisions agree with the outer artifact and the pinned consumer. Deliberate `synthetic-test-adapter` fixtures stay labeled `candidate`.
- **Mapping:** CU-PLUGIN-04/15/21; design §1.1–1.2, §7.4.

### E04 — P1: package closure runs only when the artifact bytes look like a package record

- [x] Verify the extracted directory for every Windows and Mac backend artifact, including files that sit beside a helper binary.
- **Source:** `verify.ts` calls `verifyPackageClosure()` when `isPackageShaped()` sees a JSON `files` key or the location ends with `package-manifest.json`. The good Windows artifact is plain text, so the check does not run. `assemble.ts` sets the Mac artifact `location` to `package/<helper>`, so a normal Mac assembly does not point the verifier at `package/package-manifest.json`.
- **Impact:** unlisted files next to a helper, or a hashed spike blob standing in for an environment, are outside the closure gate that empty manifests and escaping symlinks now hit.
- **Acceptance:** every backend artifact has exactly one package record; every extracted file is declared once; realpath containment holds; a text blob cannot satisfy `windows-env` or `mac-native` for anything beyond an explicitly non-qualified spike.
- **Mapping:** CU-PLUGIN-13/18/21; design §7.4.

### E05 — P1: launch metadata is hashed, and the executable it names is not pinned

- [ ] Bind each profile to the shipped interpreter or helper digest, and require disabled telemetry on Mac profiles too. (2026-10-11 follow-up: exact argv/cwd/telemetry schemas, hash-bound profile bytes, and Mac telemetry gating are implemented and tested; shipped-interpreter byte binding stays open — no interpreter artifact exists yet, T02.)
- **Source:** `validateWindowsLaunchProfile()` accepts argv `[0]` when it equals `<managed-python>` or the path ends in `python` / `python.exe`. `validateMacLaunchProfile()` checks `envPolicy.telemetry` only when that field is present. A Mac profile can omit `envPolicy` and still pass. Digest binding covers the profile file the manifest already names.
- **Acceptance:** changing the reviewed executable bytes fails even when the argv text stays `[<managed-python>, -u, -m, aifetchly_windows.entrypoint]` or `[<helper>, mcp]`. Telemetry disabled is required on both platforms. Windows and Mac schemas stay separate.
- **Mapping:** CU-PLUGIN-05/13/17/21; design §1.3, §4.2, §7.4.

### E06 — P1: an explicit source commit hides a dirty worktree

- [x] Apply the dirty-tree policy even when `--source-commit` is passed, and accept a package digest as well as a directory name.
- **Source:** `tooling/commands.ts` uses `--source-commit` as the recorded identity immediately. The `git status --porcelain` check runs only in the `else` branch. `AssembleInput.packageDir` selects a directory name. There is no digest flag. `assembleRelease()` does rehash package files and compares `upstreamRevision` with the checkout lock before copying.
- **Impact:** `release:assemble --source-commit <clean-sha>` on this dirty tree records a clean build. The recorded lock digests can still be the unpinned files from E03.
- **Acceptance:** a dirty tree is recorded only with an explicit dirty policy, including when the caller passes a commit. Package selection by digest works with several builds present. Unsupported flags already fail.
- **Mapping:** CU-PLUGIN-04/21/22; design §7.4, §9.2.

### E07 — P1: `notifications/initialized` skips `initialize`, and a bad id is echoed

- [x] Set the initialized flag only after a successful `initialize` result. Validate id types before any error that echoes `id`. Keep upstream tools unwired until T02 supplies real schemas.
- **Reproduced** with `serve()` in-process:

  ```text
  {"method":"notifications/initialized"}
  {"jsonrpc":"2.0","id":2,"method":"tools/list"}
  ```

  The second call returned a successful tool list. No `initialize` was sent. The first object has no `jsonrpc` field.

  ```text
  {"jsonrpc":"2.0","id":[],"method":"tools/list"}
  ```

  The response was `{"id": [], "error": {"code": -32602, "message": "tools/list requires a prior initialize handshake"}}`. The array id was echoed. `handle_request()` would have replaced that id with `null`; `_serve_one()` returns first.
- **Source:** `adapters/windows/src/aifetchly_windows/server.py` `_serve_one()`. The `notifications/initialized` branch sets `initialized = True` even when `handle_request()` rejected the envelope, and it runs before the “requires initialize” check. `test_initialized_notification_with_id_is_acknowledged` sends `notifications/initialized` and then expects `tools/list` to succeed, so the suite locks the bypass in.
- **Also still true:** `screenshot` and other upstream names return `TOOL_NOT_WIRED` with a generic object schema. `handle_request()` itself stays stateless. No host-SDK lifecycle test exists.
- **Acceptance:** tool listing and calls before a successful `initialize` fail and do not echo a non-string/non-integer id. A bare or malformed `notifications/initialized` does not flip the flag. Notifications still get no reply. Pinned upstream tools use their real schemas once T02 wires them.
- **Mapping:** CU-PLUGIN-05/17/18; design §3.7–3.8, §4.2.

### E08 — P1: Mac signature identity can pass without the expected team

- [x] Require an explicit team id, a successful `codesign -d`, an arm64 slice that is actually Mach-O, and notarization evidence before any Mac artifact is `qualified`.
- **Source:** `verifyMacSignature()` fails when `TeamIdentifier=` is missing. If the manifest identity has no `(TEAMID)` and that identity string is absent from the codesign text, the following team comparison does not run, so a different team still passes. Candidate artifacts (`qualification: "candidate"` or a `PENDING`/`SPIKE`/`TEST` identity) skip the Mach-O and executable-mode checks. `checkFatSlices()` reads `cputype` fields and does not validate slice bodies.
- **Repository state:** `adapters/macos/` contains `README.md`, `ghost-os/upstream.lock` (`unpinned`), and `tool-allowlist.json`. There is no Swift package, signed helper, or notarization record. `plugin/manifest.json` has `macos.status: "spike-pending"`.
- **Acceptance:** assemble and verify a real signed arm64 helper; Intel-only slices, a mismatched team, a failed `codesign`/`spctl`, and a hung tool fail. A Mac report’s `artifactDigest` matches that helper. Signed-host and TCC evidence stays T07.
- **Mapping:** CU-MAC-01, CU-PLUGIN-13/17/20/21; design §5.1, §7.4, §8.5.

### E09 — P2: symlinked backend sources are omitted from the package without an error

- [x] Reject symlinks during `copyTree`, or copy the real file only when `realpath` stays inside the repository, and fail the build when a required file is not a real file.
- **Source:** `tooling/commands/package.ts` `copyTree()` copies `entry.isFile()` and skips symbolic links. `fileExists()` on required paths follows links, so a required path can look present while the staged closure omits it.
- **Acceptance:** a symlink in `adapters/windows/src` fails packaging or is materialized only when its real path is inside the repo and the manifest hash is of those bytes. Neighboring outputs stay unchanged on failure.
- **Mapping:** CU-PLUGIN-13/21; design §7.4.

## PRD requirements

“Partial” means producer scaffolding exists and the acceptance evidence does not. Host-owned planner, UI, supervisor, and Hub services are out of this repository; the plugin still has to supply the artifacts and reports those consumers accept.

| ID | Status | Remaining work |
| --- | --- | --- |
| CU-PLUGIN-01 | Partial. 15 schemas, 74 fixtures, generated types, contract archive | Publish a digest-identified archive a recorded host decoder accepts. Add report/package/launch schemas (E01, T01) |
| CU-PLUGIN-02 | Partial. Allowlist and local argument checks exist. Upstream calls return `TOOL_NOT_WIRED` | E07. Real upstream isolation is T02. Schemas still cannot mint grants |
| CU-PLUGIN-03 | Partial. Lifecycle, geometry, and point-only fixtures exist | Second production adapter is not required. Consumer and model acceptance are T01, T04, T05 |
| CU-PLUGIN-04 | Partial. Range parser, id allowlists, and commit binding exist | E01–E03, E06. Unsupported tuples can still be marked `qualified` |
| CU-PLUGIN-05 | Not delivered. `upstream.lock` is `unpinned`. `dependencies = []`. No Windows-MCP pin | E05, E07, T02 |
| CU-PLUGIN-06 | Partial. Integrity and window-at-point helpers and bounds exist | Native capture/UIA/CJK/ownership matrix is T03, T06. Three native tests skip off Windows |
| CU-PLUGIN-07 | Not delivered. Fake lifecycle tests exist | Bounded typing/drag/cancel/cleanup is T03 |
| CU-PLUGIN-08 | Not started. Mac decision evidence is absent | T07, before any Phase 3 claim |
| CU-MAC-01 | Not started. No selected Swift/Ghost source or signed helper | E08, T07 |
| CU-MAC-03 | Policy data only (`tool-allowlist.json`) | T07. Applies if Ghost is selected |
| CU-INST-11 | Partial. 3B is `blocked` / `qwen-research-non-commercial` in `models.lock.json` | Licence fields exist. An immutable licence-chain file set does not (E01, T04) |
| CU-PLUGIN-09 | Not delivered. `IMPLEMENTED_STAGES` is only `resolve_lock`. Seven later stages stay unimplemented | T04 |
| CU-PLUGIN-10 | Not delivered. Model manifest fixtures exist. No production file set | T04, T09 |
| CU-PLUGIN-11 | Partial. 17 synthetic workbooks: 10 regression, 3 calibration, 4 held-out; families are layout (11) and data-preservation (6); locales en-US (10) and zh-CN (7); row counts 0/20/200/500 | Vision, native-state, and handoff families from PRD §4.1 are absent. All 8 `eval/datasets/w1-smoke` cases are regression. T06 |
| CU-PLUGIN-12 | Partial. Replay/compare refuse desktop executors and only run `recorded` or `synthetic` profiles | Reference/ONNX replay and design §8.4 reports are T05. `eval/cli.ts` still writes `sourceCommit: 'unknown (portable: git commit not recorded offline)'` |
| CU-PLUGIN-13 | Partial. Staging and `publishStaging` exist | E04, E05, E08, E09, T02, T07, T09 |
| CU-PLUGIN-14 | Not delivered | E01–E06, T08, T09. No qualified compatibility release |
| CU-PLUGIN-15 | Partial. Separate Node, Windows, and grounding projects exist, with empty runtime dependencies | Production pins and toolchains are E03, T02, T04, T07, T10 |
| CU-PLUGIN-16 | Portable default workflow meets the executed acceptance: `npm run check` on this checkout without a desktop or weights | Windows unit CI was not executed here. Status text overstates the gates (T10) |
| CU-PLUGIN-17 | Partial. Persistent flush and local schema checks exist | E07. Readiness, cancellation, disconnect, and shutdown are T02, T03 |
| CU-PLUGIN-18 | Partial. JSON Schema is canonical for the current contracts. TypeScript and Python fixture checks pass | No Swift encoder. No host decoder report. Report schemas are missing (E01, T01, T07) |
| CU-PLUGIN-19 | Partial. Counters, case ids, and a hex `fixtureHash` are required | E01, E02, T05. Zero hashes and missing measurements still pass a gate |
| CU-PLUGIN-20 | Partial. Portable workflows exist. Native, model, and host/Hub workflows print `UNQUALIFIED` and exit 1 | T08. Missing hardware is visible. It is not a passing qualification |
| CU-PLUGIN-21 | Partial. Hashes, suite names, and launch digests are checked | E01–E05, E08. `qualified` with `failures: []` was reproduced on unpinned locks |
| CU-PLUGIN-22 | Partial. `doc/work-packages.md` lists paths and commands | It says E01–E18 are fixed and the portable foundation is DONE. README says N01–N12 are fixed. Both overstate E01–E09. Exact version/digest handoffs are T09, T10 |

PRD §6.1 failure rows (permission denied, stale geometry, uncertain input, stop, sidecar, export divergence, skipped native jobs) are specified. The production backends that have to enforce them are T02, T03, T04, and T07.

Phase 5 items in PRD §5 and §7 — larger models, Windows ARM, Intel Mac, Linux desktop control, mixed-DPI/multi-display, offline bundles — stay deferred. Their absence is not an initial Windows-release defect.

## Remaining implementation tasks

### T01 — P1: contract publication and consumer conformance

- [ ] Publish the contract archive by version and digest and record the host decoder build that accepts it, including previous-version and negative cases.
- [ ] Add canonical report, package, and launch schemas. Validate the serializers that actually emit them (E01, E04, E05).
- [ ] Add Swift encoding checks when the helper exists.
- **Exit:** producer and consumer reports for one archive digest. Invalid versions, capabilities, and geometry fail in both places. Design §3.7–3.8, P0-B.

### T02 — P1: pinned Windows backend and managed artifact

- [ ] Pin the Windows-MCP revision, interpreter, patch, and dependency lock. Choose managed uv or a prebuilt interpreter with Hub.
- [ ] Implement the reviewed state, capture, display, focus, input, and key handlers. Replace `TOOL_NOT_WIRED` for that surface. Disable shell, registry, broad filesystem/process tools, and telemetry.
- [ ] Fix E05 and E07. Prove a denied tool name cannot run. Ship a clean-machine launchable closure whose launch profile matches the shipped bytes.
- **Exit:** the pinned artifact passes Windows unit and native checks and a host/Hub private-launch acceptance. Design §4.

### T03 — P1: bounded input, stop, and cleanup

- [ ] Implement bounded typing, drag, and keys with target, focus, freshness, and ownership checks. No retargeting, hidden retries, or repeated uncertain actions.
- [ ] Implement cancellation, disconnect, deadlines, held-button/key cleanup, owned-process termination, and monotonic last-dispatch timestamps.
- [ ] Add `--allow-input` tests for locked desktop, denied permission, moved/closed/reused/occluded/own/elevated targets, and timeout before and after dispatch.
- **Exit:** native tests show no input after stop acknowledgement and no automatic repeat of an uncertain action. Design §3.8, §4.2, §8.3.

### T04 — P1: model pin, export, and parity

- [ ] Pin GUI-Actor-2B and base revisions, file hashes, licences, Python/export stack, opset, quantization, processing, calibration, and pixel budget. Keep GUI-Actor-3B blocked.
- [ ] Implement the preparation command the design describes, or revise the design so cache verification is the specified command. Today `modelPrepare()` never downloads, and `IMPLEMENTED_STAGES` contains only `resolve_lock`.
- [ ] Implement reference inference, export, sharding, quantization, stage parity, absence/ambiguity calibration, and per-provider resource measurement.
- **Exit:** real export and frozen-tolerance parity for each claimed provider, bound to the file set the host catalog accepts. Design §6.

### T05 — P1: offline reference/ONNX replay and complete reports

- [ ] Add Python reference and ONNX profiles that reprocess saved images and never load a desktop executor. Keep recorded scoring distinct from inference replay.
- [ ] Record real `sourceCommit`, asset hashes, configuration, stage timing, hardware, provider, memory, and measurement method (E01, E02).
- **Exit:** replay and compare on one immutable fixture set produce reports an independent schema check accepts. Design §8.2, §8.4.

### T06 — P1: W-1 fixture matrix

- [ ] Keep the 17 synthetic workbooks and full-cell oracle.
- [ ] Add Excel UIA/capture cases and the PRD §4.1 vision, native-state, and handoff families: Microsoft 365 Current Channel and Excel 2021, English and Simplified Chinese, 20/200/500 rows, local and desktop-open cloud workbooks, 100%/150% scale, light/dark, full/collapsed ribbons, small/icon/repeated/absent controls, protected/read-only/Protected View, IME, sign-in/co-authoring, and moved/closed/foreground/ownership/integrity variants.
- [ ] Move vision smoke cases into real regression/calibration/held-out splits. Run accessibility-only, vision-only, combined, and visual-planner arms with the host, and report missing arms explicitly.
- **Exit:** versioned matrix with zero post-run cell mismatches against the independent oracle. PRD §4–4.1.

### T07 — P1: Mac selection and helper

- [ ] Record the Ghost-versus-Swift comparison (AX/CJK, Retina, permission denial, cancellation, signing trial, binary size, maintenance) before Phase 3.
- [ ] Build the selected source with pinned Swift/Xcode/dependencies. If Ghost wins, disable sidecar, recipe, learning, and unauthorized fallback. If the in-house helper wins, record Ghost isolation as not applicable.
- [ ] Sign and notarize the helper and fix E08.
- **Exit:** selection report, verified native artifact, signed-host conformance. Design §5.

### T08 — P1: qualification CI that runs the suites

- [ ] Replace the deliberate `UNQUALIFIED` exits in the Windows native, Mac packaged-native, model, and host/Hub workflows with the real suites on controlled runners. Keep explicit opt-in.
- [ ] Emit machine-readable target, artifact, and runner reports. Reuse evidence only when the bound identities are unchanged. Fix E07 before calling the Windows unit job green on Windows.
- **Exit:** one immutable candidate executes its required producer and consumer gates. Design §8.5.

### T09 — P1: distribution closure and handoff

- [ ] Fix E01–E06 and E08. Build the common plugin ZIP, managed Windows environment, native Mac archive, and independent model file set. Keep model bytes out of Hub delivery and developer toolchains out of customer packages.
- [ ] Supply Hub install-plan mapping, target qualification state, source/toolchain/artifact/evidence tuples, notices, and an upgrade compatibility diff.
- [ ] Run clean-machine install, repair, upgrade, failed-candidate recovery, and previous-version availability against pinned host and Hub builds.
- **Exit:** extracted closure verifies, and only supported combinations are `qualified`. Design §7, §9.

### T10 — P2: status text matches the gates that actually pass

- [ ] Update `README.md` “Current status” so it no longer says N01–N12 are fixed. Point it at this file. State E01–E09 and T01–T09 as open.
- [ ] Update `doc/work-packages.md`: the portable foundation is a producer skeleton. P0-B’s design exit still includes a host decoder. Do not mark that package done on `contracts:check` alone.
- [ ] For each package, record owned paths, command, source/configuration, positive and negative tests, output digest, and the acceptance report. Separate missing implementation from missing hardware.
- **Exit:** a reader can reproduce the current evidence and can see which acceptance lines are still open. Design §9.1–9.2.

## Order

1. Fix E01–E03 before any `qualified` result is treated as publication eligibility.
2. Fix E04–E09, then finish the Windows backend (T02, T03) without waiting for the model.
3. Finish contract handoff T01 and model/eval/fixture work T04–T06.
4. Finish the Mac decision and helper T07, then run T08 and T09 on the corrected gates.
5. Keep T10 aligned with the latest probe, not with the previous audit’s closed reproductions.

A requirement is complete when its artifact and its acceptance evidence exist. A passing portable suite, a closed N-reproduction, or a self-set `producerOnly: false` does not complete it.
