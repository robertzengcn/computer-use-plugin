# PRD completion audit and actionable TODO — 2026-10-06

> **2026-10-06 fix update:** all portable defects **E01–E18 are fixed** in the
> commits after the reviewed one. Every reproduction probe from this audit was
> re-run against the fixed tree and now fails closed (archive
> extraction/staging, package enumeration/digest sensitivity, stripped and
> malformed evidence, model reference closure, symlink containment, launch
> profile validation, replay identity, AX/W-1 bounds, descendant deadlines,
> manifest identities, eval provenance, public observe state, CI triggers,
> docs). The M01–M10 work streams below remain open where they need Windows
> hardware, approved weights + provider GPUs, a Mac, or pinned host/Hub
> consumer builds — plus their genuinely new implementation work (real MCP
> server, reference inference/export/parity, signed helper) as written.

Reviewed commit: `268dbafa07564a9dcaee91e9d3af87bb6a438587`.

Requirements: [plugin PRD v1.5](computer-use-plugin-prd.md) and [technical design v1.5](computer-use-plugin-technical-design.md).

**Result: the requirements are not complete.** The repository has a working portable foundation, schemas, synthetic fixtures and testable helper functions. It does not yet deliver an operational Windows backend, production grounding model, selected Mac helper, or qualified host/Hub compatibility release. There are also confirmed defects in portable code; hardware availability is not the only remaining obstacle.

This document records **18 current defect/correction tasks (E01–E18)** and **10 implementation/handoff work streams (M01–M10)**. All PRD requirement IDs are mapped below. Checkboxes remain open until their acceptance conditions pass against an identified artifact. An older audit's completion banner is not evidence of completion.

## Scope and verification

Reviewed the two specifications, contracts and generators, CLI commands, release verification, packaging, Windows helpers, model helpers, evaluation, fixtures, CI workflows and work-package documentation. Reproductions used temporary copies and synthetic data. Runtime code was not changed. No desktop input or model-weight download was performed.

This is a source/portable execution audit, not native qualification or a claim to have found every possible bug. Windows/Excel, signed macOS, provider/GPU, and external host/Hub behavior were not exercised. External host implementation requirements are dependencies, not requests to implement a second host in this repository.

| Check run | Result |
| --- | --- |
| Toolchain | Node `22.19.0`, npm `10.9.3`, matching repository pins |
| `npm run check` | PASS: build, ESLint, TypeScript, **153 tests / 16 files**; conformance **15 schemas, 40 valid and 33 invalid fixtures** |
| In `adapters/windows`: `uv run --locked pytest -q` | **80 passed, 2 skipped**; the skipped native cases are not qualification |
| In `adapters/windows`: `uv run --locked ruff check src tests` | PASS |
| In `grounding`: `uv run --locked pytest -q` | **72 passed** |
| In `grounding`: `uv run --locked ruff check src tests` | PASS |
| In `adapters/windows`: `uv build --wheel --out-dir /tmp/computer-use-audit-wheels` | PASS; inspecting/extracting the wheel confirms packaged lock/allowlist resources; isolated entrypoint returns typed exit 3 for the unpinned backend |
| Contract archive builds in temporary copies | Build returns success, but extracted registry fails to load; unlisted stale content also survives rebuilding (E01/E02) |
| Release mutation probes using copies of `test/fixtures/release/good` | Confirmed false passes listed in E04–E08 |
| Replay/package/process/normalization probes | Confirmed E03, E09–E15 |
| Native Windows/Mac, actual export/parity/providers, host/Hub integration | NOT RUN / no qualified artifact inferred |

The green release fixture uses placeholder artifacts. Its passing result is useful for testing the verifier but is not a real release. Several mutations of that fixture also pass when they must fail.

Priority: **P0** = false qualification/integrity blocker; **P1** = required functionality or correctness before the affected release; **P2** = documentation/workflow correction. Priority numbers are unrelated to rollout phase numbers. “Reproduced” means executed locally; “source-confirmed” means demonstrated by the inspected implementation without claiming native execution.

## Requirement-by-requirement status

“Partial” includes useful implementation but unmet acceptance criteria. “Missing” means the central deliverable is absent. “Local” does not imply a consumer-qualified release.

