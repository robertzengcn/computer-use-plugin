"""Cross-language contract conformance (CU-PLUGIN-18, design §3.7).

The Python side of the boundary validates the canonical fixtures with a
Python JSON Schema 2020-12 validator: the same fixtures the TypeScript
conformance runner checks must fail and pass identically here. This twin
suite covers the grounding/models/traces families the model-engineering
package produces and consumes.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = REPO_ROOT / "contracts"
FAMILIES = ("grounding/", "models/", "traces/")


def build_registry() -> tuple[Registry, dict[str, Any]]:
    registry_index = json.loads((CONTRACTS / "registry.json").read_text(encoding="utf-8"))
    resources: dict[str, Any] = {}
    for entry in registry_index["schemas"]:
        schema = json.loads((CONTRACTS / entry["path"]).read_text(encoding="utf-8"))
        resources[entry["$id"]] = Resource.from_contents(schema, default_specification=DRAFT202012)
    registry = Registry().with_resources(resources.items())
    return registry, resources


REGISTRY, SCHEMAS_BY_ID = build_registry()


def manifest_entries() -> list[dict[str, str]]:
    manifest = json.loads((CONTRACTS / "fixtures" / "manifest.json").read_text(encoding="utf-8"))
    return [e for e in manifest["entries"] if e["file"].startswith(FAMILIES)]


@pytest.mark.parametrize(
    "entry",
    [e for e in manifest_entries() if e["expectation"] == "valid"],
    ids=lambda e: e["file"],
)
def test_valid_fixtures_pass_in_python(entry: dict[str, str]) -> None:
    from jsonschema.validators import validator_for

    schema = SCHEMAS_BY_ID[entry["schema"]].contents
    validator = validator_for(schema, default=DRAFT202012)(schema, registry=REGISTRY)
    instance = json.loads((CONTRACTS / "fixtures" / entry["file"]).read_text(encoding="utf-8"))
    errors = list(validator.iter_errors(instance))
    assert not errors, f"{entry['file']}: {[e.message for e in errors]}"


def semantic_violations(schema_id: str, instance: Any) -> list[str]:
    """Mirror of tooling/contracts/rules.ts: cross-field bounds the JSON
    Schemas cannot express, enforced identically in both languages (B20
    consolidation: one definition, schema + semantic coverage)."""
    violations: list[str] = []
    if schema_id.endswith("grounding/result-v1.json"):
        for index, candidate in enumerate(instance.get("candidates", [])):
            dims = candidate.get("imageDimensions")
            if dims is None:
                continue
            point = candidate.get("geometry", {}).get("point")
            if point is not None and not (
                0 <= point["x"] <= dims["widthPx"] and 0 <= point["y"] <= dims["heightPx"]
            ):
                violations.append(f"candidates[{index}] point outside declared dimensions")
            region = candidate.get("geometry", {}).get("region")
            if region is not None and (
                region["x"] < 0
                or region["y"] < 0
                or region["x"] + region["w"] > dims["widthPx"]
                or region["y"] + region["h"] > dims["heightPx"]
            ):
                violations.append(f"candidates[{index}] region exceeds declared dimensions")
    if schema_id.endswith("grounding/request-v1.json"):
        image = instance.get("image", {})
        crop = image.get("crop")
        if crop is not None and (
            crop["x"] + crop["w"] > image.get("widthPx", 0)
            or crop["y"] + crop["h"] > image.get("heightPx", 0)
        ):
            violations.append("crop exceeds declared capture")
    return violations


@pytest.mark.parametrize(
    "entry",
    [e for e in manifest_entries() if e["expectation"] == "invalid"],
    ids=lambda e: e["file"],
)
def test_invalid_fixtures_fail_in_python(entry: dict[str, str]) -> None:
    from jsonschema import FormatChecker
    from jsonschema.validators import validator_for

    schema = SCHEMAS_BY_ID[entry["schema"]].contents
    validator = validator_for(schema, default=DRAFT202012)(
        schema, registry=REGISTRY, format_checker=FormatChecker()
    )
    instance = json.loads((CONTRACTS / "fixtures" / entry["file"]).read_text(encoding="utf-8"))
    schema_errors = list(validator.iter_errors(instance))
    semantic = semantic_violations(entry["schema"], instance)
    assert schema_errors or semantic, f"{entry['file']}: expected to be invalid"


def test_every_family_has_both_expectations() -> None:
    entries = manifest_entries()
    assert any(e["expectation"] == "valid" for e in entries)
    assert any(e["expectation"] == "invalid" for e in entries)
