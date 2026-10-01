# PRD / technical-design conformance audit — 2026-10-01

Compared against:

- `doc/computer-use-plugin-prd.md` (v1.5)
- `doc/computer-use-plugin-technical-design.md` (v1.5)

Audit commit: `bfb939b` (`fix: resolve all 10 audited contract-enforcement defects (E-1..E-10)`), branch `main`, clean worktree.
Supersedes `doc/TODO.md` (2026-09-29). See §7 for corrections to that document.

**Verdict: the PRD is still not implemented.** The repository matches its Phase 0
foundation plan (P0-A toolchain, P0-B contracts, plus scaffolds for P0-C/P0-D/P0-E
and P2-B/P4 groundwork). Phases 0-C through 5 remain unstarted. Every automated gate
in the repository is green, which means **the green result currently proves less than
it appears to** — 21 confirmed defects live in code that already claims to enforce a
contract. Nothing here is a qualified Windows, model, or Mac release.

---

## 1. Verification results (all reproduced 2026-10-01)

| Command | Result |
| --- | --- |
| `npm run check` (build + eslint + `tsc --noEmit` + vitest + `contracts:check`) | **pass** — 103 vitest tests, 11 files |
| `npm run contracts:check` | **pass** — 12 schemas, 29 valid + 20 invalid fixtures = 49 |
| `npm run contracts:build` | **pass** — 75 files → `out/computer-use-contracts-v1.zip` |
| `npm run eval -- replay --bundle test/fixtures/trace-bundle --runner recorded` | **pass**, exit 0 (documented §2.2 argv works without `--dataset`) |
| `npm run release:verify -- --manifest test/fixtures/release/good/release.json` | exit 0 |
| `release:verify` on all 6 negative fixtures (`missing-evidence`, `wrong-platform`, `bad-hash`, `noncommercial`, `missing-basemodel`, `path-escape`) | exit 1 for each — correct |
| `adapters/windows`: `uv run pytest -q` / `uv run ruff check .` | **37 passed** / clean |
| `grounding`: `uv run pytest -q` / `uv run ruff check .` | **30 passed** / clean |
| `model:parity --config x --dataset y` | exit 3, `--dataset` silently ignored |
| `backend:test --target win32-x64 --suite native --allow-input` | exit 3, `--suite`/`--allow-input` silently ignored |
| `eval replay … --bogus-flag 1` | **exit 0 — unknown flags accepted** |
| `package:build --target bogus-target` | exit 3 (should be exit 2, invalid argument) |

README status table is stale: it claims 47 conformance fixtures (actual 49), 35
Windows unit tests (actual 37) and 28 grounding tests (actual 30).

### 1.1 State of the previous audit's E-1..E-10 fixes

| ID | Claimed fix | Audit result |
| --- | --- | --- |
| E-1 | nine-tool surface enforced | **Landed and effective.** `minItems/maxItems:9` + array-level `contains` is pigeonhole-exact. Verified: dropping `computer_verify` and duplicating `computer_act` is rejected. **But the second half of E-1 (per-tool `input`/`result` schemas) was never done** — see D-1. |
| E-2 | replay identity + oracle + argv | **Landed.** Documented argv now works; 6 identity fields compared; synthetic runner no longer reads `expected`. Two residuals: D-2, D-3. |
| E-3 | path containment | **Landed for 4 of 5 fields.** `launchProfile` is unchecked — D-4. |
| E-4 | licence chain | **Landed.** Absent `upstream.licence` *or* `upstream.baseModel.licence` now fails; `qwen-research-non-commercial` still blocks. |
| E-5 | decode normalization + tie-break | **Landed and properly tested.** `(i+0.5)/grid_size` at `decode.py:110-116`; tie-break uses `min_row`/`min_col` at `decode.py:66`. `test_decode.py:28-32` asserts `(0.5,0.5)` for 1×1; `:64-72` asserts top-left ordering (absolute, not self-consistency). |
| E-6 | unknown RID must raise | **Landed.** `integrity.py:53-57` raises for any RID outside the 4 levels. Verified `0x2100`, `0x5000`, `0x6000`, `0x800` all raise. |
| E-7 | stale `.d.ts` | **Landed for `contracts:check`, NOT for `contracts:build`** — D-5. |
| E-8 | mac CI accepts a pinned lock | **Landed.** `mac-unit.yml:19-27` accepts `pinned` (exit 0), `unpinned` (exit 0), rejects unknown. But the `pinned` branch runs zero Swift work — §6 CI. |
| E-9 | shard 128-file cap | **Partially landed.** Whole files and shards are counted and boundary tests include non-shard files, but the `.onnx` graph itself is still uncounted — D-6. |
| E-10 | stray `</code>` | **Landed.** `eval/report.ts:203` ends `</style>`. |

---

## 2. Confirmed defects in code that claims to enforce a contract

Reproduced with the repository's own Ajv 2020-12 config (`tooling/contracts/registry.ts:52-58`)
or by direct execution. `ACCEPTED` means the invalid instance validated.

### D-1. `public-tools-v1` `input`/`result` are unconstrained objects — CU-PLUGIN-02 is not met

`contracts/tools/public-tools-v1.schema.json:52-59`

```json
"input":  { "type": "object" },
"result": { "type": "object" }
```

There is no `inputSchemaRef` / `resultSchemaRef` anywhere in `contracts/`. Verified:

| Instance | Result |
| --- | --- |
| `computer_act` input `{ "x": 944, "y": 331 }` (raw desktop coordinates) | **ACCEPTED** |
| `computer_act` input `{ "approved": true }` (model-supplied approval) | **ACCEPTED** |
| `computer_act` input with 5000 keys | **ACCEPTED** |

Design §3.1 requires per-tool input/result semantics; CU-PLUGIN-02 requires that schemas
"cannot mint grants or accept model-supplied approval" and that examples use target handles.
The `$comment` asserts coordinates are "structurally rejected by desktop/action-v1" — true,
and irrelevant: nothing requires `public-tools.input` to *be* `action-v1`.
`contracts/types/tools/public-tools-v1.d.ts` faithfully emits `input?: {}`.

**Fix:** add per-tool input/result schemas and bind them by `$ref`; add a negative fixture
for raw coordinates and one for a model-supplied approval field.

### D-2. Grounding candidates are not checked against their declared image bounds

Design §3.4.2: "Bounds must match the declared image dimensions."
`contracts/grounding/result-v1.schema.json` requires a per-candidate `imageDimensions`
and bounds `point`/`region` to `minimum: 0`, but nothing relates them.

| Instance (declared `imageDimensions` 960×1080) | Result |
| --- | --- |
| candidate `point.x = 9999` | **ACCEPTED** |
| candidate `point = {x:9999,y:9999}` | **ACCEPTED** |