| Requirement | Current assessment | Outstanding tasks |
| --- | --- | --- |
| CU-PLUGIN-01 — versioned schemas/fixtures | Partial: canonical registry, fixtures and generated declarations exist; archive omits required registered schemas | E01, E02, E16; M01 |
| CU-PLUGIN-02 — host authority boundary | Local public action payloads now reject coordinates/approval fields; real backend discovery/dispatch isolation is not implemented | M01, M02, M07 |
| CU-PLUGIN-03 — swappable grounding contract | Partial: request/result/capabilities/lifecycle, geometry rules, point-only and second-adapter fixtures exist | E01, E09; M01, M04, M08 |
| CU-PLUGIN-04 — compatible release identities | Partial: hashes/schema checks exist, but compatibility and evidence identity checks remain insufficient | E04–E08; M09 |
| CU-PLUGIN-05 — pinned Windows-MCP | Missing operational deliverable: upstream unpinned, dependencies empty, entrypoint cannot register/start MCP | E03, E10; M02 |
| CU-PLUGIN-06 — native facts/geometry/CJK | Partial: ctypes integrity/window-at-point and AX/W-1 helpers exist; normalization has defects and live integration is absent | E11, E12; M02, M03, M06 |
| CU-PLUGIN-07 — bounded/stoppable actions | Partial portable simulations; no production bounded action implementation or native cleanup evidence | E13; M03 |
| CU-PLUGIN-08 — Mac comparison | Missing decision report and measured Ghost-versus-Swift comparison | M07 |
| CU-MAC-01 — managed native helper | Missing selected implementation, build, signing/notarization and extracted native artifact | E08, E10; M07, M08 |
| CU-MAC-03 — host-only visual lookup | Conditional implementation missing: deny-list data alone cannot disable explicit/implicit fallback in a helper | M07 |
| CU-INST-11 — commercial licence chain | Partial: base/fine-tune fields and non-commercial blocking exist; actual weights/provenance/notices are not release-qualified | E06, E07; M04, M09 |
| CU-PLUGIN-09 — reproducible ONNX export | Missing actual reference/export/parity pipeline; numerical helpers and manifest builder exist | E14; M04 |
| CU-PLUGIN-10 — separate model file sets | Missing production graphs/shards/tokenizers/health artifacts and immutable consumer-compatible delivery | E06; M04, M09 |
| CU-PLUGIN-11 — regression/held-out fixtures | Partial: 17 synthetic workbooks, eight smoke cases and transform fixtures; capture/native/handoff families incomplete | E12, E15; M06 |
| CU-PLUGIN-12 — locate-only/offline evaluation | Partial: recorded scoring/synthetic comparison are offline; genuine reference/ONNX replay absent and version validation defective | E09, E15; M05 |
| CU-PLUGIN-13 — target-specific packaging | Partial metadata/source staging; missing actual managed delivery, source digest coverage, native signature verification | E03, E08, E10; M02, M07, M09 |
| CU-PLUGIN-14 — reviewable consumer release | Missing complete immutable closure, upgrade report and pinned consumer acceptance | E04–E08; M08, M09 |
| CU-PLUGIN-15 — toolchain boundaries | Partial: Node/npm pins and separate Python locks/patch pins exist; uv/build/model/Swift toolchains not fully pinned | M10 |
| CU-PLUGIN-16 — lightweight default workflow | Local check/build passes without desktop or weights; artifact reproducibility/closure still has defects | E01, E02, E13; M10 |
| CU-PLUGIN-17 — lifecycle/failures | Partial: fake transport/lifecycle cases and typed unpinned exits; real persistent server/harness absent | E13; M02, M03 |
| CU-PLUGIN-18 — canonical cross-language contracts | Partial: TypeScript generation and Python schema tests exist; archive incomplete, real AX encoding broken, Swift/consumer validation absent | E01, E11, E14, E16; M01, M07 |
| CU-PLUGIN-19 — structured case reports | Partial: basic counts/labels/latencies exist; complete provenance/measurements/schema validation and evidence gates missing | E04, E05, E09, E15; M05 |
| CU-PLUGIN-20 — separate CI/native qualification | Partial: portable jobs run, qualification stubs explicitly fail; real target jobs and mandatory release-policy enforcement absent | E04, E17; M08 |
| CU-PLUGIN-21 — complete release closure | Partial: many direct-file checks work; archive/source/report/model references and target qualification can escape required checks | E01–E10; M09 |
| CU-PLUGIN-22 — reproducible work packages | Partial: ownership/dependencies/commands documented; some completion statements are inaccurate and real immutable handoff records absent | E18; M08–M10 |

## Confirmed defects and corrections

### E01 — P1: contract archive omits registered schemas and published semantic rules

- [ ] Build the archive from the complete registry/data closure, then validate the extracted archive independently of the source checkout.
- **Evidence — reproduced:** `tooling/contracts/archive.ts:55` includes only `desktop`, `tools`, `grounding`, `models`, `traces`, `fixtures`, `types`. It excludes `contracts/eval/`, `contracts/adapters/`, and `contracts/rules/`. The shipped `registry.json` references the omitted dataset and upstream-lock schemas. `loadContractRegistry(archiveDir)` fails with `missing schema file ... eval/dataset-manifest-v1.schema.json`. `rules/semantic-rules-v1.json` is also absent despite its published-data claim.
- **Impact:** a schema artifact built successfully from this checkout cannot be consumed as its own complete offline registry; consumers also miss cross-field geometry rules.
- **Acceptance:** extract to an otherwise empty directory; load every registry entry, compile every schema, validate every fixture and enforce the published rule inventory using only extracted data. Cover added schema directories automatically.
- **Requirements:** CU-PLUGIN-01/03/18/21; design §2.1, §3.7–3.8, §7.4.

### E02 — P0: contract archive rebuilding retains content outside its manifest

- [ ] Stage into a fresh directory and archive exactly the manifest's file closure plus the manifest itself.
- **Evidence — reproduced:** build an archive, write `stale-unlisted.txt` into its `archiveDir`, and build again. `tooling/contracts/archive.ts:52–100` never clears staging and zips every file found there. The stale file is in the second ZIP, absent from `manifest.files`, and the logical `digest` is unchanged. The separately computed ZIP hash covers the ZIP bytes, but does not make the incomplete logical closure correct.
- **Impact:** removed files or unrelated pre-existing files can be delivered without appearing in the advertised closure.
- **Acceptance:** added contamination and deleted source files cannot survive rebuilding; ZIP membership exactly equals the declared closure; repeated builds verify identical intended content. Also verify archive metadata reproducibility across supported platforms rather than inferring it from the logical digest.
- **Requirements:** CU-PLUGIN-16/21; design §7.4.

