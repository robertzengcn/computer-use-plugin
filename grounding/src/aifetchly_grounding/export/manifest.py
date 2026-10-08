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
    # E14: explicit validated processing/architecture identities. Defaults
    # preserve the current production configuration; revised calibration or
    # decoder revisions must produce distinct schema-valid identities instead
    # of silently defaulting or leaking into preprocessing params.
    adapter_id: str = "gui-actor-onnx"
    architecture: str = "gui-actor-2b-qwen2-vl"
    grounding_contract_version: int = 1
    manifest_version: int = 1
    preprocessing_revision: str = "prep-v1"
    decoding_revision: str = "dec-v1"
    calibration_revision: str = "cal-v1"
    pipeline_version: str = "export-v1"


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
    # E14: processing identity lives in explicit revision inputs, never inside
    # the preprocessing parameter dict. A revision smuggled via preprocessing
    # would produce an invalid manifest (additional property) — fail fast with
    # a typed error instead of emitting invalid bytes.
    for leaked in ("preprocessingRevision", "decodingRevision", "calibrationRevision"):
        if leaked in inputs.preprocessing:
            raise ManifestError(
                f"preprocessing must not contain {leaked!r}: pass it as an explicit revision input"
            )
    for label, value in (
        ("adapter_id", inputs.adapter_id),
        ("architecture", inputs.architecture),
        ("preprocessing_revision", inputs.preprocessing_revision),
        ("decoding_revision", inputs.decoding_revision),
        ("calibration_revision", inputs.calibration_revision),
        ("pipeline_version", inputs.pipeline_version),
    ):
        if not isinstance(value, str) or not value:
            raise ManifestError(f"missing identity: {label}")
        if len(value) > 128:
            raise ManifestError(f"identity {label} exceeds 128 characters")
    if inputs.grounding_contract_version < 1 or inputs.manifest_version < 1:
        raise ManifestError("contract/manifest versions must be >= 1")

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
            "groundingContractVersion": inputs.grounding_contract_version,
            "adapterId": inputs.adapter_id,
            "architecture": inputs.architecture,
            "manifestVersion": inputs.manifest_version,
            "preprocessingRevision": inputs.preprocessing_revision,
            "decodingRevision": inputs.decoding_revision,
            "calibrationRevision": inputs.calibration_revision,
        },
        "export": {
            "pipelineVersion": inputs.pipeline_version,
            "exporter": inputs.exporter,
            "opset": inputs.opset,
            "quantization": inputs.quantization,
        },
        "preprocessing": dict(inputs.preprocessing),
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
