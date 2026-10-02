# Computer Use plugin — incomplete requirements and known errors

> **2026-09-30 review update:** errors E-1 through E-10 plus the §2.2 `check`
> conformance gap, the dangling upstream-lock `$schema`, and the wrong PRD
> phase citations were fixed by the `/review` run that followed this audit
> (see git history).
>
> **2026-10-02 follow-up update:** the Linux-completable remainder of this
> list was implemented — synthetic W-1 workbook corpus with an expected-value
> oracle and split coverage (CU-PLUGIN-11/19); grounding second-adapter
> fixtures, cross-field semantic bounds rules and a lifecycle harness
> (CU-PLUGIN-03); a backend lifecycle harness proving the §3.8 state machine
> and uncertain-never-retried (CU-PLUGIN-17, contract side of CU-PLUGIN-07);
> Python cross-language conformance over the same fixtures (CU-PLUGIN-18);
> backend:prepare/backend:test/model:prepare real implementations that fail
> closed on unpinned locks; four qualification workflow stubs that report
> UNQUALIFIED instead of skipping (CU-PLUGIN-20); executable work packages
> (CU-PLUGIN-22, doc/work-packages.md). What remains open needs Windows,
> approved weights + GPU, or a Mac — see the "Still environment-blocked"
> section at the end.

Audit date: 2026-09-29.

Compared against:

- `doc/computer-use-plugin-prd.md` (v1.5)
- `doc/computer-use-plugin-technical-design.md` (v1.5)

**Verdict: the PRD is not fully implemented.** The repository matches the Phase 0 foundation plan (`doc/plans/2026-09-27-phase0-foundation.md`): Node toolchain, versioned schemas, a smoke evaluation CLI, a release verifier, and fail-closed scaffolds for Windows, models, and macOS. Phases 0-C through 5 (pinned backends, qualified models, W-1 workbooks, Mac helper, release qualification) are not done. Several defects exist in the code that is already present. Nothing here is a qualified Windows, model, or Mac release.

Host-owned work (planner, supervisor, grants, ONNX worker, Hub install plans) is out of this repository by design. Those rows stay open until a consumer report exists; this repo cannot mark them done by itself.

---

## 1. Requirement status