### E03 — P0: Windows package copies source without hashing or enumerating it

- [ ] Include every delivered backend file in `files`, role accounting, sizes and digest; exclude caches/bytecode and other non-deliverables explicitly.
- **Evidence — reproduced:** `tooling/commands/package.ts:142–147` copies the entire Windows `src` tree and discards `copyTree()`'s result. `included` is subsequently hashed at lines 165–175. In a temporary pinned checkout, the package contains source but its manifest has **zero `/src/` entries**. Changing `src/aifetchly_windows/__init__.py` and rebuilding leaves the package digest unchanged. The recursive copy also has no cache/bytecode filtering.
- **Impact:** two packages with different executable backend content share the same advertised closure digest.
- **Acceptance:** every delivered source/resource byte is covered; changing any delivered source changes the digest; an independent extraction scan finds neither unlisted files nor development caches.
- **Requirements:** CU-PLUGIN-13/15/21; design §7.2–7.4.

### E04 — P0: callers can omit mandatory release evidence or substitute unrelated suites

- [ ] Derive mandatory suites from artifact roles, targets and claimed qualification; bind each report to candidate hashes/configuration/provider and exact consumer builds.
- **Evidence — reproduced:** in a good-release copy, remove all evidence artifacts, set `requiredEvidence: []`, and remove `evidenceRequired` flags. `verifyRelease()` returns `failures: []` for a closure still containing Windows, Mac and model artifacts. The baseline itself requires only `parity`; it accepts a producer-only recorded evaluation as that suite while containing both native targets. `tooling/release/verify.ts` checks suite names and whether a caller-set flag conflicts with an empty list, not an independently required target policy.
- **Impact:** a release may verify without native, real model-parity or host/Hub results. Report names do not prove the report concerns this artifact.
- **Acceptance:** missing mandatory suites fail even when omitted from the manifest; synthetic/recorded scoring cannot satisfy real parity/native gates; wrong source/configuration/provider/candidate/consumer identities fail. Preserve separate candidate and target-qualified states.
- **Requirements:** CU-PLUGIN-04/14/19/20/21; design §7.5, §8.5.

### E05 — P0: evidence report content is not schema-validated and may not be hashed

- [ ] Validate report types, required fields, per-case outcomes and aggregate consistency before evaluating a gate; hash the report actually read.
- **Evidence — reproduced:** replace the parity report with `{"aggregate":{"executed":"garbage","failed":-1,"skipped":-1},"qualification":{"missingEvidence":[]}}`, update its declared size/hash, and verification returns no failures. JSON `null` instead throws an uncaught `Cannot read properties of null (reading 'aggregate')` from `verifyRelease()`. There is no report schema validation at `tooling/release/verify.ts:207–230`.
- **Additional reproduction:** retain the hashed `location` but change `reportPath` to a different local JSON file containing only `aggregate.executed: 1` and an empty missing-evidence array. It passes. Lines 188–202 hash `location` and read `reportPath`; the latter's bytes need not appear in the hashed artifact closure.
- **Acceptance:** missing/noninteger/negative counters, impossible totals, empty/missing case lists, failed case versus passing aggregate, null/array reports, and modified alternate report paths fail with structured diagnostics. Required evidence must identify the exact hashed report bytes.
- **Requirements:** CU-PLUGIN-19/21; design §8.4–8.5.

### E06 — P0: model closure checks do not connect graph, health or parity declarations to files

- [ ] Verify every graph/external-data/tokenizer/health/notice/parity reference against the actual model package closure and its model-relative root.
- **Evidence — reproduced:** edit a copied model manifest so its graph is `missing.onnx`, health paths are `missing.png`/`missing.json`, and parity is `{sha256: "0" repeated 64, fixtureCount: 999, status: "candidate"}`; update the outer model artifact hash/size. Release verification still returns no failures. `verifyModelClosure()` walks `files` but does not connect `graphs`, `healthFixture` or `parityReport` to that list/evidence. `maxShardBytes` is declared but not enforced there.
- **Source-confirmed:** files are resolved against the release manifest directory, not the model manifest's directory. A normal `models/<configuration>/<version>/manifest.json` with package-relative files will be searched in the wrong root.
- **Acceptance:** missing referenced graph/data/health files, unknown or mismatched parity digest/count/status and shards over 512 MiB fail. A nested valid model package verifies from its own root. All shipped files, including notices, participate in the appropriate digest/size/count closure; graph I/O and external-data references are checked.
- **Requirements:** CU-INST-11, CU-PLUGIN-09/10/21; design §6.4, §7.4.

### E07 — P1: containment and compatibility validation remain incomplete

- [ ] Apply one real-path-aware containment check to all artifact/reference reads, and validate complete compatibility/pin identities against a supported consumer matrix.
- **Evidence — reproduced:** adding a `files` entry whose local path is a symlink to an external file, with the correct bytes/hash, passes release verification. `verifyModelClosure()` checks lexical containment only; notice paths have the same gap. In the evidence branch, `reportPath` is containment-checked but `artifact.location` is read/hashed without the corresponding check. Repository lock keys reject absolute paths but allow `..` traversal.
- **Compatibility reproduction:** set all compatibility objects to `{hostAppRange: ""}`, set archive version `v999`, set source commit `NOT-A-COMMIT`, and remove `lockDigests`. The copied release still verifies. `tooling/release/verify.ts:277–284` tests only the presence of one optional compatibility field; it does not establish a supported tuple. Changing a supplied lock digest is detected, but omitting required lock identities is not.
- **Acceptance:** symlink/traversal references fail before content reads; required pins cannot be omitted; archive version matches archive metadata; source identities and target-specific app/adapter/runtime/backend versions are validated against immutable consumer support evidence.
- **Requirements:** CU-PLUGIN-04/21; design §7.3–7.5.

