# Updated PRD and TODO audit — 2026-10-11

**Verdict: the PRD and previous TODO are not fully implemented.** The update fixes several important defects, and all existing tests pass on this Linux environment. However, **12 current defect groups** remain, including incomplete fixes, a Windows test portability regression, and release-integrity gaps. The ten implementation work streams from the previous audit also remain open, with partial progress.

This document reviews the **updated working tree**, including uncommitted and untracked implementation files. It replaces the previous audit's status assessment, not its historical evidence. Do not treat every checked B01–B13 box in the October 10 TODO as meeting its full acceptance criteria.

## Audit identity and validation

- Base HEAD: `1089984962cfa31c5133eaca30503e2d4ad585c7`. The code changes are uncommitted; reviewing HEAD alone would miss them.
- Reviewed tracked diff SHA-256 (`git diff --binary`): `00924dd6dd0aad31973d77c1114c5c824920c9e9c786694d1ead8ad6bbd98ff4`.
- Reviewed new `tooling/release/suites.ts` SHA-256: `7e4ca11352b58fb4e9756d72cd9988c7e3f553213516554e8e35dcc64a827f86`.
- [PRD v1.5](../../aiFetchly/docs/prd/computer-use-plugin-prd.md), unchanged SHA-256: `2754efc7150bfcffd82fb30e3878f8a0c99ce8317bf3896cbc484f7ee9ebaa29`.
- [Technical design v1.5](../../aiFetchly/docs/prd/computer-use-plugin-technical-design.md), unchanged SHA-256: `e1dde6fa9edd66eba77328823543a095987c66e72c03a2450e83f6be3ec26efc`.
- [Previous TODO](2026-10-10-prd-audit-TODO.md), reviewed SHA-256: `2f28808c2eb438696d1f49cd8f2ce30c506a4a6e9d1fc44c5e8241f6264ef05c`.
- Reviewed the changed Windows helpers/server/tests, release verifier/assembler/schema/suite policy, cache preparation, packaging/archive replacement, fixtures and documentation; rechecked the unchanged production/backend/model/CI gaps against both specifications.
- All mutation, symlink, copy and failure-injection probes used temporary files. No native input, model-weight download, publication or implementation edit was performed. Existing user changes were preserved.

| Verification | Current result |
| --- | --- |
| `npm run check` | PASS: build, ESLint, TypeScript, **181 tests / 18 files**, declaration/conformance checks |
| Contract fixtures | **15 schemas, 41 valid and 33 invalid fixtures** |
| Windows project: `uv run --locked pytest -q` | **105 passed, 2 skipped** on Linux |
| Grounding project: `uv run --locked pytest -q` | **76 passed** |
| Each Python project: `uv run --locked ruff check src tests` | PASS |
| `git diff --check` | PASS |
| Previous release mutation examples | Now rejected: missing counters, hidden skips, unrelated schema/synthetic native runner, wrong first-model parity digest, unsupported ID string, missing role-specific pins, altered model notice, alternate unhashed model manifest |
| Persistent MCP without `-u`/`PYTHONUNBUFFERED`, stdin kept open | PASS: initialization response arrives before EOF |
| Additional release/cache/assembly probes | Failures of intended checks reproduced below despite green unit suites |
| Native Windows/Excel, signed Mac, real models/providers, host/Hub | **Not run / not qualified** |

**362 tests passed; two skipped.** Linux execution of Windows-project unit tests does not establish Windows CI success; see N10. Source-confirmed findings are explicitly distinguished from executed reproductions. This audit cannot establish that no other bugs exist.

Priorities: **P0** = blocks trustworthy release verification or artifact containment; **P1** = required functionality/correctness; **P2** = reliability/documentation. Priority is independent of rollout phase.

## Reassessment of all previous defect tasks