| ID | Status | What exists | What is still required |
| --- | --- | --- | --- |
| CU-PLUGIN-01 | Partial | 12 JSON Schemas, positive/negative fixtures, generated `.d.ts`, `contracts:check` / `contracts:build` | Public-tool schema does not actually require the nine tools (see E-1). No host consumer suite has been run against a pinned archive. |
| CU-PLUGIN-02 | Partial | `action-v1` rejects raw coordinates (`additionalProperties: false`, handles only) | Public-tool document does not describe inputs/results and accepts a surface that omits a required tool (E-1). |
| CU-PLUGIN-03 | Partial | Grounding capabilities/request/result schemas; point-only fixture `contracts/fixtures/grounding/valid/result-point-only.json` | No second test-adapter conformance fixtures. Load/cancel/unload are described, not exercised by a lifecycle harness. Candidate points are not checked against declared image bounds. |
| CU-PLUGIN-04 | Partial | `tooling/release/verify.ts` checks hashes, platform role, non-commercial licence string, and required evidence suites on fixtures | No real release pins host app versions, backend revisions, or adapter identities. Verifier has closure and licence-chain holes (E-3, E-4). |
| CU-PLUGIN-05 | Not started | Allowlist JSON, unpinned `adapters/windows/upstream.lock`, entrypoint that exits 3 | Pin Windows-MCP, lock dependencies, disable shell/registry/filesystem/process/telemetry in a running stdio server, ship notices with the artifact. |
| CU-PLUGIN-06 | Scaffold only | Pure SID parser and mocked window-at-point | ctypes `OpenProcess` / `GetTokenInformation` / `WindowFromPoint` are not implemented (`integrity.py`, `window_at_point.py` always raise). Unknown high RIDs are guessed (E-6). No native geometry or CJK fixtures. |
| CU-PLUGIN-07 | Not started | — | No tests for long input, drag, timeout, held-key cleanup, monotonic dispatch timestamps, or “no hidden retry”. |
| CU-PLUGIN-08 | Not started | `adapters/macos/README.md`, unpinned Ghost lock, allowlist JSON | No Ghost-vs-in-house spike report (AX, CJK, geometry, signing, cancellation, size, maintenance). Decision is still open and must land before Phase 3. |
| CU-MAC-01 | Not started | Packaging shim `packaging/macos/build.sh` exits 3 while unpinned | No pinned source, Swift build, signed/notarized `darwin-arm64` helper, or Hub native-component metadata. |
| CU-MAC-03 | Scaffold only | Ghost allowlist denies `ghost_ground`, `ghost_parse_screen`, recipes, and `ghost_learn_*` | No fork/patch, so implicit vision fallback and recipe call paths are not actually removed. Deny-list alone does not prove those paths are dead. |
| CU-INST-11 | Partial | `models.lock.json` marks GUI-Actor-3B `commercialUse: blocked`. `manifest.py` and `verify.ts` reject `qwen-research-non-commercial` | Verifier accepts a manifest that records only one licence and omits the base model (E-4). No publication tooling over real weight files. |
| CU-PLUGIN-09 | Scaffold only | Decode, shard planner, manifest builder, numeric parity helper, tolerance JSON | No upstream pin, no ONNX export (`vision_encoder` / `decoder_prefill` / `pointer_head`), no opset record, no stage-by-stage parity on real tensors. `model:export` and `model:parity` always exit 3. Decode geometry is wrong (E-5). |
| CU-PLUGIN-10 | Not started | Model-manifest schema and one fp16 fixture | No file set, health fixture, immutable URLs, or hashes of real shards. |
| CU-PLUGIN-11 | Smoke only | `eval/datasets/w1-smoke/dataset.json` (8 regression cases, synthetic hashes, no images) | No `.xlsx` workbooks, no 20/200/500-row sets, no header/leading-zero/formula/protected-sheet matrix, no calibration or held-out split, no labeled screenshots. |
| CU-PLUGIN-12 | Partial | `eval/cli.ts` replay/compare; replay does not import a desktop backend | Replay identity check is incomplete (E-2). Compare uses the label to place points (E-2). Documented command `npm run eval -- replay --bundle <path> --runner <profile>` is rejected (E-2). |
| CU-PLUGIN-13 | Not started | `packaging/windows/build.ps1` and `packaging/macos/build.sh` refuse while unpinned | Even a pinned lock still exits 3 (`environment assembly pending`). No platform ZIP/tar, no executable-mode preservation, no signature check after extraction. |
| CU-PLUGIN-14 | Not started | Release-manifest schema and fixture verifier | No artifact manifest, parity/backend reports, upgrade notes, or AiFetchly/Hub consumer results. A plugin release must not be called qualified without that evidence. |
| CU-PLUGIN-15 | Partial | Node 22.19.0 in `.node-version`, npm 10.9.3, separate `adapters/windows` and `grounding` uv projects, `.python-version` files | Windows interpreter and upstream revision are `null`. Swift toolchain is not pinned. Customer package exclusion is untested because no customer package is built. |
| CU-PLUGIN-16 | Mostly done | `npm ci`, lint, `tsc`, Vitest, `contracts:check` on CI | `npm run check` does not itself run schema/fixture/declaration checks (design §2.2). CI adds `contracts:check` as a second step, so the published script and the design command differ. |
| CU-PLUGIN-17 | Not started | Action outcome enum includes `uncertain` | No contract cases for startup, readiness, disconnect, cancellation, or shutdown. No test that an uncertain action is never repeated. |
| CU-PLUGIN-18 | Partial | JSON Schema is canonical; TypeScript declarations are drift-checked for the nested paths | No Python or Swift encoder is run through the same fixtures. Stale duplicate `.d.ts` files are archived (E-7). |
| CU-PLUGIN-19 | Partial | `eval/report.ts` records pass/fail/skipped, fixture hash, and refuses an empty or skipped required set | Every smoke case is `regression`. No held-out suite. Compare numbers are not independent measurements (E-2). |
| CU-PLUGIN-20 | Partial | Workflows: portable Node matrix, Windows pytest, Mac lock consistency, model pytest, manual `release:verify` | Missing: Windows native, Mac packaged-native, full model qualification, host/Hub consumer. Mac workflow treats `status != "unpinned"` as failure (E-8), so a real pin cannot pass CI. |
| CU-PLUGIN-21 | Partial | Fixture manifests under `test/fixtures/release/` | Verifier path check is bypassable (E-3). Evidence `reportPath` is not contained. No production closure. |
| CU-PLUGIN-22 | Partial | Phase 0 plan lists paths and commands for P0-A/P0-B | P0-C, P0-D, P0-E, P1, P2, P3, P4 are not executable work packages with a completion report. Handoff checklist (§9.2) has no artifact digest for a consumer. |