### E08 — P1: release verification accepts invalid launch profiles and placeholder native files

- [ ] Parse/validate launch profiles and their executable/resource closure; verify native format, architecture, permissions, signature and notarization after extraction on a suitable runner.
- **Evidence — reproduced/source-confirmed:** changing the good fixture's `launch-profile.json` to the literal text `not json` still passes. Lines 263–275 only check path containment/existence. The good Mac helper is ASCII placeholder text and is accepted with a nonempty `signingIdentity`; lines 260–261 do not verify a signature. No real signed/notarized helper verification is implemented.
- **Impact:** a passing release check does not establish that a backend can launch or that the distributed Mac executable is authentic and usable.
- **Acceptance:** invalid/mismatched launch argv, absent executable, wrong architecture, removed execute bits, modified binary, wrong signing identity and missing notarization fail. Unsupported verification environments explicitly report unqualified.
- **Requirements:** CU-MAC-01, CU-PLUGIN-13/21; design §5.1, §7.4, §8.5.

### E09 — P0: replay accepts incompatible identities and unvalidated bundle content

- [ ] Validate trace manifest, records, annotations and runner profiles at load time; require and compare the complete replay identity before scoring.
- **Evidence — reproduced:** in a trace copy set `schemaVersion=999`, `contractVersions.grounding=999`, `modelManifestSha256` to a different hash and `executionProvider="made-up"`. The documented replay command still exits **0**, with zero failed cases. `eval/runner/runners.ts:184` casts JSON instead of validating it; `recordedRunner()` compares only six fields at lines 80–87. `eval/cli.ts` drops provider/runtime/manifest identities while constructing recorded steps, then labels the report from the profile.
- **Path reproduction:** replacing a grounding-record file with a symlink to a JSON file outside the bundle still allows replay exit 0. `insideBundle()` is lexical, splits only `/`, and does not resolve symlinks; Windows backslash traversal is also source-confirmed as unchecked by that helper.
- **Acceptance:** unsupported/missing versions, changed model manifest/provider/runtime/processing identity, invalid records/profiles/annotations, and escaping references fail before scoring. Reports preserve verified bundle identity and distinguish runner differences. Missing records produce named failed/skipped case evidence rather than an unstructured exception.
- **Requirements:** CU-PLUGIN-03/12/18/19; design §3.6, §8.4.

### E10 — P1: pinning metadata alone makes package assembly report success

- [ ] Require verified runnable target artifacts, validate source/dependency lock digests, and produce the actual selected delivery format before returning a package success result.
- **Evidence — reproduced:** copy current adapter files to a temporary repository and change only lock `status` to `pinned` and `selectedRevision` to a 40-character commit-shaped string. Both Windows and Mac `packageBuild()` return `ok`, although Windows has no registered backend/upstream dependency and Mac has no native executable. `MACOS.requiredPaths` is empty; the Windows check requires only `__init__.py` and `pyproject.toml`. The packaging path does not apply `backendPrepare()`'s full lock-shape/digest validation.
- **Acceptance:** missing/inconsistent source pins, dependency closure, launchable Windows wheel/environment or Mac helper prevent target package success. Separate metadata staging from a usable target artifact if both operations are needed. Keep common plugin, backend resources and model delivery separate.
- **Requirements:** CU-PLUGIN-05/13/21; design §2.2, §7.1–7.4.

### E11 — P1: AX normalization emits invalid child references and does not feed W-1

- [ ] Return the created node index, omit truncated references, and define/test a real normalized-tree-to-W-1 interface.
- **Evidence — reproduced:** `normalize_ax_tree({"role":"window","children":[{"role":"cell","row":0,"column":0,"name":"Name"}]})` produces root `children == (None,)`. The nested `visit()` at `normalize.py:72` is annotated `-> int` but never returns `index` on its successful path. At `max_elements=1`, five children produce five `-1` references while sibling iteration continues beyond the output limit.
- **Source/interface evidence:** normalization returns a flat `NormalizedAxTree` with indexed children; `extract_w1_observation()` expects nested dictionaries with dictionary children. No conversion path connects them. Passing `dataclasses.asdict(normalized)` yields “no spreadsheet grid observed” instead of the cell. The W-1 module's claim to consume normalized shapes is therefore unsupported.
- **Acceptance:** every child index is an in-range integer; no `None`/`-1` references; traversal work/allocation stops at limits; one integration test runs a nontrivial AX tree through normalization and W-1 extraction and retains hierarchy, headers, values, focus and selection.
- **Requirements:** CU-PLUGIN-06/18; design §4.1–4.2.

### E12 — P1: W-1 metadata accepts invalid ranges and conflates inferred/verified facts