| Previous task | Current assessment | Evidence / remaining work |
| --- | --- | --- |
| B01: buffered MCP responses | **Original defect fixed** | Server explicitly flushes; independent test without unbuffered launcher succeeds. Newly added test portability issue is N10. |
| B02: MCP schemas/errors/notifications | **Partial** | Input schemas and `isError` added; notifications suppress replies. Actual schema/envelope enforcement and host-SDK validation remain incomplete: N11/T02. |
| B03: always-false ownership | **Original defect fixed locally** | Server passes its backend PID; helpers return unknown when owner context is absent. Host must still compare returned target PID with its own trusted host PID. Native acceptance remains T03. |
| B04: native numeric bounds | **Original defect fixed locally** | Server/helper checks reject bool and LONG/DWORD overflow. Native qualification remains T03. |
| B05: malformed/skipped evidence | **Partial** | Required counters, arithmetic, duplicates and skipped/pass counts fixed; full report identity/case schema still absent: N01. |
| B06: evidence binding/policy | **Partial** | First-model parity digest, schema tags, native runner exclusions and some suite policy added; exact artifact/consumer/provider binding and multiple-model coverage missing: N02. |
| B07: compatibility and pins | **Partial** | Required lock keys and simple ID allowlists added; semantic version parsing and actual compatible tuples/pin contents not verified: N03. |
| B08: complete release closure | **Partial** | Named nested manifests and model notices checked; alternate model manifest rejected. Omitted/renamed closure, symlinks and launch metadata still escape checks: N04/N05. |
| B09: native signatures | **Partial, native execution unverified** | Added mode/header checks and codesign/spctl invocation. Qualification-state, architecture, identity and Mac artifact integration gaps remain: N02/N12. |
| B10: suite spelling disagreement | **Original defect fixed** | Assembly/verifier now share `mandatorySuitesForRoles`; Windows maps to `windows-native`, Mac to `mac-native`. Completeness of policy is N02. |
| B11: guessed package selection | **Partial** | Multiple packages now fail; staging excluded; target/name checked. No actual selection argument or full source/digest binding: N06. |
| B12: destructive rebuilding | **Partial** | Early staging failures preserve prior candidate; publish failure still deletes it, reproduced: N08. Package-entry containment is N07. |
| B13: model-cache validation | **Partial** | Unknown config, missing hash/revision and byte mismatch now rejected; symlink containment and immutable/approved selection incomplete: N09. |

Four original defect groups can be closed for their local implementation fix: **B01, B03, B04, B10**. The other nine must not be considered fully closed on the basis of the old mutation examples alone.

## Current defects and detailed remediation

### N01 — P0: correctly tagged but incomplete evidence still passes

- [x] Validate reports against canonical schemas requiring real case identities, provenance, configuration, measurements/explicit missing measurements and suite-specific fields.
- **Reproduced:** copy `test/fixtures/release/good`; replace `report-host-consumer.json` with the following; update its artifact byte count and SHA-256. `verifyRelease()` returns **`failures: []`**:

  ```json
  {
    "schema": "computer-use-host-report-v1",
    "cases": [{ "status": "pass" }],
    "aggregate": { "planned": 1, "executed": 1, "passed": 1, "failed": 0, "skipped": 0 },
    "qualification": { "missingEvidence": [] }
  }
  ```

- **Source:** `tooling/release/verify.ts`, `validateEvidenceReport()`, verifies counters/status and schema *names*. `caseId` is checked for duplicates only if it happens to be a string; it is not required. No report JSON Schema is applied.
- **Impact:** fabricated/minimal status rows without a consumer build, fixture, source, or configuration satisfy a required consumer suite. The earlier empty-counter defect is fixed, but the broader acceptance criterion is not.
- **Acceptance:** missing/empty/non-string case ID, missing fixture hash, absent consumer/source/configuration, inconsistent case outcomes or invalid suite fields fail with structured diagnostics. Independently validate reports emitted by the real harnesses; changing a schema tag alone cannot satisfy a suite.
- **Mapping:** previous B05; CU-PLUGIN-19/20/21; design §8.4–8.5.

### N02 — P0: evidence is still not bound to each release target/configuration

- [x] Bind reports to exact artifact digests, source commit, backend/model/processing identities, provider/hardware and pinned host/Hub builds; validate every model/provider, not just the first.
- **Reproduced:** keep a native report's accepted schema/configuration but change `run.sourceCommit` to another SHA, `run.runnerKind` to `not-a-native-runner`, and provider to `unmeasured`, with `producerOnly:true`. After rehashing the report, verification returns **no failures**.
- **Reproduced:** append a second model artifact/manifest with a different nonzero `parityReport.sha256`, correctly hash that manifest, and retain only the first model's parity evidence. Verification returns **no failures**. `verifyEvidenceBinding()` still uses `.find()` for the model and parity artifact.
- **Policy gaps:** `tooling/release/suites.ts` has no Hub suite; a model requires only parity, without independently requiring its host catalog/adapter/provider acceptance. The release schema and `VerificationReport` still have no explicit per-target candidate/unqualified/qualified state. A placeholder signing identity can bypass real native checks while the CLI returns the same general success message as other releases.
- **Impact:** a matching report label is mistaken for proof about these particular artifacts. Passing the current synthetic fixture is candidate-tooling validation, not evidence of production qualification.
- **Acceptance:** changing any bound source/artifact/configuration/provider/consumer identity fails; each model/provider has its own report; missing Hub/native/host requirements cannot be removed from caller-supplied lists; candidate validation and publication eligibility have distinct machine-readable outcomes. Do not require model evidence to qualify an accessibility-only Windows slice.
- **Mapping:** previous B06/B09; CU-PLUGIN-04/14/19/20/21; design §7.4–7.5, §8.5.

