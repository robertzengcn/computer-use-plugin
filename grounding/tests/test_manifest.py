"""Manifest assembly and the licence gate (CU-INST-11)."""

from __future__ import annotations

import pytest

from aifetchly_grounding.export.manifest import (
    FileEntry,
    LicenceBlockedError,
    LicenceEntry,
    ManifestError,
    ManifestInputs,
    build_manifest,
)

SHA = "a" * 64


def inputs(**overrides: object) -> ManifestInputs:
    base: dict[str, object] = {
        "runtime_id": "grounding-model-gui-actor-2b-fp16",
        "version": "0.1.0",
        "model_id": "microsoft/GUI-Actor-2B-Qwen2-VL",
        "revision": "r1",
        "weights_licence": "mit",
        "base_model_id": "Qwen/Qwen2-VL-2B-Instruct",
        "base_model_licence": "apache-2.0",
        "quantization": "fp16",
        "files": (FileEntry(path="pointer_head.onnx", bytes=512, sha256=SHA),),
        "licences": (
            LicenceEntry(component="GUI-Actor weights", licence="mit", notice_path="LICENSES/GUI-ACTOR"),
        ),
        "parity_report_sha256": SHA,
        "parity_fixture_count": 12,
    }
    base.update(overrides)
    return ManifestInputs(**base)  # type: ignore[arg-type]


def test_commercial_chain_builds_manifest() -> None:
    manifest = build_manifest(inputs())
    assert manifest["packageKind"] == "grounding-model"
    assert manifest["upstream"]["baseModel"]["licence"] == "apache-2.0"
    files = manifest["files"]
    assert isinstance(files, list) and files[0]["sha256"] == SHA


def test_non_commercial_base_model_blocks() -> None:
    blocked = inputs(
        base_model_id="Qwen/Qwen2.5-VL-3B-Instruct",
        base_model_licence="qwen-research-non-commercial",
    )
    with pytest.raises(LicenceBlockedError, match="never overrides its base model"):
        build_manifest(blocked)


def test_non_commercial_notice_entry_also_blocks() -> None:
    with_notice = inputs(
        licences=(
            LicenceEntry(component="extra", licence="qwen-research-non-commercial", notice_path="L"),
            LicenceEntry(component="weights", licence="mit", notice_path="L2"),
        ),
    )
    with pytest.raises(LicenceBlockedError):
        build_manifest(with_notice)


def test_bad_hash_rejected() -> None:
    with pytest.raises(ManifestError, match="64 lowercase hex"):
        build_manifest(inputs(files=(FileEntry(path="a.onnx", bytes=1, sha256="zz"),)))


def test_empty_files_rejected() -> None:
    with pytest.raises(ManifestError, match="no files"):
        build_manifest(inputs(files=()))