- [ ] Validate row/column/range types and bounds; represent observed versus authoritative ranges/headers explicitly; bound traversal allocations.
- **Evidence — reproduced:** a tree with `usedRange: [-3, 99999999]` and one cell at `row: true, column: false` is accepted, yielding that invalid used range. `w1.py:102` treats booleans as Python integers; lines 166–167 coerce arbitrary range values with `int()` and apply no bounds. With no authoritative header/range, lines 153–170 populate the same `headerRow`/`usedRange` fields from visible cells and put the distinction only in free-text notes.
- **Source-confirmed:** `_walk()` validates and queues every immediate child before its total-element limit can stop processing; very wide input can allocate beyond the intended bound. Normalization likewise iterates all siblings after its limit (E11).
- **Acceptance:** malformed/boolean/negative/oversized grid metadata yields typed errors; scrolled views cannot be mistaken for verified headers/used ranges; unavailable facts are explicit; deep/wide trees have demonstrable work/memory bounds.
- **Requirements:** CU-PLUGIN-06/07/11; PRD §4.1, design §4.2.

### E13 — P1: subprocess deadline cannot stop descendants after the parent exits

- [ ] Track the owned process group/tree through completion and enforce a bounded close even if the immediate child has exited.
- **Evidence — reproduced on Linux:** run a Node parent which spawns an unreferenced child inheriting stdout/stderr and then exits. Give the child a 1,200 ms timer. With `timeoutMs:100, killGraceMs:50`, `runProcess()` resolves after approximately **1,226 ms**, not near the deadline. `tooling/processes/run.ts:143–145` returns from `killTree()` once the parent has an exit/signal code, although descendants still hold the pipes and delay the `close` event. A persistent descendant can make the deadline ineffective indefinitely.
- **Acceptance:** both timeout and cancellation terminate or detach/close the owned descendant resources within a tested bound when the parent exits early. Add equivalent Windows process-tree coverage; no unrelated process may be terminated.
- **Requirements:** CU-PLUGIN-16/17; design §1.3. This is the developer subprocess runner, not proof of host stop behavior.

### E14 — P1: model manifest builder cannot represent changed processing identities correctly

- [ ] Make adapter, architecture, contract, export, preprocessing, decoding and calibration identities explicit validated inputs; keep processing identity separate from preprocessing parameters.
- **Evidence — reproduced:** supplying `preprocessingRevision="prep-v2"` in `ManifestInputs.preprocessing` makes `build_manifest()` set the new identity but also copy that field into `preprocessing`; canonical validation rejects it as an additional property. Without this field the identity silently defaults to `prep-v1`. `grounding/src/aifetchly_grounding/export/manifest.py` hardcodes `dec-v1`, `cal-v1`, architecture, adapter and pipeline identity and has no decoding/calibration revision inputs.
- **Impact:** a revised calibration/decoder cannot be faithfully identified; a preprocessing revision supplied through the only implemented override produces an invalid manifest.
- **Acceptance:** two processing/calibration revisions produce distinct, schema-valid identities, missing identities fail, and actual builder outputs are checked against the canonical schema for non-default configurations.
- **Requirements:** CU-PLUGIN-03/04/09/18; design §6.4–6.6.

### E15 — P1: evaluation does not verify fixture hashes or preserve report provenance

- [ ] Define what each content hash covers, verify the referenced bytes, preserve consent/split metadata, and emit a complete validated report record.
- **Evidence — source-confirmed:** `loadDataset()` validates shape but does not hash referenced files. `evaluateCases()` checks only whether `contentSha256` is defined and copies it into the report. `annotationsSource()` in `eval/cli.ts` assigns every annotation `consentClass: synthetic` and `split: regression` instead of preserving provenance. The report omits required run ID/source commit/fixture-manifest hash, coordinate-space/transforms, stage timings, hardware/provider/tool versions and measured memory/method; expected/actual geometry is encoded in display strings. `compare` computes reports but does not call the file-writing path used by replay.
- **Impact:** reports cannot independently establish identical evidence, trustworthy dataset splits or reproducible resource/accuracy results. Declared hashes alone do not prove the underlying fixture bytes.
- **Acceptance:** tampered fixture bytes with unchanged declared hashes fail; reviewed evidence is not relabeled synthetic; missing provenance remains unknown/unqualified; schema validates full reports and arithmetic; both modes can save JSON/HTML with exact identities and explicit unavailable measurements.
- **Requirements:** CU-PLUGIN-11/12/19; design §8.4.

### E16 — P1: public observation result cannot carry the required structured state

- [ ] Complete public-tool results against the design's actual host-facing semantics, while preserving the strict authority boundary.
- **Evidence — source-confirmed:** `contracts/tools/public-tools-v1.schema.json`, `$defs.observeTool.properties.result`, allows only `observationId` and `metadata`, with `additionalProperties:false`. It cannot return the structured `state`/AX/window data required by design §3.1 and defined in `desktop/observation-v1.schema.json`. `computer_capabilities` also points directly at private desktop capabilities; audit and add the required public grounder/planner state instead of assuming these two surfaces are identical.
- **Acceptance:** consumer fixtures exercise real observe state and public capability responses; valid state is representable; raw coordinates/approval/grant fields remain rejected for actions. Coordinate contract-version changes with consumers.
- **Requirements:** CU-PLUGIN-01/02/18; design §3.1–3.2.

### E17 — P1: CI filters and checks miss affected cross-language/artifact changes