### N03 — P0: compatibility syntax checks do not establish supported tuples

- [x] Replace the approximate range regex with a tested semantic-version parser and validate complete consumer-supported tuples and pin contents.
- **Reproduced:** setting Windows `hostAppRange` to **`1..2`** passes. The valid hyphen range **`1.0.0 - 2.0.0`** fails. See `isSupportedSemverRange()` in `verify.ts`.
- **Reproduced:** the fp16 production model artifact passes with compatibility `{runtimeId:'grounding-model-gui-actor-2b-int4', adapterId:'synthetic-test-adapter', hostAppRange:'>=999.0.0'}`. Each ID is individually allowed, but no comparison to the actual model identity or supported host build is performed.
- **Source:** required role-specific lock keys now exist, but verifier hashes checkout lock bytes without checking that the pins are complete/approved or match the shipped model/backend. The good fixture still uses the checkout's unpinned/unfetched locks and passes as a candidate; it cannot establish production provenance.
- **Acceptance:** valid supported ranges parse; malformed/impossible/unsupported tuples fail; model runtime/architecture/quantization/processing must agree with its outer artifact and pinned consumer; production pin status/revisions and dependency digests match delivered content. Keep deliberate test-adapter candidates separate from supported production tuples.
- **Mapping:** previous B07; CU-PLUGIN-04/15/21; design §1.1–1.2, §7.4.

### N04 — P0: nested package verification can be omitted or bypassed

- [x] Select closure validation by an explicit artifact format/schema, require a nonempty valid manifest for packages, enumerate extracted files, reject duplicates/unlisted files, and enforce real-path containment.
- **Reproduced, each returning `failures: []`:**
  - Replace the Windows artifact with correctly hashed `package-manifest.json` containing `{"files":[]}` while shipping an unlisted `backend.py`.
  - Use correctly hashed `environment.json` containing a `files` entry for a nonexistent backend file. Validation is skipped because the filename does not end with `package-manifest.json`.
  - List `backend-link.py` with correct size/hash, where it is a symlink to an external temporary file. The verifier follows it and passes.
- **Reproduced:** a correctly hashed `package-manifest.json` containing JSON `null` throws `Cannot read properties of null (reading 'files')` instead of returning a structured failure. The CLI catches it at a higher boundary, but callers of `verifyRelease()` do not receive the promised report.
- **Source:** `verify.ts:409–415` gates nested verification by filename; `verifyPackageClosure()` accepts absent `files`, iterates only declared entries, and uses lexical traversal checks plus `stat()`/hashing without realpath containment.
- **Acceptance:** renamed/malformed/empty package records fail as appropriate; every extracted file is declared and every declaration resolves exactly once within the package; outside symlinks and unexpected native/platform/development files fail; malformed roots return structured diagnostics.
- **Mapping:** previous B08; CU-PLUGIN-13/18/21; design §7.4.

### N05 — P0: launch metadata remains unhashed, optional and loosely validated

- [x] Include launch profiles and notices in the verified closure, require profiles for applicable backend artifacts, and validate argv/cwd/environment against a canonical target-specific schema.
- **Reproduced:** modify the good fixture's launch profile `cwd` and set `envPolicy.telemetry:'enabled'` without changing the release manifest: verification still passes.
- **Reproduced:** remove `launchProfile` from the Windows artifact: verification passes. A profile with `{version:1, argv:['unreviewed-binary','-u','--label','aifetchly_windows']}` also passes; substring matching in the joined argv is not executable validation.
- **Source:** `validateLaunchProfile()` accepts an argv containing a managed-backend marker anywhere, allows transport-only profiles, and does not bind metadata bytes unless a separately validated package happens to cover them. General artifact notice references still need closure binding.
- **Impact:** the launcher can diverge from the reviewed executable/environment while the release is reported verified. New checks reject the previous bare `wrong-executable` example but not equivalent invalid profiles.
- **Acceptance:** changing a profile byte changes/invalidates its bound digest; missing applicable profile fails; only the exact reviewed executable/module, arguments, working-directory policy, disabled telemetry and permitted environment pass. Use separate Windows and Mac launch schemas.
- **Mapping:** previous B08; CU-PLUGIN-05/13/17/21; design §1.3, §4.2, §7.4.

### N06 — P1: assembly does not bind selected package bytes to source/pins