Related: `grounding/request-v1.schema.json:37-48` does not bound `crop` against the
declared image — `crop {x:1800, y:1000, w:400, h:300}` on a 1920×1080 image (right edge
2200) is **ACCEPTED**, as is `crop {x:0,y:0,w:99999,h:1}`. The only negative fixture
(`request-negative-crop.json`) covers negative `x` alone.

**And the positive fixture is itself out of bounds.**
`contracts/fixtures/grounding/valid/result-point-only.json` declares
`imageDimensions {widthPx:960, heightPx:1080}` with candidate `point {x:1204.5, y:88}` —
x exceeds the declared width by 244.5. The fixture meant to demonstrate the CU-PLUGIN-03
point-only path encodes geometry the schema would reject if it enforced its own rule.

**Fix:** enforce `point/region` ≤ declared dimensions and `crop` within the image
(JSON Schema cannot express this directly — add a conformance-runner assertion, or move
to `dependentSchemas`/generated validation). Fix `result-point-only.json`.

### D-3. Replay identity check omits contract version and model manifest hash

`eval/runner/runners.ts:77-92` compares 6 fields but not `contractVersion` and not
`modelManifestSha256`, both of which design §3.6 lists in replay identity. The report is
also labelled with `profile.configuration` rather than the evidence's identity
(`runners.ts` → `evaluateCases`), so a report can be filed under a revision the evidence
does not carry.

**Fix:** compare the full §3.4.2 configuration identity; label the report from the bundle.

### D-4. `launchProfile` is not containment-checked and never read

`tooling/release/verify.ts` applies `insideRelease` to `location`, `reportPath`,
`noticesPath` and `modelManifestPath`, but **never to `launchProfile`**, although the
interface declares it (`verify.ts:35`) and the schema permits it.

```
launchProfile: "../../escape/launch-profile.json"  →  failures: []
```

The blessed `good` fixture that `release:verify` passes at exit 0 declares exactly such
an escaping path. §7.4 requires the clean verifier to check "launch-profile consistency";
nothing reads the field, so it cannot.

**Fix:** contain `launchProfile`; load it and verify the launch profile in the manifest
matches the shipped profile.

### D-5. `contracts:build` ships stale files and its digest does not cover the shipped bytes

E-7's drift check works, but `tooling/contracts/archive.ts:38-101` never prunes
`archiveDir`. Verified: a file present in run 1 and deleted from `contracts/` before
run 2 is **still in the shipped zip but absent from `manifest.files`** — so the closure
digest is computed over the freshly-copied list, not over the zip contents. Digest ≠
shipped bytes. `contracts:build` also never calls `checkDeclarationDrift`, so an orphan
`.d.ts` is detected by `contracts:check` and shipped by `contracts:build`.

**Fix:** prune `archiveDir` at start; run the drift check inside `buildContractArchive`;
compute the digest over the zip entry list.

### D-6. `plan_shards` under-counts split graphs by one file each

`grounding/src/aifetchly_grounding/export/shard.py:61-72` counts whole files (`:59`) and
shards (`:72`) against the 128-file cap (`:74-77`), with boundary tests at
`test_shard.py:42-59` that do include non-shard files. But for a graph that splits, only
the `.data.NNN` pieces are emitted and counted — the `vision_encoder.onnx` file itself is
never added.

```
planner accepted; files counted = 128
real package files per §6.4 layout = 129
```

Reproduced with 126 whole files + one `vision_encoder.onnx` of `MAX_SHARD_BYTES + 1`.
For the real fp16 package (two graphs over 512 MiB) this is a 2-file undercount.

**Fix:** reserve one file per split graph in `package_file_count`.

### D-7. Python `build_manifest` emits a manifest that fails the repo's own canonical schema

CU-PLUGIN-18 requires Python encoders to be checked against the same canonical fixtures.
Run `aifetchly_grounding.export.manifest.build_manifest` output through
`contracts/models/model-manifest-v1.schema.json`:

```
valid against contract schema? false
[{"missingProperty":"preprocessing"},{"missingProperty":"graphs"},
 {"missingProperty":"executionProviders"},{"missingProperty":"healthFixture"}]
```

`grounding/src/aifetchly_grounding/export/manifest.py:70-112` omits all four; no test
cross-checks it. §6.4 requires graph input/output names and supported execution providers —
neither is produced.

**Fix:** add a cross-language conformance test that runs the Python builder against the
JSON fixtures in `contracts/fixtures/models/`.

### D-8. Windows entrypoint raises an uncaught traceback (exit 1) in the layout it ships in

`adapters/windows/src/aifetchly_windows/entrypoint.py:17` resolves `PACKAGE_ROOT` as
`Path(__file__).resolve().parent.parent.parent` and `:26` reads `upstream.lock` from
there. But `pyproject.toml:18-19` packages only `src/aifetchly_windows`, so `upstream.lock`
and `tool-allowlist.json` are **not in the wheel**, while `launch-profile.json:4` launches
`["<managed-python>", "-m", "aifetchly_windows.entrypoint"]`.

```
simulated installed layout:
FileNotFoundError: [Errno 2] No such file or directory: '.../upstream.lock'
```

Uncaught (the `except` at `:50` does not cover `OSError`) → traceback on stderr and
**exit 1**, not the contractual exit 3 (`exit-codes.ts:12`, PRD §6.1). This is also a
minor information leak: an absolute filesystem path goes to the backend's reserved
diagnostic channel. Separately, `entrypoint.py:56` returns 3 **even when pinned**
("registration not yet implemented"), indistinguishable from the unpinned failure.

### D-9. Release verifier: evidence-file hashes, `noticesPath` existence and skipped suites are unchecked

`tooling/release/verify.ts:112` — evidence artifacts `continue` before the stat/hash block.

| Instance | Result |
| --- | --- |
| evidence artifact with `bytes: 999999`, `sha256: "0"*64` | **passes** |
| `noticesPath` naming a nonexistent file | **passes** |
| report with `aggregate: {skipped: 2, failed: 1}`, `qualification: {missingEvidence: []}` | **passes** |