- [ ] Trigger Python/Swift consumer checks on canonical contract/fixture changes and test the extracted contract artifact in portable CI.
- **Evidence — source-confirmed:** `windows-unit.yml` and `model-smoke.yml` trigger only for their adapter/grounding directories and their own workflow. Their Python conformance tests consume `contracts/`, so a contract-only PR does not run those consumers. `portable-checks.yml` does not trigger on `.node-version`/`.npmrc` changes and does not run archive extraction/registry validation. `mac-unit.yml` prints a notice and succeeds for a pinned helper without a Swift build/test.
- **Acceptance:** dependency-affecting contract/toolchain/packaging changes run all appropriate portable/package consumers; archive tests detect E01/E02; a selected/pinned Mac implementation cannot report unit success without actual build/tests. Native jobs remain explicit and separate.
- **Requirements:** CU-PLUGIN-18/20; design §8.5.

### E18 — P2: completion documentation overstates current implementation

- [ ] Update README and work-package status; reconcile previous audit completion claims with this audit's independently verified results.
- **Evidence:** README still says 12 schemas / 47 fixtures, 35 Windows tests and 28 grounding tests. Current checks report 15 / 73, 80 passed + 2 skipped, and 72 passed respectively. `doc/2026-10-03-implementation-TODO.md` has an October 4 banner saying all B01–B22 portable defects are fixed and remaining milestone work requires hardware/consumers. Current E01–E18 show portable unfinished work, including the surviving archive bug. `doc/work-packages.md` labels the portable foundation complete and describes `model:prepare` as explicit fetch + cache verification; implementation explicitly never downloads or synchronizes that environment.
- **Acceptance:** documentation distinguishes implemented portable behavior, remaining portable defects, missing code, missing hardware evidence and external consumer dependencies. Commands and completion claims match observed behavior. Preserve historical audit content as history and link the current status clearly.
- **Requirements:** CU-PLUGIN-16/22; design §2.2, §9.1–9.2.

## Remaining implementation and handoff work

### M01 — Complete and release the contracts (P0-B)

- [ ] Fix E01/E02/E09/E16 and publish a complete, immutable schema/fixture archive with exact version and ZIP digest.
- [ ] Validate actual Python encoders against the same shared fixtures/semantic rules; validate Swift encoders once selected. Include incompatible versions, unsafe numbers, unknown required capabilities, lifecycle cancellation/unload, stale identities and both grounding adapters.
- [ ] Define a compatibility/version-evolution procedure and test a pinned previous consumer where compatibility is claimed; do not silently replace published v1 bytes.
- [ ] Obtain AiFetchly consumer conformance against the exact artifact and record any incompatible public/private shape changes.
- **Owner/paths:** plugin `contracts/`, `tooling/contracts/`, language encoders; external AiFetchly consumer.
- **Done when:** isolated archive validation and producer/consumer conformance pass on a named immutable candidate. JSON Schema/fixtures remain data, not dynamically loaded executable adapters.

### M02 — Select, implement and package the Windows backend (P0-C/P1)

- [ ] Select immutable Windows-MCP revision, exact supported interpreter, extension/fork strategy and managed-uv versus prebuilt delivery; fill and validate source/patch/dependency pins.
- [ ] Implement reviewed tool registration and dispatch on one persistent stdio MCP server. Current `entrypoint.py` returns exit 3 even after a valid pin; `pyproject.toml` has no runtime dependencies.
- [ ] Wire scoped accessibility, capture, focus, input, keys, integrity/window-at-point and W-1 observations to live native calls. Enforce allowlist in discovery and calls; verify excluded shell/registry/filesystem/process/telemetry paths are unreachable.
- [ ] Complete observation metadata: window/process ownership, display/capture coordinates, foreground/focus, freshness and typed permission/locked/target-gone errors. Fix E11/E12 and prove CJK/IME/scale behavior on Windows.
- [ ] Build the selected managed delivery closure, including immutable compatible wheels/interpreter/resources, required notices and verified launch profile. Generate the Hub-specific lock/metadata rather than shipping raw `uv.lock` as an assumed Hub plan. No customer source builds or global tools.
- **Owner/paths:** plugin `adapters/windows/`, `packaging/windows/`, package tooling; Hub install-plan consumer.
- **Done when:** clean extraction/provisioning launches the pinned backend, reviewed primitives work on Windows 10/11 x64, and host accessibility W-1 acceptance names the exact artifact.

### M03 — Implement and qualify native lifecycle/stop behavior (P1, later P3)

- [ ] Implement initialize/readiness/capability negotiation, incompatible-version rejection, bounded requests, disconnect, cancellation and shutdown on the real server.
- [ ] Bound long text, drag and held key/button behavior, serialize atomic calls, and expose monotonic dispatch timestamps and cleanup evidence. Do not retry uncertain actions, retarget by title or hide multi-step workflows in an atomic call.
- [ ] Replace the current native-test probe/failure stub with a controlled-window harness requiring `--allow-input`, exact candidate identity and environmental preflight.
- [ ] Exercise timeout before/after dispatch, connection loss, permission revocation, target movement/closure, foreground changes and host termination. Combine producer cleanup evidence with host no-input-after-stop evidence.
- **Owner/paths:** plugin native backend/harness and lifecycle fixtures; host owns grants/lease/hotkey/termination policy.
- **Done when:** actual native reports cover stop/cancellation/uncertainty and held-input cleanup for every claimed input-capable target; fake transport tests are supplemental evidence only.

### M04 — Implement reference, ONNX export and independently qualified model packages (P0-D/P2-A)

