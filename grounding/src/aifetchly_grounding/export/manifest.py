"""Model manifest assembly (design §6.4). Records the full reproducibility
and licence identity; a non-commercial licence chain blocks the build so the
release gate can never publish it (CU-INST-11)."""

from __future__ import annotations

from dataclasses import dataclass

NON_COMMERCIAL_LICENCES = frozenset({"qwen-research-non-commercial"})


class LicenceBlockedError(Exception):
    """A licence in the chain forbids commercial distribution."""


class ManifestError(Exception):
    """The manifest inputs are incomplete."""


@dataclass(frozen=True)
class FileEntry:
    path: str
    bytes: int
    sha256: str


@dataclass(frozen=True)
class LicenceEntry:
    component: str
    licence: str
    notice_path: str


@dataclass(frozen=True)
class GraphEntry:
    name: str
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]


@dataclass(frozen=True)
class ManifestInputs:
    runtime_id: str
    version: str
    model_id: str
    revision: str
    weights_licence: str
    base_model_id: str
    base_model_licence: str
    quantization: str
    files: tuple[FileEntry, ...]
    licences: tuple[LicenceEntry, ...]
    parity_report_sha256: str
    parity_fixture_count: int
    exporter: str
    opset: int
    preprocessing: dict[str, object]
    graphs: tuple[GraphEntry, ...]
    execution_providers: tuple[str, ...]
    health_image_path: str
    health_expected_path: str


def check_licences(inputs: ManifestInputs) -> None:
    """Raise LicenceBlockedError when any licence in the chain is non-commercial."""
    chain = [inputs.weights_licence, inputs.base_model_licence, *(e.licence for e in inputs.licences)]
    offenders = sorted({name for name in chain if name in NON_COMMERCIAL_LICENCES})
    if offenders:
        raise LicenceBlockedError(
            f"non-commercial licence(s) {offenders} block publication: a fine-tune "
            "licence never overrides its base model (CU-INST-11)"
        )


def build_manifest(inputs: ManifestInputs) -> dict[str, object]:
    """Assemble a model-manifest-v1 shaped record from actual files."""
    if not inputs.files:
        raise ManifestError("no files recorded")
    for entry in inputs.files:
        if len(entry.sha256) != 64 or any(c not in "0123456789abcdef" for c in entry.sha256):
            raise ManifestError(f"{entry.path}: sha256 must be 64 lowercase hex characters")
    check_licences(inputs)

    return {
        "packageKind": "grounding-model",
        "runtimeId": inputs.runtime_id,
        "version": inputs.version,
        "upstream": {
            "modelId": inputs.model_id,
            "revision": inputs.revision,
            "licence": inputs.weights_licence,
            "baseModel": {"modelId": inputs.base_model_id, "licence": inputs.base_model_licence},
        },
        "identity": {
            "groundingContractVersion": 1,
            "adapterId": "gui-actor-onnx",
            "architecture": "gui-actor-2b-qwen2-vl",
            "manifestVersion": 1,
            "preprocessingRevision": str(inputs.preprocessing.get("preprocessingRevision", "prep-v1")),
            "decodingRevision": "dec-v1",
            "calibrationRevision": "cal-v1",
        },
        "export": {
            "pipelineVersion": "export-v1",
            "exporter": inputs.exporter,
            "opset": inputs.opset,
            "quantization": inputs.quantization,
        },
        "preprocessing": inputs.preprocessing,
        "graphs": [
            {"name": graph.name, "inputs": list(graph.inputs), "outputs": list(graph.outputs)}
            for graph in inputs.graphs
        ],
        "executionProviders": list(inputs.execution_providers),
        "files": [
            {"path": entry.path, "bytes": entry.bytes, "sha256": entry.sha256} for entry in inputs.files
        ],
        "licences": [
            {"component": entry.component, "licence": entry.licence, "noticePath": entry.notice_path}
            for entry in inputs.licences
        ],
        "parityReport": {
            "sha256": inputs.parity_report_sha256,
            "fixtureCount": inputs.parity_fixture_count,
            "status": "candidate",
        },
        "healthFixture": {
            "imagePath": inputs.health_image_path,
            "expectedPath": inputs.health_expected_path,
        },
        "limits": {
            "maxFiles": 128,
            "maxTotalBytes": 8589934592,
            "maxShardBytes": 536870912,
        },
    }