### W-1 fixture matrix (PRD §4 and §4.1)

Not implemented. There are no workbooks and no observation fixtures for:

- empty template, populated sheet, reordered headers, unmatched field, duplicate header
- leading-zero phone/postal/ID, long ID, duplicate email, formula-like prefix
- full/collapsed ribbon, filter arrows, gallery swatches, repeated labels, hidden/absent control, at 100% and 150%, light and dark, English and Simplified Chinese
- window moved/closed, foreground change, own window at target, elevated/unknown integrity
- Protected View, read-only/protected sheet, IME composition, sign-in or co-authoring conflict
- 20-, 200-, and 500-row datasets, with a manifest that counts missing matrix cells

`w1-smoke` names a few of these targets (Name Box, sheet tab, filter arrow, icon, gallery, absent group, ambiguous label, Chinese header) as JSON regions only. Expected workbook cells after Text formatting do not exist. UI Automation observations for header, used range, active cell, selection, Name Box, formula bar, sheet tabs, and ribbon are not implemented (`normalize.py` only bounds a generic tree).

### Design §8.5 CI jobs still absent

- Windows native (interactive desktop, `--allow-input`)
- Mac packaged native (TCC, signing, notarization, no sidecar)
- Full model qualification per claimed provider
- Host/Hub consumer job
- Release job that checks real signatures, not only fixture JSON

### Design §2.2 commands that always exit 3

`backend:prepare`, `backend:test`, `model:prepare`, `model:export`, `model:parity`, `package:build`.

On the matching OS they still return `missingPrerequisites` (`tooling/commands.ts`). The message cites “PRD §7.1 P0-B” for backend and model commands. Those spikes are P0-C, P0-D, and P0-E. P0-B is the contract package, which is already present.

`adapters/windows/upstream.lock` sets `"$schema": "./upstream-lock.schema.json"`. That schema file does not exist.

---

## 2. Errors in the current code

### E-1. Public-tool schema does not enforce the nine-tool surface

File: `contracts/tools/public-tools-v1.schema.json`

The `allOf` clauses put JSON Schema `contains` on the root object. `contains` applies to arrays, so Ajv ignores it. `minItems`/`maxItems` of 9 only checks length.

Verified with Ajv 2020-12: a nine-entry list that drops `computer_verify` and repeats `computer_act` validates. The invalid fixture `contracts/fixtures/tools/invalid/public-tools-missing-tool.json` fails only because it has eight entries, so the test does not catch this.

`input` uses `propertyNames` constrained to the tool-name enum. A real act payload `{ "sessionId", "targetHandle" }` is rejected. The valid fixture omits `input` and `result`, so this never fails `contracts:check`. Design §3.1 requires per-tool input and result schemas. CU-PLUGIN-02 is not met by this document.

**Fix:** require each of the nine names once (`uniqueItems` plus a `contains`/`required` check on `tools`, not on the root). Replace `input`/`result` with real per-tool schemas (session id, target handle, no raw coordinates, no model-supplied approval). Add a negative fixture that has nine items but a missing or duplicated name, and a positive fixture whose `computer_act` input is a target handle.

### E-2. Replay can accept the wrong processing identity, and compare reads the answer

Files: `eval/cli.ts`, `eval/runner/runners.ts`

Design §2.2 replay is `npm run eval -- replay --bundle <path> --runner <profile>`. The handler returns `invalidArgs` unless `--dataset` is also set (`eval/cli.ts` around the `bundle`/`runner`/`dataset` check).