- [ ] Pin GUI-Actor-2B/base-model revisions and files/hashes, licence texts/notices, separate model Python/export stack, opset and configuration. Current model lock is `unfetched` and model-engineering dependencies are empty.
- [ ] Implement the documented `model:prepare` environment synchronization/explicit approved download workflow, or agree and document a changed interface with an actual reproducible separate fetch command. Current implementation only checks the cache, treats config as a label and verifies all model entries together.
- [ ] Implement actual prompt/tokenization/preprocessing, one-pass reference inference and golden tensors for every required stage. Current reference runner only checks whether `torch` imports.
- [ ] Implement graph export, external-data writing/sharding, quantization and graph validation. `IMPLEMENTED_STAGES` in `export/pipeline.py` contains only `resolve_lock`; seven stages are explicitly unimplemented. Planning shards is not writing valid ONNX external data.
- [ ] Execute parity against actual reference and ONNX outputs at every stage using a frozen justified tolerance profile and minimum fixture count; implement absent/ambiguous calibration separately from held-out evaluation.
- [ ] Measure CPU and every claimed DML/CoreML configuration on matching hardware, including effective provider/fallback, cold/warm timing and peak RAM/VRAM. Keep fp16 and quantized configurations independently qualified.
- [ ] Produce actual graph/data/tokenizer/configuration/health/licence files, complete identities (E14), size/hash/URL manifests and parity reports; implement checks from E06.
- **Owner/paths:** plugin `grounding/`, model artifacts/evidence; host owns production ONNX adapter/catalog/worker.
- **Done when:** every required stage executes real work and passes for the exact configuration/provider; a consumer-tested immutable model file set is available separately from plugin/backend packages. 3B stays blocked absent documented licence clearance; larger models/verifiers are later tiers.

### M05 — Complete real offline evaluation and reproducible reporting (P2-B)

- [ ] Add bounded Python reference and ONNX runner profiles with exact compatible identities; retain clear labels for recorded rescoring and deterministic synthetic stubs.
- [ ] Reprocess saved images with the intended configuration. Current replay only rescores stored candidate points; compare only hashes IDs into synthetic points and synthetic latencies.
- [ ] Fix E09/E15; apply declared crop/resize transforms to score in original capture pixels, preserve typed failures, required skip reasons and denominator accounting.
- [ ] Add report schemas, source/configuration/dataset/fixture hashes, hardware/provider/tool versions, stage timing and memory measurements; export JSON/HTML for each comparison arm.
- [ ] Implement producer comparisons for pixel budgets/quantizations/models and integrate host-owned accessibility-only, grounder-only, combined and planner-mode benchmark arms where required. Producer offline replay must never start a backend or send input.
- **Owner/paths:** plugin `eval/`, `grounding/` runner boundary and report contracts; host benchmark harness for integrated workflow arms.
- **Done when:** real offline inference produces independently scored, reproducible reports; missing identities/resources fail without substitution; producer-only results cannot be used as integrated/native acceptance.

### M06 — Complete W-1 and visual/native/handoff fixture coverage (PRD §4/§4.1)

- [ ] Keep the existing 17 workbook fixtures and full-cell oracle; add missing scenario coverage instead of treating the row/locale matrix alone as the complete PRD matrix.
- [ ] Add versioned labeled image evidence for Name Box, tabs, headers, filters, conditional-format menu items, gallery swatches, icon-only/full/collapsed ribbon, distractors/repeated labels and hidden/absent controls; cover 100%/150%, light/dark, English/Chinese and crop transforms.
- [ ] Add native-state and handoff cases: moved/closed/occluded windows, foreground change, own/elevated/unknown-integrity targets, Protected View, protected/read-only sheets, IME composition, sign-in and co-authoring conflicts.
- [ ] Preserve explicit provenance/consent, content hashes and split revisions. Review split independence: generated 20/200/500-row data-preservation workbooks reuse edge-case templates across regression/calibration/held-out; do not claim that scaling the same examples constitutes independent held-out model accuracy evidence.
- [ ] Record the complete scenario matrix and missing cells by scenario/locale/theme/scale/application, not just family/locale/row count. Workbook `locale` metadata does not qualify an actual Excel UI locale.
- [ ] Run independent full-cell comparison after actual host workflows across Microsoft 365/Excel 2021, both UI locales, local and desktop-open OneDrive/SharePoint files, up to 500 rows and 15 columns; any mismatch outside live sampling must fail.
- **Owner/paths:** plugin fixtures/oracle/evaluation; host owns planning, TSV/formula escaping, clipboard restoration, action authorization and UI workflow.
- **Done when:** fixture manifest lists all required families with no hidden omissions and integrated results identify exact Excel/OS/host/backend versions. Current fixture manifest explicitly says capture/native/handoff families remain pending.

### M07 — Select and deliver the Mac backend (P0-E/P3)

- [ ] Produce the time-boxed Ghost-versus-in-house Swift comparison: AX coverage, CJK, Retina/downsample mapping, permission denial/revocation, cancellation/timestamps, signing/notarization trial, size and maintenance cost; record winner before P3.
- [ ] Add the selected Swift source or pinned source/fork/patch set, exact toolchain/Xcode/dependencies and `Package.resolved`, build/unit tests and normalized contract encoders.
- [ ] Implement permission diagnostics and atomic bounded capture/input. For Ghost, disable registration and all internal explicit/implicit vision sidecar, recipe and learning paths, including AX failure with a locally installed upstream sidecar.
- [ ] Build/sign/notarize the actual Apple Silicon helper; create native-component package with notices/executable modes, verify extraction/update behavior and enforce E08/E10.
- [ ] Run native geometry/CJK/cancellation and signed AiFetchly permission-attribution tests; publish immutable Hub native-component metadata.
- **Owner/paths:** plugin `adapters/macos/`, `packaging/macos/`; host/Hub own launch, permissions UX and install resolution.
- **Done when:** measured selection exists and the chosen helper passes its exact signed-host/native artifact gates. No Swift source/helper exists in the current repository; a Ghost allowlist does not establish Ghost selection or isolation.

