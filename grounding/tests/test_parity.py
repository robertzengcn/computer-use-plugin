"""Parity comparison cores (design §6.3)."""

from __future__ import annotations

import pytest

from aifetchly_grounding.parity.compare import (
    ParityError,
    Region,
    first_failing_stage,
    region_hit_agreement,
    stage_compare,
)

TOL = {"absTolerance": 0.01, "relTolerance": 0.001}


def test_identical_stages_pass_with_zero_error() -> None:
    result = stage_compare("pixel_values", [1.0, 2.0, 3.0], [1.0, 2.0, 3.0], TOL)
    assert result.passed
    assert result.max_abs_error == 0.0


def test_small_absolute_error_passes() -> None:
    result = stage_compare("attention_scores", [0.5, 0.5], [0.505, 0.495], TOL)
    assert result.passed
    assert result.max_abs_error == pytest.approx(0.005)


def test_divergent_stage_fails_and_is_named() -> None:
    stages = [
        stage_compare("pixel_values", [1.0], [1.0], TOL),
        stage_compare("pointer_pad_hidden", [0.5], [0.9], TOL),
    ]
    assert first_failing_stage(stages) == "pointer_pad_hidden"
    assert first_failing_stage(stages[:1]) is None


def test_length_mismatch_raises() -> None:
    with pytest.raises(ParityError, match="length mismatch"):
        stage_compare("x", [1.0], [1.0, 2.0], TOL)


def test_missing_tolerance_profile_raises() -> None:
    with pytest.raises(ParityError, match="tolerance profile"):
        stage_compare("x", [1.0], [1.0], {})


def test_region_hit_agreement() -> None:
    regions = (Region(x=0.4, y=0.4, w=0.2, h=0.2), Region(x=0.8, y=0.1, w=0.1, h=0.1))
    assert region_hit_agreement([(0.5, 0.5), (0.85, 0.15), (0.1, 0.1)], regions) == pytest.approx(2 / 3)
    assert region_hit_agreement([(0.5, 0.5)], regions) == 1.0


def test_region_hit_empty_reference_rejected() -> None:
    with pytest.raises(ParityError):
        region_hit_agreement([], ())