`recordedRunner` compares only `modelConfigurationId`. Adapter id/version and preprocessing, decoding, and calibration revisions are not compared. `evaluateCases` then labels the report with `profile.configuration`, so a bundle whose processing revision differs from the profile can still pass and be reported as the profile’s revision. Design §3.6 says a mismatched revision fails and is never substituted.

`syntheticRunner` reads `expected.region` and, on a hash hit, places the point at the region center. Compare-mode hit rate is therefore not an independent measurement. Absent cases false-accept on `second % 5 === 0` by construction. Reports are labeled synthetic, but the numbers still peek at the oracle.

**Fix:** make `--dataset` optional when the bundle lists case ids, or update the design command and README together and test the documented argv. Compare every configuration identity field and fail on mismatch. Stop using `expected` to choose the point; a stub may emit a fixed point and then be scored, but it must not read the label.

### E-3. Release closure check allows a sibling-path escape

File: `tooling/release/verify.ts`

Containment is `resolve(manifestDir, location).startsWith(manifestDir)`. For manifest dir `/tmp/release` and location `../release-evil/file.bin`, the resolved path is `/tmp/release-evil/file.bin`, and `startsWith("/tmp/release")` is true. The artifact is accepted as inside the release tree.

Evidence artifacts `continue` before that check. `reportPath` is `resolve`d and read with no containment test, so a report path can leave the release directory. Model `modelManifestPath` has the same gap.

**Fix:** reject locations that are absolute or whose `path.relative(manifestDir, abs)` starts with `..` or is absolute. Apply the same check to `reportPath`, `modelManifestPath`, and `noticesPath`. Add a fixture under `test/fixtures/release/`.

### E-4. Licence gate passes when the base-model licence is missing

File: `tooling/release/verify.ts`, `checkModelLicence`

Non-commercial is detected only if the string `qwen-research-non-commercial` appears. If `upstream.licence` is `mit` and `baseModel` is omitted, `licences.every(...) === undefined` is false, so the manifest passes. CU-INST-11 requires both the weight licence and the base-model licence. `grounding/src/aifetchly_grounding/export/manifest.py` does require both fields; the TypeScript release gate does not.

**Fix:** fail when `upstream.licence` or `upstream.baseModel.licence` is absent, not only when every licence field is missing. Add a release fixture with a MIT weight licence and no base model.

### E-5. GUI-Actor decode normalizes patch indices onto the image border

File: `grounding/src/aifetchly_grounding/reference/decode.py`

Centers use `weighted_index / activation_sum / (grid_size - 1)`. A 1×1 grid maps to `(0, 0)`, the corner, not the patch center. Edge patches land on the image border. Design §6.2 asks for activation-weighted centers in model-input image space, which is `(index + 0.5) / grid_size`.

The sort key is `(-mean_activation, patch_count)`. The comment says ties break on the top-left patch. `min_row` and `min_col` are computed and never used. `test_tie_ordering_is_deterministic` only checks that two runs match.

**Fix:** normalize with `(weighted_index / activation_sum + 0.5) / grid_size`. Break ties by `(min_row, min_col)`. Add a 1×1 test expecting `(0.5, 0.5)` and a tie test that asserts top-left order, then update `test_decode.py` expectations that divide by `n - 1`.

### E-6. Unknown integrity RIDs above System are reported as `system`

File: `adapters/windows/src/aifetchly_windows/integrity.py`

Standard levels match Windows (`0x1000` low, `0x2000` medium, `0x3000` high, `0x4000` system). Then `rid > 0x4000` returns `"system"`. Protected-process RID `0x5000` is therefore reported as system instead of a typed failure. CU-PLUGIN-06 says unknown or malformed data fails explicitly. Medium-plus `0x2100` already fails, which is the right behavior; the `>` branch should do the same.

**Fix:** raise `IntegrityError` for every RID outside the four supported levels. Add a test for `0x5000` and `0x2100`.

### E-7. Stale declaration copies are shipped in the contract archive

`tooling/contracts/generate-types.ts` writes `contracts/types/<family>/<name>.d.ts` and drift-checks only those paths. Eleven extra files remain, for example `contracts/types/action-v1.schema.d.ts` next to `contracts/types/desktop/action-v1.d.ts`. They are byte-identical today and are not part of the drift check.

`tooling/contracts/archive.ts` copies every file under `contracts/types/`, so `contracts:build` publishes both copies. A later edit to a stale file would ship without failing `contracts:check`.

