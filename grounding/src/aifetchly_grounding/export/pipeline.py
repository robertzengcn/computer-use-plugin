"""Export/parity pipeline orchestration (design §6.6).

Runs the staged sequence — lock resolution → reference smoke → graph export →
sharding → parity → calibration → provider report → file-set assembly — and
emits a structured report where every typed failure names its stage. The
torch-dependent stages import lazily: without the pinned model-engineering
environment they raise MissingToolchainError instead of an ImportError
traceback. Retrying may resume artifact preparation but never quietly changes
the configuration or reuses an old result identity.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path


from ..reference.runner import MissingToolchainError, MissingWeightsError, require_reference_toolchain

GROUNDING_ROOT = Path(__file__).resolve().parents[3]
CONFIGS = GROUNDING_ROOT / "configs"
MODELS_LOCK = GROUNDING_ROOT / "models.lock.json"

STAGES = (
    "resolve_lock",
    "reference_smoke",
    "export_graphs",
    "shard_external_data",
    "parity",
    "calibration",
    "provider_report",
    "assemble_file_set",
)

# Stages with real executable code. Everything else reports "unimplemented"
# and unqualifies the run — prerequisites alone must never imply export
# success (B02: no stage may claim ok without performing work).
IMPLEMENTED_STAGES = frozenset({"resolve_lock"})


@dataclass(frozen=True)
class StageFailure(Exception):
    """A typed pipeline failure that names its stage (design §6.6)."""

    stage: str
    reason: str

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"[{self.stage}] {self.reason}"


def load_config(config_id: str) -> dict[str, object]:
    path = CONFIGS / f"{config_id}.json"
    if not path.is_file():
        raise StageFailure("resolve_lock", f"unknown configuration '{config_id}' (no {path})")
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_models_lock(config: dict[str, object]) -> dict[str, object]:
    lock = json.loads(MODELS_LOCK.read_text(encoding="utf-8"))
    if lock.get("status") != "approved":
        raise MissingWeightsError(
            f"models.lock.json status is '{lock.get('status')}': the P0-D spike must pin "
            "revisions and weight hashes before export runs"
        )
    for model in lock.get("models", []):
        if model.get("modelId") == config.get("modelId"):
            if model.get("commercialUse") == "blocked":
                raise StageFailure(
                    "resolve_lock",
                    f"{model.get('modelId')} is blocked for commercial use (CU-INST-11)",
                )
            if not model.get("revision"):
                raise MissingWeightsError(
                    f"{model.get('modelId')} has no pinned revision; nothing may be fetched implicitly"
                )
            return dict(model)
    raise StageFailure("resolve_lock", f"model {config.get('modelId')} not present in models.lock.json")


def run_pipeline(
    config_id: str,
    output_dir: Path,
    dataset: str | None = None,
) -> dict[str, object]:
    """Execute the staged sequence and return a machine-readable report."""
    report: dict[str, object] = {
        "config": config_id,
        "dataset": dataset,
        "stages": {},
        "status": "candidate",
    }
    stages: dict[str, str] = {}
    try:
        config = load_config(config_id)
        model = resolve_models_lock(config)
        stages["resolve_lock"] = "ok"
        report["model"] = model.get("modelId")

        require_reference_toolchain()
        for stage in STAGES:
            if stage == "resolve_lock":
                continue
            stages[stage] = (
                "ok" if stage in IMPLEMENTED_STAGES else "unimplemented"
            )
        unimplemented = [
            stage for stage in STAGES if stages.get(stage) == "unimplemented"
        ]
        if unimplemented:
            # Prerequisites satisfied but the export/parity machinery is not
            # implemented: an explicit unqualified result, never success.
            report["status"] = "unqualified"
            report["failingStage"] = unimplemented[0]
            report["unimplementedStages"] = unimplemented
    except StageFailure as failure:
        stages[failure.stage] = f"failed: {failure.reason}"
        report["status"] = "unqualified"
        report["failingStage"] = failure.stage
    except (MissingToolchainError, MissingWeightsError) as failure:
        # Weight/toolchain gaps are prerequisite failures, not export divergence.
        stage = "reference_smoke" if isinstance(failure, MissingToolchainError) else "resolve_lock"
        stages[stage] = f"prerequisite: {failure}"
        report["status"] = "prerequisites-missing"
        report["failingStage"] = stage
        report["detail"] = str(failure)
    report["stages"] = stages
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "pipeline-report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aifetchly_grounding.export.pipeline")
    parser.add_argument("--config", required=True, help="configuration id from grounding/configs/")
    parser.add_argument("--dataset", help="dataset id whose fixtures parity must evaluate")
    parser.add_argument("--out", default=str(GROUNDING_ROOT / "out"), help="output directory")
    args = parser.parse_args(argv)
    report = run_pipeline(args.config, Path(args.out) / args.config, dataset=args.dataset)
    print(json.dumps(report))
    if report["status"] == "prerequisites-missing":
        return 3
    if report["status"] != "candidate":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
