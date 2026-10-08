# Contract compatibility and version evolution

How `aifetchly-computer-use` contracts evolve without breaking pinned
consumers (design §3.7, CU-PLUGIN-01; M01 procedure).

## Principles

1. **JSON Schema is canonical.** Generated `.d.ts` declarations and the
   Python conformance twins derive from the same schemas and fixtures; they
   never define shape independently.
2. **Consumers pin by `$id` + digest.** A consumer records the contract
   archive version and closure digest it was validated against
   (`contracts:build` prints both). Compatibility is claimed against that
   immutable artifact, never against a branch head.
3. **No in-place mutation of published bytes.** A published archive version
   is never edited; any change — however small — produces a new version and
   a new digest (design §7.5).

## Change classification

| Change class | Examples | Procedure |
| --- | --- | --- |
| **Additive-optional** | New optional property on a non-authority record; new diagnostic-extension object | Same major version is allowed **only before** any consumer pins; after a pin, bump the minor archive version. Requires: new positive fixture, tolerant-reader note, and a negative fixture proving a previous decoder ignores the field safely. |
| **Additive-required / semantic tightening** | New required field; tightened enum/bounds; new semantic rule | New schema family version (`-v2`) and registry entry; `-v1` stays published. A release declaring `-v2` must record both versions during migration. |
| **Breaking** | Removed/renamed field; changed unit meaning; changed authority semantics (e.g. act payloads) | New family version + coordinated host release (PRD CU-PLUGIN-01). The plugin cannot claim compatibility with a host that still pins the old version. |
| **Rule/semantic-only** | New entry in `rules/semantic-rules-v1.json` without schema change | Allowed within a version **only before** any consumer pins; afterwards treated as tightening → new version. The rules document and implementation ids must match exactly (asserted by `contracts:check`). |

## Required test coverage per change

- **Previous-consumer test:** when compatibility with a previously pinned
  consumer is claimed, validate the new fixtures against the pinned previous
  archive (extracted from its zip) — additive changes must not break the old
  validator, and the test names the pinned digest.
- **Both-direction fixtures:** every new/changed field carries one positive
  and at least one negative fixture (including the previous-consumer
  behavior where relevant).
- **Cross-language:** Python conformance twins must pass against the same
  fixtures before the archive is built.

## Current status

- All families are at `v1`; no `-v2` exists yet. The first consumer pin by
  AiFetchly will freeze this procedure's "after a pin" rules into effect.

## Version bumps

`contracts/registry.json` `version` field is the archive version. Bump it
whenever any schema, fixture, rule document or declaration changes after a
consumer pin. `contracts:build` embeds the version in the archive manifest
and digest; a changed digest with an unchanged version is a release error.