**Fix:** delete the flat `contracts/types/*-v1.schema.d.ts` files (keep the family subdirectories). Make the archive, or the drift check, fail if `contracts/types` contains a `.d.ts` that generation did not just write.

### E-8. macOS CI fails when the lock becomes pinned

File: `.github/workflows/mac-unit.yml`

The job exits 1 unless `adapters/macos/ghost-os/upstream.lock` status is exactly `unpinned`. Pinning the helper, which P0-E requires, makes the only Mac workflow fail until the workflow is rewritten. A missing qualification must be reported as unqualified, not encoded as the success condition.

**Fix:** allow `pinned` and then run the Swift package tests; keep `unpinned` as an explicit non-qualifying result that does not fail unrelated contract PRs, and that does fail a Mac release job.

### E-9. Shard planner counts only `.data` pieces toward the 128-file cap

File: `grounding/src/aifetchly_grounding/export/shard.py`

`shard_count` counts data shards only. Design §6.4 limits the package to 128 files total, including ONNX graphs, tokenizer, preprocessor, health fixture, and notices. A plan of 128 shards plus those files exceeds the host ceiling and still returns success. `plan_shards` also shards a file that is already under 512 MiB into a `.data` piece; the graph file itself is not reserved in the count.

**Fix:** count every package file the planner knows about, and reject a plan whose total file count or total bytes exceeds §6.4. Add a test at the 128-file boundary that includes the non-shard files.

### E-10. Evaluation HTML report has a broken style tag

File: `eval/report.ts`, `renderHtmlReport`

The `<style>` block ends with `</code></style>`. The extra `</code>` is inside the stylesheet. The table body is fine; the header style is not valid CSS.

**Fix:** remove the stray `</code>`.

---

## 3. Work still required, in PRD order

Each item is unfinished relative to the PRD and technical design. Do not mark a phase complete from file presence. Phase acceptance is a report against an immutable candidate (design §9.1).

### P0-C — Windows pin and integrity prototype

- Choose the immutable Windows-MCP commit and the exact Python it requires. Fill `adapters/windows/upstream.lock` (`status: pinned`, revision, interpreter, dependency lock hash). Add the missing `upstream-lock.schema.json`.
- Decide extension module versus pinned fork. Register only the allowlisted tools on stdio MCP. Hidden tools must fail `tools/call` by name. Stdout stays protocol-only. Telemetry stays off.
- Implement `CtypesWinApi.open_process_token_integrity` and `CtypesWindowApi` (`WindowFromPoint` → `GetAncestor(GA_ROOT)` → `GetWindowThreadProcessId`). Apply E-6.
- `npm run backend:prepare -- --target win32-x64` syncs from `uv.lock` and does not launch MCP. `backend:test --suite unit` runs pytest. `--suite native --allow-input` errors when no controlled window is available.
- Spike report: reviewed tool list, lock digest, integrity/window-at-point cases (closed handle, inaccessible process, low/medium/high/system, own-window, unknown).

### P0-D — Default model export spike

- Pin GUI-Actor-2B revision and weight hashes in `grounding/models.lock.json`. Keep 3B blocked.
- `model:prepare` downloads only on explicit request. `model:export` fails if weights are absent and emits candidate files, not a qualified release.
- Export the three graphs (or a verified fusion), shard external data at ≤ 512 MiB, record opset, exporter, quantization, preprocessing constants (`patch 14`, `merge 2`, `pointer_pad_token_id` 151661).
- Apply E-5 and E-9. Parity compares `pixel_values`, `image_grid_thw`, position ids, image-token embeddings, pointer hidden state, attention scores, ranked regions, and final points against a frozen tolerance profile.
- Publish the spike report with provider, memory, and the failing stage if export is disqualified. A failed export does not block the Windows accessibility slice.

### P0-E — Mac backend decision

- Time-boxed Ghost fork versus `adapters/macos/swift-helper/` report covering the design §5.3 list.
- Record the winner before any Phase 3 claim. Apply E-8 so CI can accept the pin.
- If Ghost loses a safety gate (implicit vision, recipes, cancellation), that result cannot be offset by binary size.

### P1 — Windows backend release

