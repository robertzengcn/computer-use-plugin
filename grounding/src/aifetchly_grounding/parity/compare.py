"""Parity comparison cores (design §6.3): per-stage tensor tolerances and
region-hit agreement. Pure functions over plain sequences so parity policy is
testable without any ML framework installed."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass


class ParityError(Exception):
    """Malformed comparison inputs."""


@dataclass(frozen=True)
class StageComparison:
    stage: str
    max_abs_error: float
    max_rel_error: float
    passed: bool


@dataclass(frozen=True)
class Region:
    x: float
    y: float
    w: float
    h: float


def stage_compare(
    stage: str,
    reference: Sequence[float],
    actual: Sequence[float],
    tolerances: Mapping[str, float],
) -> StageComparison:
    """Compare two flat stages with named abs/rel tolerances."""
    if len(reference) != len(actual):
        raise ParityError(f"{stage}: length mismatch {len(reference)} != {len(actual)}")
    if "absTolerance" not in tolerances or "relTolerance" not in tolerances:
        raise ParityError(f"{stage}: tolerance profile needs absTolerance and relTolerance")
    abs_tol = float(tolerances["absTolerance"])
    rel_tol = float(tolerances["relTolerance"])
    max_abs = 0.0
    max_rel = 0.0
    for expected, got in zip(reference, actual, strict=True):
        difference = abs(expected - got)
        denominator = max(abs(expected), abs(got), 1e-12)
        max_abs = max(max_abs, difference)
        max_rel = max(max_rel, difference / denominator)
    passed = max_abs <= abs_tol or max_rel <= rel_tol
    return StageComparison(
        stage=stage,
        max_abs_error=max_abs,
        max_rel_error=max_rel,
        passed=passed,
    )


def point_in_region(x: float, y: float, region: Region) -> bool:
    return (
        region.x <= x <= region.x + region.w and region.y <= y <= region.y + region.h
    )


def region_hit_agreement(
    reference_centers: Sequence[tuple[float, float]],
    actual_regions: Sequence[Region],
) -> float:
    """Fraction of reference centers landing inside some actual region."""
    if not reference_centers:
        raise ParityError("no reference centers to compare")
    hits = sum(
        1 for (x, y) in reference_centers if any(point_in_region(x, y, region) for region in actual_regions)
    )
    return hits / len(reference_centers)


def first_failing_stage(comparisons: Sequence[StageComparison]) -> str | None:
    """Name the first failing stage; None when every stage passed."""
    for comparison in comparisons:
        if not comparison.passed:
            return comparison.stage
    return None