The last row violates §7.5 and CU-PLUGIN-21 ("a skip is not a pass", "Nonzero status for
missing or skipped required evidence"). `:178-185` reads only `qualification.missingEvidence`.

Also: no target/platform applicability beyond role→platform — a `contracts` artifact
declaring `platform: "win32-x64"` passes, and one manifest containing both `windows-env`
and `mac-native` verifies clean (§7.5 requires target-specific qualification state).

### D-10. No signature or notarization verification anywhere

`verify.ts:141-143` requires only a non-empty `signingIdentity` string for `mac-native`.
The blessed `test/fixtures/release/good/helper-darwin` is the ASCII text
`mach-o-native-helper-spike-placeholder`. No `codesign` / `spctl` / `notarytool`
invocation exists in the repository. §7.4 requires the clean verifier to check
"signatures where applicable"; §8.5 requires "final native signatures/notarization".

### D-11. `trace-bundle/manifest.json` in this repo fails its own canonical schema

`test/fixtures/trace-bundle/manifest.json` puts a `caseId` property on every step;
`traces/trace-manifest-v1.schema.json:77` sets `additionalProperties: false`.

```
valid against trace-manifest-v1? false
  8× "/steps/N must NOT have additional properties"
```

Nothing catches it: `eval/runner/runners.ts:154` `JSON.parse`s the manifest and casts to a
handwritten `TraceBundleManifest` (`:124-140`) with `caseId?: string` — a hand-duplicate of
a schema that already has a generated `.d.ts` (§3.7 forbids this). A bundle with
`configuration` deleted crashes with `Cannot read properties of undefined` instead of a
typed failure. Trace path fields also accept traversal: `steps[].grounding = "../../../etc/passwd"`
is **ACCEPTED**.

### D-12. `w1-smoke` dataset fails its own `dataset-manifest-v1.schema.json`, which is unregistered

All 8 `contentSha256` values are 128 hex characters; the schema requires 64. The schema is
not in `contracts/registry.json`, so `contracts:check` never sees it, and
`eval/cli.ts:43-47` only checks `schemaVersion === 1`. Same for
`adapters/windows/upstream-lock.schema.json`: added by bfb939b, read by nothing, not
registered — and `adapters/macos/ghost-os/upstream.lock` would **fail** it (`"version": 1`
vs `additionalProperties: false`).

### D-13. `model_not_ready.readiness` is a free string, and its "valid" fixture holds a value that does not exist

`contracts/desktop/error-v1.schema.json:32-37` — `{"type":"string","minLength":1,"maxLength":64}`.
Design §3.3 requires the `GroundingReadiness` value; the AiFetchly design enumerates ten
(`unsupported_target | insufficient_memory | not_installed | runtime_required | model_required
| model_incompatible | installing | ready | update_available | repair_required`).

`"readiness": "totally_made_up"` → **ACCEPTED**.
`contracts/fixtures/desktop/valid/error-model-not-ready.json:7` uses `"downloading"`, which
is **not one of the ten**. The only fixture that passes for the wrong reason.

### D-14. `error-v1` `message` path-leak rule is trivially bypassable

`contracts/desktop/error-v1.schema.json:16` — `"not": { "pattern": "(^|\\s)(/|\\\\|[A-Za-z]:[\\\\/])" }`.
The leading `(^|\s)` means a path is only caught at string start or after whitespace:

| Message | Result |
| --- | --- |
| `"failed path=/etc/hosts"` | **ACCEPTED** |
| `"see file(/tmp/x)"` | **ACCEPTED** |
| `"Traceback (most recent call last):"` | **ACCEPTED** |
| `"argv: python -m foo"` | **ACCEPTED** |
| `"failed reading C:\Users\bob\f.xlsx"` | rejected |

§3.3 forbids tracebacks, secrets, image bytes, absolute paths *and argv*. Only the
absolute-path rule is even attempted, and it misses any path not preceded by whitespace.

### D-15. `desktop/capabilities-v1` cannot express an incompatible version; `key` vs `keys`

`contracts/desktop/capabilities-v1.schema.json:20` — `contractVersion: {minimum: 1}`.
Every other version-bearing contract pins exactly (`{"const": 1}`).

`contractVersion: 2` against the **v1** capabilities schema → **ACCEPTED**. CU-PLUGIN-04
and §3.7 "incompatible version" cases are unexpressible here.

`:27` — `supportedActions` enum is `["click","type","scroll","move","drag","keys","key"]`.
`key` is defined nowhere in `contracts/` and used by no fixture; `["click","key","keys"]`
→ **ACCEPTED**. Ambiguous authority-bearing enum.

### D-16. `model-manifest-v1` accepts path traversal and contradicts its own shard cap

| Instance | Result |
| --- | --- |
| `files[].path = "a/../../etc/passwd"` (pattern at `:135` permits `.` and `/`) | **ACCEPTED** |
| `healthFixture.imagePath = "/etc/passwd"` (`:174`, no pattern at all) | **ACCEPTED** |
| `licences[].noticePath` traversal (`:151`, no pattern) | **ACCEPTED** |
| `files[].bytes = 629145600` (600 MiB) against `limits.maxShardBytes = 536870912` (`:185`) | **ACCEPTED** |
| duplicate `files[]` entries / duplicate `graphs[].name` / duplicate trace `stepId` | **ACCEPTED** |

§3.7 explicitly requires rejecting "duplicate identities" and "invalid relative artifact
paths". `capabilities-v1` and `grounding/capabilities-v1` both set `uniqueItems: true`, so
the omission here is inconsistent rather than deliberate. The 512 MiB shard rule has no
fixture at all — `model-manifest-oversize-file.json` probes only the 1 GiB ceiling.

### D-17. Unbounded counts and magnitudes across the corpus

| Field | File | Issue |
| --- | --- | --- |
| `grounding/capabilities-v1.image.maxBytes` | `:61` | no maximum — `1e15` **ACCEPTED** (contrast `maxPixels` capped at 67108864) |
| `grounding/result-v1.scores[].value` | `:78` | unbounded — `value: -5` **ACCEPTED** |
| `grounding/result-v1.diagnostics.stageTimings` | `:177-181` | `additionalProperties` map with no `maxProperties` — 5000 keys **ACCEPTED** |
| `transforms-v1.dpi.scale` | `:43` | no maximum — `scale: 1e9` **ACCEPTED** |
| `transforms-v1` capture/window dimensions | `:23-24`, `:34-35` | no maximum (contrast `observation-v1` capped at 32768) |
| `plugin-manifest-v1.skills[]` | `:55-58` | no `maxItems` — 500 entries **ACCEPTED** |
| `plugin-manifest-v1.artifactDigest` | `:66-72` | optional; `status: "qualified"` with no digest **ACCEPTED** |
| `public-tools-v1.tools[].input/result` | `:52-59` | no `maxProperties` — 5000 keys **ACCEPTED** |

### D-18. `candidates: []` with no failure is accepted

`contracts/grounding/result-v1.schema.json` requires candidates *or* failure, but
`candidates` has `maxItems: 20` and no `minItems`. `{"candidates": []}` → **ACCEPTED**.
Design §3.4.2 requires a typed `target_not_found` for absence, and §8.2 makes "no click on
absence" a hard gate. An empty array with no code is the one shape that cannot be audited.

### D-19. HTML injection in `renderHtmlReport`

`eval/report.ts:197` escapes only `record.reason`. `caseId`, `split`, `datasetId` and the
configuration revisions are interpolated raw (`:190-197`). A `modelConfigurationId` of
`<img src=x onerror=alert(1)>` and a `caseId` of `<script>alert(2)</script>` both appear
unescaped in the HTML report. `renderHtmlReport` and `writeArtifacts` have **no test at
all** (`report.ts:194-223` uncovered; vitest thresholds are 80).

### D-20. Report schema omits most of design §8.4's field groups

`eval/report.ts:54-70`. Missing: `runId`, `sourceCommit`, start/end timestamps,
`contractVersion`, tool versions, pixel budget / quantization, effective provider, hardware,
per-case stage timings, coordinate space / transforms, optional memory measurement,
denominators, peak RAM/VRAM + measurement method, `requiredSuites` / targets,
`reportDigest`, compatibility candidate identity. `qualification` has only
`missingEvidence` and `producerOnly`.

### D-21. `eval/cli.ts:255-256` hardcodes provenance for the documented argv

The annotations fallback path stamps every case `consentClass: 'synthetic'`,
`split: 'regression'`, `taskDescription: ''` and drops `contentSha256` →
`fixtureHash: 'unversioned'` for all 8 cases. §8.4 forbids inferring the split;
CU-PLUGIN-19 requires a fixture hash per case. This affects the documented §2.2 command.

### D-22. Replay silently shrinks the case set

With `--bundle` and annotations covering 1 of 8 recorded steps: `planned 1, executed 1,
passed 1, missingEvidence []`, **exit 0**. Extra recorded steps are never counted, so a
partially-labelled bundle reports a full pass. The `skipped` / `no-result` branch in
`evaluateCases` is unreachable from the replay path.

### D-23. Argument validation gaps

| Command | Behaviour | Required |
| --- | --- | --- |
| any | `--bogus-flag 1` accepted silently (exit 0) | §2.2 exit `2` for invalid arguments |
| `package:build --target bogus-target` | exit 3 | exit 2 (`backend:*` validates; `package:build` does not) |
| `backend:test --suite native --allow-input` | `--suite`/`--allow-input` ignored, exit 3 | `--suite unit`/`native` must differ; `--allow-input` must gate |
| `model:parity --dataset y` | `--dataset` ignored | §2.2 documents `--config <id> --dataset <id>` |
| `release:verify --manifest` | `join(cwd, manifest)` mangles absolute paths (`commands.ts:156`); missing file → exit 1 | exit 2/3 |
| `release:verify` default `schemaPath` | `join(process.cwd(), ...)` → ENOENT when run from `test/` | CWD-independent |

### D-24. `manifestValidator` caches the first compiled schema process-wide

`tooling/release/verify.ts:50,55-60`. A second call with a different `schemaPath` silently
reuses the cached validator. Verified: after one strict call, a permissive
`{"type":"object"}` schema was ignored and strict validation still applied.

### D-25. `.gitignore` does not cover external-data shards or customer traces

`.gitignore:16-18` covers `*.onnx`, `*.onnx.data`, `*.safetensors`. But `shard.py:68` names
shards `vision_encoder.data.000`, which `*.onnx.data` does not match — **the shards are the
weights**. `traces/` is not ignored either, while `README.md:55` claims "customer traces
are never committed".

### D-26. CI supply chain is unpinned

`windows-unit.yml:16` and `model-smoke.yml:15` use `astral-sh/setup-uv@v5` with **no
`version:`** input, so each run installs the latest uv; no uv version is recorded anywhere.
`actions/checkout@v4` and `actions/setup-node@v4` are major-version tags, not SHAs.
CU-PLUGIN-15 requires "exact recorded versions/locks" for every toolchain.

### D-27. Python interpreter pins are minor floats, not exact interpreters

`adapters/windows/.python-version` = `3.14`, `grounding/.python-version` = `3.14`;
CI runs `uv python install 3.14`, resolving to whatever the newest 3.14.x is that day.
§1.2 requires "an exact tested interpreter for the selected immutable revision".
Internally consistent, but not a pin.

### D-28. No Swift toolchain pin exists

No `Package.swift`, `Package.resolved` or `.swift-version` anywhere. The only Swift
reference is the observational string `"swiftTools": "6.2"` inside an `unpinned` lock.
§5.1 requires the lock to record "Swift toolchain, and deployment target" as pins;
§1.2 requires "Exact Swift/Xcode build identity".

### D-29. CI path filters leak — some source changes trigger no job

`windows-unit.yml:7` and `mac-unit.yml:9` filter on `adapters/**` only, so a change to
`packaging/windows/build.ps1` or `packaging/macos/build.sh` triggers **no job**.
`model-smoke.yml:6` filters on `grounding/**` only, so a change to
`contracts/models/model-manifest-v1.schema.json` triggers no model job.
`portable-checks.yml:6` omits `doc/**`, `packaging/**`, `.gitignore`, `.npmrc` and the
other four workflow files.

### D-30. `noUncheckedIndexedAccess` bypassed by unchecked assertions

`eval/metrics/hits.ts:50,55,56` (`sorted[low] as number`), `eval/cli.ts:89`
(`datasetId as string`), `:184` (`selected as RunnerProfile[]`),
`tooling/release/verify.ts:57` (`as object`). `percentile` returns
`sorted[sorted.length - 1] as number` for `p === 100` *and* for `length === 1`,
conflating two cases. §1.2 requires `unknown` at external boundaries and no unchecked
casts on indexed access.

### D-31. Missing explicit return types (§1.2 policy)

Nine handlers in `tooling/commands.ts` (`:48, 66, 88, 104, 118, 126, 134, 142, 150`) and
`tooling/contracts/registry.ts:92` (`pathFor`) have no return annotation.
`tsc --noEmit` and `eslint .` both pass, so nothing catches it.

### D-32. Packaging scripts exit 3 on the pinned path too

`packaging/macos/build.sh:10-16` and `packaging/windows/build.ps1:15-23` read the lock and
branch correctly, then exit 3 unconditionally. The plan
(`doc/plans/2026-09-27-phase0-foundation.md:234`) specified "(2) **otherwise invoke**
`node dist/tooling/cli.js package:build --target ...`". `build.ps1:6-8` also declares
`param([string]$Version = "0.1.0")` which is never used.

### D-33. `test_entrypoint.py` writes into the source tree instead of a temp dir

`adapters/windows/tests/test_entrypoint.py:24-31` writes `_tmp-lock.json` next to itself
and unlinks in a `finally`. §2.1: "Tests use temporary directories." A crash or `-x` leaves
the file in the working tree, and it is not gitignored.

### D-34. `runProcess` is dead code

Nothing in `tooling/commands.ts` or `eval/` imports `tooling/processes/run.ts`. It is
exercised only by `test/tooling/processes.test.ts`. §1.3's bounded-subprocess contract is
therefore enforced by nothing in the real command path — including the model/backend
commands that §2.2 documents.

Secondary defects in that module: the `truncated` flag is shared between stdout and stderr
(`run.ts:103-121`), so a caller cannot tell which stream was clipped; and
`appendCapped` re-encodes each chunk with `chunk.toString('utf8')`, corrupting a multi-byte
character split across chunk boundaries into U+FFFD.

### D-35. `if` without `required` in conditional subschemas

`contracts/desktop/error-v1.schema.json:40-47` — the `unsupported_target` / `model_not_ready`
conditionals use `{"if": {"properties": {...}}}`. This works today only because `errorCode`
is in the root `required` (`:8`); the pattern is vacuous if that ever changes. The rest of
the corpus uses `required` inside conditions.

### D-36. `doc/TODO.md` is self-contradictory after bfb939b — see §7

---

## 3. Requirement status by CU-ID

Status legend: **Done** = requirement met by evidence in this repo · **Partial** = some
deliverable exists · **Scaffold** = placeholder only · **Not started**.

| ID | Status | What exists | Still required |
| --- | --- | --- | --- |
| CU-PLUGIN-01 | Partial | 12 schemas, 49 fixtures, generated `.d.ts`, `contracts:check`/`contracts:build` | Per-tool input/result schemas (D-1); no host consumer suite has run against a pinned archive; 2 schemas outside the registry (D-12) |
| CU-PLUGIN-02 | Partial | `action-v1` rejects raw coordinates | `public-tools-v1.input` accepts raw coordinates and model-supplied approval (D-1); no host consumer suite |
| CU-PLUGIN-03 | Partial | grounding capabilities/request/result schemas; point-only fixture | Candidates not bounds-checked (D-2); positive fixture out of bounds (D-2); `candidates: []` with no failure (D-18); no second test-adapter fixtures; load/cancel/unload not exercised by a lifecycle harness; `GroundingMetadata` (§3.2, 13 fields) appears in no schema |
| CU-PLUGIN-04 | Partial | release verifier checks hashes, role→platform, licences, evidence presence on fixtures | No real pins for host app versions / backend revisions / adapter identities; D-9 (evidence hashes, skipped suites), D-10 (signatures), D-15 (incompatible version) |
| CU-PLUGIN-05 | Not started | allowlist JSON, unpinned `upstream.lock`, entrypoint that exits 3 in-repo | Pin Windows-MCP + full dependency closure; a **running stdio MCP server** with an exact `tools/list` set and name-based rejection of hidden tools (§4.2 required case — no dispatch layer exists); disable and *verify* telemetry; notices with the artifact |
| CU-PLUGIN-06 | Scaffold only | pure SID parser (E-6 fixed); mocked window-at-point | `ctypes` `OpenProcess`/`GetTokenInformation` (`integrity.py:75-79` raises) and `WindowFromPoint`→`GetAncestor(GA_ROOT)`→`GetWindowThreadProcessId` (`window_at_point.py:42-52`, all raise) not implemented; no native geometry or CJK fixtures; D-8 entrypoint path bug |
| CU-PLUGIN-07 | Not started | `uncertain` in the outcome enum | No long-input, drag, timeout, held-key/button cleanup, monotonic dispatch timestamp, or "no hidden retry / no target reselection" tests. **No lifecycle harness** (`STOPPED→…→STOPPED`, `UNAVAILABLE`) |
| CU-PLUGIN-08 | Not started | `adapters/macos/README.md`, unpinned Ghost lock, allowlist JSON | No §5.3 spike report (AX coverage, CJK, geometry, signing, cancellation, size, maintenance). Decision open; must land before Phase 3 |
| CU-MAC-01 | Not started | packaging shim that exits 3 | No pinned source, Swift build, signed/notarized `darwin-arm64` helper, Hub native-component metadata. D-10: no signature verification anywhere |
| CU-MAC-03 | Scaffold only | allowlist JSON **matches §5.2 tool-for-tool** (7 observe / 8 input / 12 deny) | Deny-by-default is **data, never code** — the allowlist is loaded by one inline `node -e` in `mac-unit.yml` and by nothing else. No fork/patch, so implicit vision fallback and recipe paths are not removed |
| CU-INST-11 | Partial | `models.lock.json` records the full licence chain and blocks 3B; `manifest.py` and `verify.ts` reject non-commercial **and** absent base-model licence (E-4 fixed) | D-7: the Python builder emits a manifest that fails its own schema. No publication tooling over real weight files |
| CU-PLUGIN-09 | Scaffold only | decode, shard planner, manifest builder, parity helper, tolerances JSON naming all 8 §6.3 stages | No upstream pin; **no ONNX export of any of the three graphs**; no opset/exporter record; no stage-by-stage parity on real tensors; `model:export`/`model:parity` always exit 3. §6.2 steps 1–5 of the reference path **do not exist** — only step 6 (`decode.py`). `configs/*.json` is read by nothing |
| CU-PLUGIN-10 | Not started | model-manifest schema + one fp16 fixture | No file set, `health/`, `LICENSES/`, immutable URLs, or real shard hashes |
| CU-PLUGIN-11 | Smoke only | `w1-smoke/dataset.json`, 8 cases, **all `regression`**, no images | No `.xlsx` workbooks; no 20/200/500-row sets; no header / leading-zero / formula / protected matrix; no `calibration` or `held_out` split; no labeled screenshots; no consent/provenance (D-21); D-12 (dataset fails its own schema) |
| CU-PLUGIN-12 | Partial | replay/compare CLI; replay imports no backend; E-2 argv + identity + oracle fixes landed | D-3 (contract version + manifest hash), D-22 (silent case-set shrink). Invariance test is a **source-level regex** grep, not a runtime `child_process.spawn` stub, and its `net` alternative matches ordinary identifiers |
| CU-PLUGIN-13 | Not started | packaging shims | D-32: even a pinned lock exits 3. No platform ZIP/tar, executable-mode preservation, or post-extraction signature check |
| CU-PLUGIN-14 | Not started | release-manifest schema + fixture verifier | No artifact manifest, parity/backend reports, upgrade notes, or AiFetchly/Hub consumer results |
| CU-PLUGIN-15 | Partial | `.node-version` 22.19.0 exact; `packageManager` npm 10.9.3; two genuinely independent `uv.lock`s (different md5, each rooted at its own editable package); `tsconfig.json` exactly as specified | D-26 (unpinned uv + tag-pinned actions), D-27 (floating 3.14), D-28 (no Swift pin), D-25 (shards/traces not gitignored). Windows interpreter and upstream revision are `null` |
| CU-PLUGIN-16 | Mostly done | `npm ci && npm run check && npm run build && npm run contracts:check` all green; `check` now chains `contracts:check` (§2.2 gap closed) | D-5 (`contracts:build` ships stale files); no test that `contracts:build` refuses when `contracts:check` fails |
| CU-PLUGIN-17 | Not started | `uncertain` in the outcome enum | No contract cases for startup, readiness, disconnect, cancellation, shutdown. No test that an uncertain action is never repeated |
| CU-PLUGIN-18 | Partial | JSON Schema canonical; declarations drift-checked (`listOrphanDeclarations` works) | **No `.d.ts` under `contracts/types/` is imported by any file** — generation exists but the types are never consumed. D-7: no Python encoder is run through the same fixtures. D-12/D-11: two schemas unregistered, and this repo's own trace bundle fails its schema |
| CU-PLUGIN-19 | Partial | report records pass/fail/skipped, fixture hash, and refuses an empty executed set | D-20 (most §8.4 field groups missing), D-21 (hardcoded split/consent), D-22. Every case is `regression`; no held-out suite; no dataset-split field group |
| CU-PLUGIN-20 | Partial | 5 of 9 §8.5 jobs exist (see §6) | D-9 (skipped suite passes the gate), D-29 (path filters leak), D-26. No workflow marks an absent native/GPU run as *unqualified* |
| CU-PLUGIN-21 | Partial | fixture manifests + verifier; E-3 fixed for 4 of 5 fields | D-4 (`launchProfile`), D-5 (digest ≠ shipped bytes), D-9 (evidence hashes, skipped suites), D-10 (signatures), D-24 (schema cache). No production closure |
| CU-PLUGIN-22 | Partial | Phase 0 plan lists paths/commands for P0-A/P0-B | P0-C, P0-D, P0-E, P1, P2-A, P2-B, P3, P4 are **not executable work packages with a completion report**. §9.2 handoff checklist has no artifact digest for any consumer |

### 3.1 W-1 fixture matrix (PRD §4, §4.1) — not implemented

No workbooks and no observation fixtures exist for any of:

- empty template, populated sheet, reordered headers, unmatched field, duplicate header
- leading-zero phone/postal/ID, long ID, duplicate email, formula-like prefix
- full/collapsed ribbon, filter arrows, gallery swatches, repeated labels, hidden/absent control — at 100% and 150%, light and dark, English and Simplified Chinese
- window moved/closed, foreground change, own window at target, elevated/unknown integrity
- Protected View, read-only/protected sheet, IME composition, sign-in or co-authoring conflict
- 20-, 200-, 500-row datasets with a manifest counting missing matrix cells

`w1-smoke` names a few of these targets (Name Box, sheet tab, filter arrow, icon, gallery,
absent group, ambiguous label, Chinese header) as **JSON regions only**, with synthetic
hashes and no images. Expected workbook cells after Text formatting do not exist.

**UI Automation observations are entirely absent.** A grep for `W-1|Name Box|formula bar|
sheet tab|usedRange|activeCell|ribbon` across every `.py` file returns **no matches**.
`normalize.py` is a generic bounded tree walk (role/name/value/frame, `MAX_ELEMENTS=5000`,
`MAX_DEPTH=60`). No header row, used/visible range, row count, active cell, selection,
Name Box, formula bar, sheet tabs, or ribbon controls. §4.1's required case matrix is
therefore unimplementable against this code.

### 3.2 Grounding reference path (§6.2) — 5 of 6 steps absent

`reference/decode.py` implements **step 6 only** (postprocess on a `list[list[float]]`).
Steps 1–5 do not exist anywhere: no prompt builder, no
`<|im_start|>assistant<|recipient|>os\npyautogui.click(<|pointer_start|>…` assembly, no
vision encoder, no decoder prefill, no `pointer_pad_token_id` (151661) lookup, no pointer head.
`reference/runner.py` is 28 lines whose only body is a lazy `import torch`;
`MissingWeightsError` is declared at `:16-17` and **never raised**.

The three graphs are named in `configs/*.json` and in the valid manifest fixture (with full
per-graph input/output names) but are **never exported**. `configs/tolerances-v1.json` names
all 8 §6.3 stages and sets `frozen: true`, and is **read by nothing**; `decode.py:14-15`
hardcodes `DEFAULT_THRESHOLD_RATIO = 0.3`.

### 3.3 Design §3.2 records missing from every schema

- **`GroundingMetadata` (13 fields)** — no schema defines it. `modelManifestSha256`,
  `groundingContractVersion`, `adapterId`, `adapterVersion`, `preprocessingRevision`,
  `decodingRevision`, `calibrationRevision` appear in **neither** the grounding request nor
  the result contract. The host cannot verify from a grounding result alone that it is
  talking to the adapter/revisions it thinks it is. Largest single contract gap found.
- **`ResolvedTarget`** (`handle`, `observationId`, `source`, `expiresAt`, `evidenceSummary`)
  and `GroundingSource` (`accessibility|vision`) — appear only in the two design documents.
  No `computer_find` result schema exists.
- Trace manifest is missing §3.6's backend source/build identity, dispatch timestamp, and
  foreground window. Per-step files (`observation.json`, `grounding.json`, `action.json`,
  `verification.json`) have **no schemas at all** — only path strings.

### 3.4 Error-code fixture coverage (design §3.3, 22 codes)

Exercised by a fixture: `backend_unavailable`, `desktop_busy`, `execution_uncertain`,
`model_not_ready`, `target_ambiguous`, `target_not_found`, `unsupported_target` — **7 of 22**.
Never exercised: `ai_disabled`, `permission_required`, `unsupported_display_configuration`,
`runtime_not_ready`, `invalid_grounding_output`, `stale_observation`, `focus_changed`,
`action_not_authorized`, `action_cancelled`, `verification_failed`, `resource_limit`,
`protocol_mismatch`, `planner_mode_unavailable`, `stop_hotkey_unavailable`, `host_elevated`.

`unsupported_target.reason`: only `elevated_window` has a fixture; `own_window`,
`protected_view`, `unsupported_app`, `unsupported_display` have none. §4 requires own-window
and elevated as distinct native cases.

**CU-PLUGIN-18 explicitly requires an "incompatible version" negative fixture. There are
none** — all 20 invalid fixtures were checked and none varies a contract or schema version.
§8.3 names it again as a required contract-release case. D-15 shows the desktop capabilities
schema cannot express one.

### 3.5 Transform fixtures (design §3.5)

Present: Windows DPI 100/150, Retina points, anisotropic model resize, crop offset, crop
out-of-bounds, padding shift, mixed-scale mismatch, moved window (stale).
Gaps: `negative_display_origin_unsupported` is declared at
`contracts/fixtures/transforms/transforms-v1.schema.json:125` and used by **no fixture**
(negative origins appear only as a *valid* case in `tf-retina-points.json`);
`executorUnits: "desktop_logical_points"` with **no `dpi`** validates (the "assumed global
scale" §3.5 forbids) with no negative fixture; `test/contracts/transforms-oracle.test.ts:35`
reads only `valid/`, so the two `invalid/` fixtures have **no oracle coverage at all**.
Directory semantics are inconsistent: `valid/` mixes golden cases with semantic-rejection
cases (`tf-crop-out-of-bounds`, `tf-mixed-scale-mismatch`, `tf-stale-window-geometry`), while
`invalid/` holds schema-invalid cases.

---

## 4. Commands that always exit 3

`backend:prepare`, `backend:test`, `model:prepare`, `model:export`, `model:parity`,
`package:build`.

Fail-closed is correct (PRD §6.1) and the phase citations are now right
(`PRD §7.1 P0-C/P0-D/P0-E work packages`). But each also silently ignores documented argv —
see D-23.

**Exit code 4 (`cancelled`) has no producer.** `EXIT_CODES.cancelled = 4` and
`ProcessResult.outcome: 'cancelled'` exist, but no `CommandSpec` handler can return
`'cancelled'`, and `runProcess`'s timeout/abort outcome is never mapped into a `CliOutcome`.
§2.2 requires `4` for cancelled work.

**No required-skipped gate.** §2.2: "A required skipped test uses a nonzero result at the
gate even if optional cases were skipped successfully." `vitest run` exits 0 with skipped
tests and `vitest.config.ts` has no required-test list, so a `.skip`ped required suite
passes `npm run check`.

---

## 5. Security review

No hardcoded secrets (grep for `api_key|secret|token|password|PRIVATE KEY|AKIA|ghp_|sk-`
over all source → only `open_process_token_integrity`, `pointerPadTokenId`, tokenizer hits).
No network fetch at import or build time in TypeScript. No `shell: true` anywhere
(`spawn(executable, argv.slice(1), {shell: false, …})` at `tooling/processes/run.ts:85-90`
with `MODULE_PATTERN`/`PROJECT_PATTERN` validation at `:51-55`). No `execSync`.
`uv.lock` records sha256 for every wheel/sdist. `pyproject.toml` runtime `dependencies = []`.

Genuine findings are supply-chain and information-leak, not injection:

1. **D-26** — tag-pinned Actions + unpinned `uv`.
2. **D-8** — uncaught traceback on the customer-facing launch path emits an absolute
   filesystem path to the backend's reserved diagnostic channel.
3. **D-16** — the model manifest's path fields permit traversal and absolute paths; §3.7
   explicitly requires rejecting "invalid relative artifact paths".
4. **D-4** — `launchProfile` accepts an escaping path and is never read.
5. `.npmrc` sets `registry=https://registry.npmmirror.com`, a third-party mirror, for a
   first-party repository. Intentional here (the default registry is unreachable from this
   network), but worth an explicit decision.

---

## 6. Design §8.5 CI matrix — 5 of 9 jobs exist

| §8.5 job | Workflow | Verdict |
| --- | --- | --- |
| Portable checks (Linux+Win+macOS) | `portable-checks.yml` | **Present.** 3-OS matrix, `npm ci`, `check`, `build`, `contracts:check`, replay. Genuine |
| Windows unit/package | `windows-unit.yml` | **Partial.** pytest + ruff only. §8.5 also requires *serialization* tests, allowlist/closure/**launch-profile** checks, and packaging — none present |
| Windows native (interactive, `--allow-input`) | — | **MISSING** |
| Mac unit/package | `mac-unit.yml` | **Partial.** Lock-status report + inline allowlist overlap check. No Swift build, no Swift tests, no `Package.resolved`. The `pinned` branch runs zero work and prints a notice that Swift tests "must be added" |
| Mac packaged native | — | **MISSING** |
| Model smoke | `model-smoke.yml` | **Present.** `uv sync --locked` + pytest + ruff |
| Full model qualification (per provider/GPU) | — | **MISSING** |
| Host/Hub consumer | — | **MISSING** |
| Release verification | `release-verify.yml` | **Partial.** Real closure/hash/licence checks, `workflow_dispatch` only (correct), but no signature/notarization verification (D-10) and D-9 lets a skipped suite pass |

---

## 7. Corrections to `doc/TODO.md` (2026-09-29)

`doc/TODO.md` is now self-contradictory and must not be used as the audit of record.
Its 2026-09-30 banner says E-1..E-10 were fixed by `bfb939b`, but §2 was never updated.
Every one of these lines is now false:

| `doc/TODO.md` | Reality |
| --- | --- |
| `:31` "Unknown high RIDs are guessed (E-6)" | Fixed — `integrity.py:53-57` raises |
| `:36` "Verifier accepts a manifest that records only one licence and omits the base model (E-4)" | Fixed — `verify.ts:223-239` |
| `:37` "Decode geometry is wrong (E-5)" | Fixed — `decode.py:110-116`, properly tested |
| `:41` "Even a pinned lock still exits 3" | Still true, but the reason is D-32 (never invokes `package:build`), not the unpinned lock |
| `:48` "Mac workflow treats `status != \"unpinned\"` as failure (E-8)" | Fixed — `mac-unit.yml:19-27` |
| `:49` "Verifier path check is bypassable (E-3)" | Fixed for 4 of 5 fields; `launchProfile` remains (D-4) |
| `:77` "The message cites 'PRD §7.1 P0-B' for backend and model commands" | Fixed — now cites P0-C/P0-D/P0-E |
| `:79` "`upstream.lock` sets `$schema` … That schema file does not exist" | Fixed — the file exists (but is dangling, D-12) |
| `:26`/`:27` E-1 rows | The nine-name enforcement is fixed; the per-tool input/result half was never done (D-1) |

This file supersedes `doc/TODO.md`. Recommend deleting it or replacing it with a pointer
here, and adding a "last audited" rule so a banner cannot leave the body stale.

---

## 8. Work still required, in PRD order

Phase acceptance is a report against an immutable candidate (design §9.1), not file presence.

### First — fix what already claims to enforce a contract

1. **D-1** (per-tool input/result schemas; raw coordinates and model-supplied approval must be
   rejected) — the only defect that directly defeats CU-PLUGIN-02.
2. **D-9, D-4, D-10** (skipped suite passes the gate; `launchProfile` unchecked; no signature
   verification) — the release gate is the PRD's last line of defence.
3. **D-5** (archive ships stale files; digest ≠ shipped bytes), **D-6** (shard undercount),
   **D-7** (Python manifest fails its own schema).
4. **D-2, D-11, D-12, D-13, D-14, D-15, D-16, D-18** — schema/fixture defects.
5. **D-19, D-20, D-21, D-22, D-23, D-24** — eval/report/CLI defects, all with zero or thin tests.
6. **D-8** — entrypoint must exit 3, not traceback, in the packaged layout.
7. **D-25, D-26, D-27, D-28, D-29** — pins, ignores, CI.
8. **D-30, D-31, D-33, D-34, D-35** — policy/consistency cleanups.
9. Delete or redirect `doc/TODO.md` (§7); correct the README status numbers.

### Then — the spikes, before any artifact is called qualified

**P0-C — Windows pin and integrity prototype**

- Choose the immutable Windows-MCP commit and its exact interpreter; fill `upstream.lock`
  (`status: pinned`, revision, interpreter, lock digest). Wire
  `upstream-lock.schema.json` into `contracts:check`, or delete it (D-12).
- Decide extension module vs pinned fork. Register only the allowlisted tools on a **real
  stdio MCP server**; hidden tools must fail `tools/call` by name (§4.2's required case —
  there is no dispatch layer today). Stdout stays protocol-only. Telemetry off and verified.
- Implement `CtypesWinApi.open_process_token_integrity` and `WindowFromPoint` →
  `GetAncestor(GA_ROOT)` → `GetWindowThreadProcessId`.
- Implement the W-1 UI Automation primitives: header row, visible/used range, row count,
  active cell, selection, Name Box, formula bar, sheet tabs, ribbon controls, with depth and
  element caps.
- `--suite unit` vs `--suite native --allow-input` must differ; `--allow-input` must gate.
- Fix D-8 (packaged-layout exit 3) before any provisioning claim.

**P0-D — Default model export spike**

- Pin GUI-Actor-2B revision and weight hashes; keep 3B blocked.
- Implement §6.2 steps 1–5 and export the three graphs (or a verified fusion); record opset,
  exporter, quantization, and the GUI-Actor constants (`patch 14`, `merge 2`,
  `pointer_pad_token_id` 151661).
- Make `configs/*.json` and `models.lock.json` actually read by code.
- Fix D-6, D-7 before publishing any manifest.
- Parity across all 8 stages against a frozen tolerance profile. A failed export does not
  block the Windows accessibility slice.

**P0-E — Mac backend decision**

- Time-boxed Ghost fork vs `adapters/macos/swift-helper/` report covering the full §5.3 list,
  including actual duration.
- Pin the Swift toolchain and deployment target (D-28); add `swift build`/`swift test` to
  `mac-unit.yml` so a `pinned` lock runs real work.
- If Ghost loses a safety gate (implicit vision, recipes, cancellation), that result cannot
  be offset by binary size.

**P1 — Windows backend release.** Lifecycle harness
(`STOPPED → STARTING → INITIALIZED → READY → BUSY → STOPPING → STOPPED`, plus `UNAVAILABLE`);
disconnect during input returns `execution_uncertain` and never retries; the full CU-PLUGIN-07
native suite; the §4.1 fixture families with 20/200/500-row synthetic workbooks in English
and Simplified Chinese; `package:build --target win32-x64` emitting the Hub lock or the chosen
bundle with no model-engineering dependencies; `packaging/windows/build.ps1` must then invoke
`package:build` (D-32).

**P2-A — Qualified GUI-Actor file set.** Frozen configuration identity, health fixture,
per-file hashes, `LICENSES/`, parity report hash; provider evidence on the claimed hardware
(a CPU run does not qualify DirectML).

**P2-B — Evaluation release.** Close D-3, D-19 through D-22. Dataset manifests with
`regression` / `calibration` / `held_out`; never move a failing held-out case into calibration
under the same evaluation version. Register `dataset-manifest-v1` and validate datasets in
`contracts:check`. Replace the source-grep invariance test with a runtime
`child_process.spawn` stub. Offline tests must keep proving no backend process starts.

**P3 — Selected Mac helper.** Production allowlist enforced in registration **and** dispatch
(D-1 style binding, not a JSON file); explicit and implicit vision paths disabled; recipes
and learning unreachable even with an upstream sidecar installed; geometry metadata; sign,
notarize, and verify after packaging. Development-signed binaries are not evidence of
AiFetchly attribution.

**P4 — Release operations.** Close D-4, D-5, D-9, D-10, D-24. Upgrade notes: schema diff,
signing impact, whether the host adapter must change. Never replace bytes at a published
identity. Record the consumer build and artifact digest on every §9.2 handoff.

**P5 — Later gates.** Larger models, verifier, multi-display control, offline bundles, Windows
ARM, Intel Mac. Each needs its own licence, export, and host support. GUI-Actor-3B stays
blocked until a commercial licence exists.

---

## 9. What the green gates currently prove

Worth stating plainly, because every automated check passes:

- `contracts:check` proves the **49 fixtures** behave as labelled. It does not prove the
  schemas reject what they should — D-1, D-2, D-13 through D-18 are all instances the
  corpus never exercises. It also cannot see `dataset-manifest-v1` or
  `upstream-lock.schema.json`, and it never validates this repo's own trace bundle.
- `release:verify` passes a manifest containing an ASCII placeholder as a Mac native
  helper, an escaping `launchProfile`, and evidence files with bogus hashes (D-4, D-9, D-10).
- `eval replay` passes on a bundle that fails its own schema, with a report missing most of
  the §8.4 field groups, hardcoded splits, no fixture hashes, and a case set that can shrink
  silently (D-11, D-20, D-21, D-22).
- `grounding`'s 30 tests cover four pure-Python cores. There is no torch, no ONNX, no
  weights, and no `grounding/fixtures/`. Steps 1–5 of the reference path do not exist.
- `adapters/windows`' 37 tests cover a SID parser and mocks. There is no MCP server, no
  ctypes binding, and no W-1 observation code.

Phase 0 is honestly labelled as a foundation, and the fail-closed exits are the right
default. The risk is that the passing suite reads as contract enforcement. The defects in
§2 are all cases where a schema, verifier, or report claims a guarantee it does not provide
— closing them is what turns this repository's green result into evidence.