- Lifecycle harness: `STOPPED → STARTING → INITIALIZED → READY → BUSY → STOPPING → STOPPED`, plus `UNAVAILABLE`. Disconnect during input returns `execution_uncertain` and does not retry.
- W-1 observations: header, used/visible range, active cell, selection, Name Box, formula bar, sheet tabs, ribbon controls, with depth and element caps.
- Fixture families in PRD §4.1, including 20/200/500-row synthetic workbooks, English and Simplified Chinese.
- Native tests: CJK and the six locales for input and non-English app names, scaling, moved/occluded windows, held-key/button cleanup, drag and typing cancellation, monotonic dispatch timestamps.
- `package:build --target win32-x64` emits either the Hub uv lock or the chosen embeddable-Python bundle, with no model-engineering dependencies. `packaging/windows/build.ps1` must call that command once the pin exists; today it always exits 3.

### P2-A — Qualified GUI-Actor file set

- Frozen configuration identity, health fixture, per-file hashes, `LICENSES/` (MIT, Apache-2.0, NOTICE), parity report hash.
- Provider evidence on the hardware that is claimed. A CPU run does not qualify DirectML.
- Host catalog and worker acceptance stays a consumer gate. This repo supplies the file set and the producer report.

### P2-B — Evaluation release

- Finish E-2.
- Dataset manifests with `regression`, `calibration`, and `held_out`. Do not move a failing held-out case into calibration under the same evaluation version.
- Replay and compare reports include the design §8.4 field groups, runner label, and a nonzero exit when a required case is skipped or the executed set is empty.
- Offline CLI tests must keep proving that no backend process starts.

### P3 — Selected Mac helper

- Production allowlist enforced in registration and dispatch, not only in JSON.
- Explicit and implicit vision paths disabled; recipes and learning unreachable, including when an upstream sidecar is installed.
- Geometry metadata: capture pixels, logical frame, scale/downsample, executor units. Cancellation timestamps good enough for the host stop gate.
- Sign, notarize, and verify after packaging. Development-signed binaries are not evidence of AiFetchly attribution.

### P4 — Release operations

- Finish E-3 and E-4.
- `release:verify` fails on wrong platform, bad hash, missing evidence, non-commercial licence, or unqualified native/GPU job. A skip is not a pass.
- Upgrade notes: schema diff, signing impact, whether the host adapter must change. Never replace bytes at a published identity.
- Clean-machine and upgrade matrix stays joint with AiFetchly and the Hub. Record the consumer build and the artifact digest on the handoff (design §9.2).

### P5 — Later gates (do not start as if they were in scope)

Larger models, verifier, multi-display control, offline bundles, Windows ARM, Intel Mac. Each needs its own licence, export, and host support. GUI-Actor-3B stays blocked until a commercial licence exists.

---

## 4. Suggested fix order

1. E-1, E-2, E-3, E-4, E-5, E-7, E-9, E-10 — defects in code that already claims to enforce a contract.
2. E-6 and E-8 — small, but they will mis-report integrity and block the Mac pin.
3. P0-C, P0-D, P0-E spike reports before any P1/P2/P3 artifact is called qualified.
4. P1 W-1 fixtures and Windows package, in parallel with P2 only after the model spike names a configuration worth exporting.

---

## 5. Still environment-blocked (accurate as of 2026-10-02)

These rows cannot move on a Linux workstation; they need Windows, approved
weights + provider GPU hardware, or a Mac:

- **P0-C**: pinning Windows-MCP, the ctypes `OpenProcess`/`GetTokenInformation`/
  `WindowFromPoint` bindings, `tools/call` allowlist enforcement in a running
  stdio server, the native spike report.
- **P0-D**: pinning GUI-Actor-2B weights (explicit ~4.45 GB fetch), the three-graph
  ONNX export, real-tensor stage parity, provider/memory measurements.
- **P0-E**: the Ghost-vs-in-house spike on a Mac (decision must precede Phase 3).
- **P1/P2-A/P3**: native qualification, qualified model file set, signed/notarized
  Mac helper, W-1 end-to-end with the host.
- Host/Hub consumer evidence for every qualified combination (CU-PLUGIN-14
  consumer side; producer gates exist and fail closed).