### M08 — Replace CI qualification stubs with executable evidence-producing jobs (P1–P4)

- [ ] Fix E17 and retain Linux/Windows/macOS Node checks plus isolated Python smoke suites.
- [ ] Implement actual Windows unit/package/extracted-launch tests, Mac Swift unit/package tests, controlled interactive Windows/Mac native jobs, and real model CPU/provider qualification jobs.
- [ ] Connect the selected candidate digest to job inputs/artifact retrieval, capability preflight, structured nonempty reports and retained evidence outputs. Unavailable capability remains unqualified.
- [ ] Wire pinned AiFetchly contract/runtime/native/W-1 and Hub plan/extraction suites. Current Windows/Mac/model qualification and host-hub consumer workflows explicitly exit 1; they do not run these suites.
- [ ] Make release-required target reports mandatory under E04 and prohibit reusing evidence when source/dependency/configuration/fixture/artifact identities differ.
- **Owner/paths:** plugin `.github/workflows/`, native/model/consumer harnesses; external owners provide controlled hardware and pinned consumer builds.
- **Done when:** affected target jobs execute real suites, produce bound evidence and gate promotion; ordinary CI cannot turn missing native/GPU evidence into a pass.

### M09 — Complete delivery, release verification and operational handoff (P4)

- [ ] Fix E01–E10 and implement a release-manifest assembler that records full artifact/lock/toolchain/compatibility closure, independent versions and exact digests.
- [ ] Produce distinct common plugin archive, selected Windows resources, Mac native package and model file set; map metadata to actual Hub/catalog consumer schemas. Verify no wrong-platform/native/model assets leak into common code ZIPs.
- [ ] Record candidate versus qualified state per target/configuration; make model licence provenance, real parity, native signatures and consumer results non-optional where required.
- [ ] Publish immutable artifact locations and notices, upgrade compatibility notes, supported-version matrix, permission/signing impact, and consumer handoff records with build IDs and failed/missing gates.
- [ ] Execute clean-machine, upgrade, repair/reinstall, failed-candidate recovery and prior-qualified-artifact availability tests with host/Hub. Host retains runtime installation/activation/leases/rollback ownership.
- **Done when:** every supported combination has complete producer and consumer evidence against exactly the bytes handed off; release verification can reject a deliberately corrupted or incomplete candidate. GA/SLO claims require joint measured acceptance.

### M10 — Finish toolchain/work-package reproducibility and scope accounting

- [ ] Pin and record uv, build dependencies (currently unconstrained `hatchling` in build-system requirements), export stack, selected Swift/Xcode and dependency/patch identities; retain separate Windows/model environments.
- [ ] Ensure CI uses the recorded tool versions. Python patch files are now `3.14.4`; workflow setup still asks to install the broad `3.14` series and does not record/pin uv through a version input. Verify the interpreter actually selected by sync against the intended pin.
- [ ] Correct E18 and give each remaining package an owner, dependency, real output, command and acceptance report; do not classify unimplemented portable stages as hardware-only blockers.
- [ ] Keep Phase 5 expansion backlog explicit: larger models/verifier, Windows ARM, Intel Mac, Linux desktop, mixed-DPI/multi-display and offline bundles remain future independently qualified capabilities, not initial-release regressions.
- **Done when:** clean development/build runs reproduce recorded tool identities and documentation names actual deliverables/limitations; no development model/Node toolchain becomes a customer backend dependency.

## Existing progress that should not be reopened wholesale

The earlier audits are useful history but several findings have been fixed. Current public action payloads are strict; lifecycle schemas and semantic-rule data exist in source; the export pipeline no longer marks unimplemented stages successful; parity rejects NaN/empty comparisons; the wheel now contains resources and fails with a typed unpinned error; Python lint passes; evaluation stubs are labeled; workbook coverage and full-cell expectations have expanded; several file/hash/digest checks now work.

These fixes deserve credit but do not prove the broader acceptance conditions. For example, the source rule document is present but absent from the archive (E01), source copying was added but omitted from package hashing (E03), and child indices were added to AX normalization but are populated with `None` (E11).

## Suggested execution order

1. Fix portable artifact/evidence correctness first: E01–E09, E11–E16. Add independent consumer/mutation tests that fail for the reproductions above.
2. Correct CI/status claims (E17/E18), finish contract handoff (M01), and resolve Windows/model/Mac decisions with named owners (M02/M04/M07).
3. Complete Windows accessibility backend and bounded native lifecycle (M02/M03), fixture/harness work (M06/M08), and actual packaging (E10/M09). Model work can proceed independently of the accessibility release.
4. Complete real reference/export/evaluation (M04/M05), then qualify exact provider configurations with host consumers.
5. Deliver the selected signed Mac helper and joint release/upgrade gates (M07–M10). Keep unsupported combinations explicitly unqualified.

The task is complete only when the mapped acceptance evidence exists, not when each listed source file or command name exists.
