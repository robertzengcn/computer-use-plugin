"""Export pipeline orchestration: staged, typed failures (design §6.6)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from aifetchly_grounding.export.pipeline import (
    StageFailure,
    load_config,
    resolve_models_lock,
    run_pipeline,
)

CONFIGS = Path(__file__).resolve().parents[1] / "configs"


def test_load_config_reads_the_pinned_profiles() -> None:
    config = load_config("gui-actor-2b-fp16")
    assert config["modelId"] == "microsoft/GUI-Actor-2B-Qwen2-VL"
    assert config["preprocessing"]["pointerPadTokenId"] == 151661


def test_unknown_config_fails_at_resolve_lock() -> None:
    with pytest.raises(StageFailure, match="unknown configuration"):
        load_config("no-such-config")


def test_lock_must_be_approved_before_any_export(tmp_path: Path) -> None:
    config = load_config("gui-actor-2b-fp16")
    with pytest.raises(Exception, match="P0-D spike must pin"):
        resolve_models_lock(config)


def test_pipeline_reports_prerequisites_missing_with_stage(tmp_path: Path) -> None:
    report = run_pipeline("gui-actor-2b-fp16", tmp_path)
    # models.lock.json is 'unfetched' → prerequisite failure at resolve_lock.
    assert report["status"] == "prerequisites-missing"
    assert report["failingStage"] == "resolve_lock"
    written = json.loads((tmp_path / "pipeline-report.json").read_text())
    assert written == report


def test_pipeline_names_unknown_config_stage(tmp_path: Path) -> None:
    report = run_pipeline("ghost-config", tmp_path)
    assert report["status"] == "unqualified"
    assert report["failingStage"] == "resolve_lock"