- [x] Add an explicit package path/digest option, verify all package bytes before returning success, and compare full package provenance with the source/lock identities being recorded.
- **Reproduced:** create one package directory whose suffix matches revision `aaaa…`, set current upstream lock to revision `bbbb…`, and change backend content to different same-length bytes while retaining its original manifest hash. `assembleRelease()` returns **`outcome:'ok'`**. It copies the stale package and records current lock digests.
- **Source:** `assemble.ts:100` compares only the directory suffix with the package's own revision. Its staging check covers the outer artifact sizes, not all copied file hashes. The later verifier can catch some named nested-file hash errors, but assembly has already returned success and the lock/revision mismatch is not established.
- **CLI gap — source-confirmed:** the README documents `--source-commit`, but `tooling/commands.ts:152–168` ignores it and uses `git rev-parse --short HEAD` without recording dirty changes. The error asks the user to select a package explicitly, but neither `AssembleInput` nor the CLI exposes package selection; users must remove other builds.
- **Acceptance:** explicit package/digest selection works with multiple builds present; corrupt files or wrong full revision/locks fail before output replacement; unsupported arguments fail rather than being silently ignored; source identity reflects the exact reviewed build, including an explicit dirty-tree policy.
- **Mapping:** previous B11; CU-PLUGIN-04/21/22; design §7.4, §9.2.

### N07 — P0: package entries can copy files outside release staging

- [x] Validate every package manifest entry and resolve source/destination containment before creating directories or copying; reject traversal, absolute paths, symlink escapes, duplicates and collisions.
- **Reproduced entirely inside a temporary project:** a package entry `../../outside-source.txt` is accepted. `assembleRelease()` reads `<temp-root>/outside-source.txt` and overwrites `<temp-root>/out/outside-source.txt`, outside `out/release-<version>.staging`, then returns **`ok`**.
- **Source:** `assemble.ts:149–154` directly joins `file.path` onto the package root and staging `package/` path and copies before any package-entry schema/containment validation. Validating the release version does not protect these separate paths.
- **Impact:** malformed package metadata can corrupt neighboring candidate/build files before release verification runs. This was demonstrated only with disposable markers, not user data.
- **Acceptance:** traversal/absolute/symlink paths are rejected before any outside read/write; all mutations occur beneath a unique staging directory; failed preflight leaves neighboring artifacts and previous candidates byte-identical.
- **Mapping:** previous B08/B11/B12 acceptance; CU-PLUGIN-13/21; design §7.4.

### N08 — P2: failed publication still destroys the previous candidate

- [x] Make replacement recoverable through the final publish operation, including ZIP generation; preserve the previous artifact on any failure.
- **Reproduced:** assemble a candidate and add an old-content marker. Inject an `EIO`-like exception from the final rename on a second assembly. The function returns `failed`, but **the previous final directory no longer exists**.
- **Source:** `assemble.ts:227–229` deletes final output then renames staging. The same sequence remains in `package.ts:320–322` and `archive.ts:150–151`. The archive also deletes its old ZIP before successfully generating/checking the new ZIP. Moving the delete later fixes early copy failures, not final publish failures.
- **Impact:** the documented “previous candidate preserved” and “atomic rebuild” guarantees remain false; concurrent readers can also observe no final artifact. This concerns local candidates, not an observed remote release overwrite.
- **Acceptance:** injected rename/ZIP-write/validation failures preserve the previous complete directory and archive; concurrent runs do not delete each other's staging; existing published identities are never silently overwritten. Test failure paths, not just successful stale-file removal.
- **Mapping:** previous B12; CU-PLUGIN-16/21; design §7.5.

### N09 — P1: model cache permits outside symlinks and floating/unapproved identity

- [x] Validate immutable revision and explicit model approval/licence eligibility, reject ambiguous duplicate model identities, and resolve cache paths using realpath containment.
- **Reproduced:** under an approved top-level lock, select a model with `revision:'main'`, `status:'not-qualified'`, `commercialUse:'unknown'`, and a hashed/sized `weights.bin` symlink to an external temporary file. `modelPrepare()` returns **`outcome:'ok'`, `present:1/1`**.
- **Source:** `resolveLockedModel()` requires a nonempty revision, rejects only explicit blocked values, chooses the first matching model, and checks lexical path strings. `verifyModelCache()` follows symlinks with `stat()` and hashing.
- **Impact:** config selection and file hashes are now useful, but preparation success still does not establish immutable approved source identity or a contained cache. “Not yet qualified” may be appropriate for approved spike preparation; it must not be confused with missing approval/licence evidence.
- **Acceptance:** reject floating revisions, unknown approval/licence state, duplicate model matches and outside symlinks; allow explicitly approved spike candidates without requiring prior production qualification; verify only the selected immutable closure.
- **Mapping:** previous B13; CU-INST-11, CU-PLUGIN-09/10/15; design §2.2, §6.6.

### N10 — P1: new server test uses an API unsupported for Windows pipes

- [x] Replace pipe polling with a Windows-compatible bounded reader (for example, reader thread plus queue/deadline), and test response flushing without `-u` or inherited `PYTHONUNBUFFERED`.
- **Source-confirmed platform regression, not executed on Windows:** `adapters/windows/tests/test_server.py:199,205` calls `select.select([proc.stdout], ...)` on a subprocess pipe. Python documents that Windows `select()` accepts sockets, not these file descriptors. This test is unconditionally run by `.github/workflows/windows-unit.yml`. [Python select documentation](https://docs.python.org/3/library/select.html#select.select)
- **Coverage weakness:** the test launches Python with `-u`, so it would pass on Linux even if the newly added explicit flush were removed. An independent probe without `-u` confirmed the current implementation itself is fixed.
- **Additional source issue:** `test_local_extension_off_windows_returns_typed_json_not_crash` assumes arbitrary PID 42 yields a successful integrity result on Windows. It should use a known owned process or mock and separately cover nonexistent/inaccessible targets.
- **Acceptance:** run the complete Python suite on actual Windows and Linux; persistent initialization/list/calls have deadlines and keep stdin open; removing explicit flushing causes the unbuffered-independent regression test to fail; no unit test assumes an unrelated OS PID exists.
- **Mapping:** previous B01/B02 test acceptance; CU-PLUGIN-16/17/20; design §8.5.

### N11 — P1: published MCP argument schemas are not enforced on dispatch

- [x] Validate JSON-RPC envelopes and tool arguments using the agreed protocol/schema rules before dispatch; add a real host-SDK initialization/lifecycle test.
- **Reproduced with mocked native reader:** send `jsonrpc:'garbage'`, `id:[]`, method `tools/call`, and arguments `{processId:42, unexpected:true}`. `handle_request()` invokes the native helper and returns a success response with the array ID. The published input schema declares `additionalProperties:false`.
- **Source:** `server.py:112` checks only object/method presence and selected argument types. The newly published schemas are discovery metadata, not validators. Calls can be accepted before initialization; upstream tool schemas remain generic while tools remain unwired.
- **Impact:** the advertised strict boundary disagrees with actual accepted requests. No native input bypass was demonstrated; current local tools are read-only and production upstream actions are still absent.
- **Acceptance:** malformed protocol version/ID/params and undeclared argument fields fail before native calls; initialization and version handling conform to the pinned host SDK; supported calls succeed; notifications still never receive replies; wire exact upstream schemas with T02.
- **Mapping:** previous B02; CU-PLUGIN-05/17/18; design §3.7–3.8, §4.2.

### N12 — P1: Mac artifact/launch verification remains inconsistent and incomplete

- [x] Verify the actual extracted helper and its architecture/signing identity using target-specific metadata; integrate that format with assembly and bounded native verification commands.
- **Source-confirmed, not run on macOS:** `assemble.ts` emits the package JSON as the `mac-native` artifact and supplies no `signingIdentity`; `verify.ts` expects that role's `location` to contain executable Mach-O bytes. A normal assembled Mac candidate therefore does not have the shape its verifier expects.
- **Source-confirmed:** `validateLaunchProfile()` requires Windows/Python marker arguments and unbuffered Python flags for every profile. The design's legitimate Mac `[helper, 'mcp']` launch does not satisfy that check.
- **Incomplete native verification:** `verifyMacSignature()` does not require successful `codesign -d` exit status, only checks a manifest team when a particular parenthesized string pattern matches, and has no subprocess timeout. Fat binaries bypass the thin ARM64 header check without inspecting their slices. Placeholder-string bypass still depends on text rather than explicit candidate state (N02).
- **Acceptance:** assemble/extract a real signed helper with the correct launch profile; reject Intel-only universal slices, wrong/missing expected team, failed display/verification, missing notarization evidence and hung verifier tools. A passing Mac producer report must be bound to the extracted helper digest and followed by signed-host/TCC acceptance.
- **Mapping:** previous B09/B08; CU-MAC-01, CU-PLUGIN-13/17/20/21; design §5.1, §7.4, §8.5.

## All PRD requirements: current implementation status

“Partial” includes producer code that still lacks required production artifacts or consumer evidence. The local contracts/default workflow are useful deliverables; this table does not count host-owned implementation as plugin code work.

| Requirement | Assessment | Remaining tasks |
| --- | --- | --- |
| CU-PLUGIN-01 | Canonical schema/fixture/type/archive producer exists; immutable accepted host handoff missing | T01, T09 |
| CU-PLUGIN-02 | Public authority boundary/allowlist exists; real upstream/native isolation not delivered | N11, T02, T03, T07 |
| CU-PLUGIN-03 | Portable lifecycle, geometry, point-only and second-adapter fixtures exist; actual consumer/model acceptance incomplete | T01, T04, T05 |
| CU-PLUGIN-04 | Partial compatibility verification; unsupported tuples/unrelated evidence still accepted | N02, N03, N06, T09 |
| CU-PLUGIN-05 | Unpinned upstream; no Windows-MCP dependencies or wired upstream tools | N05, N11, T02 |
| CU-PLUGIN-06 | Integrity/point/normalization helpers improved; real capture/UIA/CJK/ownership matrix not qualified | T02, T03, T06 |
| CU-PLUGIN-07 | Fake lifecycle simulations exist; production bounded input/cancellation/cleanup absent | T03 |
| CU-PLUGIN-08 | Measured Ghost-versus-Swift decision missing | T07 |
| CU-MAC-01 | No selected Swift source or signed/notarized managed helper | N12, T07, T09 |
| CU-MAC-03 | Conditional Ghost isolation still only policy/allowlist data | T07 |
| CU-INST-11 | Licence fields/blocking exist; actual immutable licence-chain evidence incomplete | N09, T04, T09 |
| CU-PLUGIN-09 | Pipeline implements only lock resolution, not real inference/export/parity | N09, T04 |
| CU-PLUGIN-10 | Model contract/helper foundation; no production file set/catalog delivery | T04, T09 |
| CU-PLUGIN-11 | 17 synthetic workbooks and eight smoke labels; required native/vision corpus incomplete | T06 |
| CU-PLUGIN-12 | Recorded scoring/synthetic compare exist; actual offline reference/ONNX replay absent | T05 |
| CU-PLUGIN-13 | Staging exists; distribution formats/verified managed extraction incomplete | N04–N08, N12, T02, T07, T09 |
| CU-PLUGIN-14 | No qualified immutable compatibility release/upgrade/consumer reports | N01–N06, T08, T09 |
| CU-PLUGIN-15 | Portable pins/separate Python projects exist; production backend/export/Swift toolchains unresolved | N03, N09, T02, T04, T07, T10 |
| CU-PLUGIN-16 | Node-only check passes locally; Windows test portability and failed rebuild reliability need correction | N08, N10, T10 |
| CU-PLUGIN-17 | Persistent flushing fixed; real readiness/atomic actions/disconnect/cancel/shutdown still incomplete | N11, T02, T03 |
| CU-PLUGIN-18 | Generated TypeScript/Python fixture checks exist; actual MCP validation, Swift and host decoder conformance incomplete | N11, T01, T07 |
| CU-PLUGIN-19 | Counter handling improved; complete report schema/provenance/measurements missing | N01, N02, T05 |
| CU-PLUGIN-20 | Portable jobs exist; native/model/consumer workflows are explicit failure stubs | N02, N10, T08 |
| CU-PLUGIN-21 | More hash/pin checks exist; closure, evidence binding and target verification still have false passes | N01–N09, N12, T09 |
| CU-PLUGIN-22 | Work-package documentation exists; checked tasks overstate acceptance and exact handoffs missing | N06, T09, T10 |

## Outstanding implementation work — previous T01–T10 retained

### T01 — P1: contract publication and actual consumer conformance

- [ ] Publish version/digest-identified contract fixtures and record the exact host decoder build accepting them, including supported previous-version compatibility and negative cases.
- [ ] Agree backend diagnostics/lifecycle/transport ceilings with the host. Add canonical report/package/launch schemas and validate actual serializers rather than relying on handwritten optional interfaces.
- [ ] Complete Swift encoding conformance when the helper exists. Preserve current Node/Python generated-type and schema tests.
- **Paths:** `contracts/`, `tooling/contracts/`, language encoder tests and external host consumer harness.
- **Exit:** reproducible archive digest plus producer/consumer reports; invalid versions/capabilities/geometry fail consistently. Design §3.7–3.8, P0-B.

### T02 — P1: actual Windows-MCP integration and managed artifact

- [ ] Select immutable upstream/fork/extension strategy, interpreter, source/patch and complete dependency pins; decide managed uv versus prebuilt Python with Hub.
- [ ] Add Windows-MCP dependencies and implement reviewed state/capture/display/focus/input/key handlers. `upstream.lock` remains `unpinned`, runtime dependencies remain empty, and upstream tools still return `TOOL_NOT_WIRED`.
- [ ] Implement persistent initialization/readiness/permissions/version diagnostics and handle/PID integrity lookup, disable telemetry, and prove denied tools cannot be invoked by name. Fix N05/N10/N11.
- [ ] Build a clean-machine launchable managed closure with notices and consumer-compatible launch metadata; source staging alone is insufficient.
- **Paths:** `adapters/windows/`, `tooling/commands/backends.ts`, `packaging/windows/` and Hub handoff fixtures.
- **Exit:** exact pinned artifact passes Windows unit/native checks and host/Hub provisioning/private-launch acceptance. Design §4, P0-C/P1.

### T03 — P1: atomic input, stop/cleanup and real native lifecycle

- [ ] Implement bounded typing/drag/keys with target/focus/freshness/ownership validation; no retargeting, hidden retries or repeated uncertain actions.
- [ ] Implement cancellation/disconnect/deadlines, held-button/key cleanup, owned-process termination, monotonic last-dispatch timestamps and host clock correlation.
- [ ] Add explicit `--allow-input` controlled-window tests for locked desktop, denied permission, moved/closed/reused/occluded/own/elevated targets and timeout before/after dispatch.
- **Evidence of gap:** `backendTest()` still reports native harness pending; fake state-machine tests do not execute these operations.
- **Paths:** Windows input integration, future Mac helper and native harnesses.
- **Exit:** independent native/host tests prove bounded shutdown, no repeated uncertain input and no input after stop acknowledgment. Design §3.8, §4.2, §8.3.

### T04 — P1: approved model preparation and real reference/export/parity

- [ ] Pin GUI-Actor-2B/base revisions, source hashes/licences, exact Python/export stack, opset, quantization, processing/calibration revisions and pixel budget; fix N09.
- [ ] Implement the explicit environment-sync/download preparation command described by design §2.2, or obtain an explicit specification revision. Current preparation verifies existing cache only.
- [ ] Implement actual reference inference; graph export/quantization/sharding/validation; stage parity; absence/ambiguity calibration; held-out and provider/hardware resource measurement.
- **Evidence of gap:** models lock remains `unfetched`; grounding dependencies remain empty; `reference/runner.py` only checks torch import; `IMPLEMENTED_STAGES` contains only `resolve_lock`, leaving seven stages unimplemented even with hardware/weights available.
- [ ] Produce graphs, tokenizer/configuration, health fixture, commercial notices and immutable per-file sizes/hashes/URLs within host limits. Keep GUI-Actor-3B blocked without licence clearance.
- **Paths:** `grounding/`, model manifest/file-set tooling, provider CI and host catalog/adapter handoff.
- **Exit:** real export and frozen-tolerance parity pass per claimed provider; actual host worker/catalog acceptance binds the exact file set. Design §6, P0-D/P2-A.

### T05 — P1: actual offline inference replay/comparison and complete reports

- [ ] Add Python reference/ONNX profiles that reprocess saved images with exact model/provider identities and never load desktop executors. Current compare explicitly runs synthetic profiles only.
- [ ] Preserve original image/crop/transform and processing identity; distinguish recorded scoring, actual inference replay and comparison. Treat cross-runner disagreement as a parity result.
- [ ] Add canonical run/case report schemas covering source, timestamps, split/revision, real asset hashes, exact configuration, stage timing, hardware/effective provider, memory and measurement method, counts and qualification bindings. Fix N01/N02.
- **Evidence of gap:** CLI still writes `sourceCommit: 'unknown (portable: git commit not recorded offline)'`; existing synthetic/recorded reports are not real model/resource evidence.
- **Paths:** `eval/`, `grounding/`, report contracts and `test/eval/`.
- **Exit:** actual replay/compare on identical immutable evidence produces independently validated reports; missing versions/assets/required cases cannot pass. Design §8.2, §8.4, P2-B.

### T06 — P1: complete W-1 screenshot/native/handoff matrix

- [ ] Retain the 17 synthetic workbooks and full-cell oracle; add missing actual Excel UIA/capture and native-state cases. Workbook splits exist (10 regression/3 calibration/4 held-out), but all eight vision smoke cases remain regression and do not constitute a held-out image corpus.
- [ ] Cover Microsoft 365 Current Channel and Excel 2021, English/Simplified Chinese, 20/200/500 rows, local/desktop-open cloud workbooks, 100%/150% scale, light/dark themes, full/collapsed ribbons, small/icon/repeated/absent controls and crops.
- [ ] Add protected/read-only/Protected View, edit/IME, sign-in/co-authoring, moved/closed/foreground/ownership/integrity variants, with reviewed provenance, asset hashes and complete missing-matrix accounting.
- [ ] Run independent all-cell output comparison and required accessibility-only, vision-only, combined and visual-planner benchmark arms with the host; report missing arms and baselines explicitly.
- **Paths:** `test/fixtures/w1/`, `eval/datasets/`, native/host benchmark harnesses.
- **Exit:** complete versioned matrix and zero post-run cell mismatches against the independent oracle. PRD §4–4.1, design §8.2–8.4.

### T07 — P1: evidence-based Mac selection and production helper

- [ ] Complete the time-boxed Ghost-versus-Swift comparison: AX/CJK, Retina/geometry, permission denial, cancellation/last-dispatch, signing trial, binary footprint and maintenance. Record the decision before Phase 3.
- [ ] Add selected source, exact Swift/Xcode/dependency/source/patch locks, real build and serializer/unit/native tests. Only README/lock/allowlist scaffolds currently exist.
- [ ] If Ghost wins, disable explicit/implicit sidecar, recipe/learning and unauthorized fallback paths, even with upstream assets installed. If in-house wins, document conditional Ghost requirements as not applicable and prove equivalent isolation.
- [ ] Build/sign/notarize the managed helper and validate extracted bytes, correct launch metadata, TCC attribution and signed updates with the host. Fix N12.
- **Paths:** `adapters/macos/`, `packaging/macos/`, Mac workflows and consumer fixtures.
- **Exit:** measured selection report, verified native artifact and signed-host conformance. Design §5, P0-E/P3.

### T08 — P1: executable native/provider/consumer qualification CI

- [ ] Replace the Windows/Mac/model/host-Hub workflows' deliberate UNQUALIFIED exits with actual suites on suitable controlled runners; retain prerequisite checks and explicit input opt-in.
- [ ] Run Windows packaging/launch and selected Swift build/tests, per-provider model/reference/parity/resources, and exact pinned consumer suites. Fix the Windows unit regression N10.
- [ ] Produce machine-readable target/artifact/runner reports; require changed-target qualification and allow evidence reuse only when relevant identities are unchanged. Missing/required skipped work remains unqualified.
- **Paths:** `.github/workflows/`, native/model/consumer harness integration.
- **Exit:** a real immutable candidate executes its required producer/consumer gates with complete evidence. Design §8.5.

### T09 — P1: complete immutable distribution and integration handoff

- [ ] Fix N01–N08/N12 and build separate common plugin ZIP, managed Windows environment/resources, native Mac archive and independent model file set.
- [ ] Supply actual Hub ingestion/target install-plan mapping; keep model/ONNX resources outside Hub delivery and developer toolchains outside customer packages.
- [ ] Version target-specific qualification state, complete source/toolchain/artifact/evidence tuples, immutable locations/digests, notices and upgrade compatibility diff.
- [ ] Run clean-machine install, repair/reinstall, upgrade, failed-candidate recovery, permission/signature continuity and previous-version availability with exact host/Hub builds. Host activation/rollback/session leases remain external responsibilities.
- **Paths:** `tooling/release/`, `packaging/`, workflows, compatibility/update and consumer handoff records.
- **Exit:** complete extracted closure verifies; matching consumers accept exact artifact versions/digests; only supported combinations receive qualified status. Design §7, §9, P4.

### T10 — P2: correct completion claims and finish reproducible work packages

- [ ] Update README and previous TODO status to distinguish the four verified local fixes, nine partially fixed groups and current N01–N12 tasks. Blanket “B01–B13 fixed,” “atomic rebuilds,” and “explicit package selection” claims are currently inaccurate.
- [ ] Correct documented unsupported/ignored CLI flags (N06), current test totals, and work-package statuses. The package script for `release:assemble` is now present; preserve this improvement.
- [ ] Finish exact production Windows/model/Swift pins and local toolchain verification; keep the independent Python environments and lightweight Node workflow.
- [ ] For each work package, record actual owned paths, command, source/configuration, positive/negative tests, output version/digest and acceptance report; distinguish missing implementation from hardware/consumer dependencies.
- **Paths:** `README.md`, `doc/work-packages.md`, audit/status documents and toolchain/command configuration.
- **Exit:** documentation refers to reproducible current evidence and does not close unfinished criteria. Design §1.2, §2.2, §9.1–9.2.

## Release scope and order

Phase 5 expansions—larger/verifier models, Windows ARM, Intel Mac, Linux desktop control, mixed-DPI/multi-display support and offline bundles—remain deferred and unqualified. Their absence is not an initial Windows-release defect; they need separate qualification before support claims.

1. Correct release/report/closure and staging containment defects N01–N07 before trusting release success.
2. Correct rebuild/cache/protocol/test defects N08–N11 and the Mac format/verification integration N12.
3. Complete Windows delivery T02/T03 independently of model work; complete T01 and model/evaluation/fixture work T04–T06.
4. Complete the Mac decision/helper T07, then execute target-specific CI and consumer handoff T08/T09.
5. Keep T10 status synchronized with actual acceptance results throughout.

Completion requires the relevant artifact and its passing acceptance evidence. Passing portable tests, adding a check for one earlier mutation, or acquiring native hardware is not sufficient to close the remaining implementation and release requirements.
