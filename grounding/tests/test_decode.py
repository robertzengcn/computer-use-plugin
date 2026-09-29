"""GUI-Actor decode policy tests (design §6.2 step 6)."""

from __future__ import annotations

import math

import pytest

from aifetchly_grounding.reference.decode import DecodingError, decode_candidates


def test_single_peak_grid_yields_center_candidate() -> None:
    grid = [[0.0] * 5 for _ in range(5)]
    grid[2][2] = 1.0
    grid[2][3] = 0.9
    grid[3][2] = 0.8
    candidates = decode_candidates(grid)
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.patch_count == 3
    # activation-weighted center, normalized [0,1] over a 5x5 grid
    weight_sum = 1.0 + 0.9 + 0.8
    expected_x = (1.0 * 2 + 0.9 * 3 + 0.8 * 2) / weight_sum / 4
    expected_y = (1.0 * 2 + 0.9 * 2 + 0.8 * 3) / weight_sum / 4
    assert candidate.x == pytest.approx(expected_x)
    assert candidate.y == pytest.approx(expected_y)


def test_two_separated_blobs_rank_by_mean_activation() -> None:
    grid = [[0.0] * 10 for _ in range(4)]
    # strong blob on the left
    grid[1][1] = 1.0
    grid[1][2] = 0.95
    # weaker blob on the right
    grid[2][8] = 0.5
    grid[2][9] = 0.45
    candidates = decode_candidates(grid)
    assert len(candidates) == 2
    assert candidates[0].mean_activation > candidates[1].mean_activation
    assert candidates[0].x < candidates[1].x


def test_below_threshold_patches_do_not_connect_blobs() -> None:
    grid = [[0.0] * 5 for _ in range(1)]
    grid[0][0] = 1.0
    grid[0][1] = 0.2  # below 0.3 * max
    grid[0][2] = 0.9
    candidates = decode_candidates(grid)
    # 0.2 is below threshold: two separate single-patch regions
    assert len(candidates) == 2
    assert all(c.patch_count == 1 for c in candidates)


def test_all_zero_grid_returns_no_candidates() -> None:
    assert decode_candidates([[0.0, 0.0], [0.0, 0.0]]) == []


def test_tie_ordering_is_deterministic() -> None:
    grid = [[0.0] * 6 for _ in range(1)]
    grid[0][1] = 0.5
    grid[0][4] = 0.5
    first = decode_candidates(grid)
    second = decode_candidates(grid)
    assert [(c.x, c.y) for c in first] == [(c.x, c.y) for c in second]


def test_malformed_grids_raise_typed_errors() -> None:
    with pytest.raises(DecodingError):
        decode_candidates([])
    with pytest.raises(DecodingError):
        decode_candidates([[0.1, 0.2], [0.3]])
    with pytest.raises(DecodingError):
        decode_candidates([[0.1, math.nan]])
    with pytest.raises(DecodingError):
        decode_candidates([[0.1, math.inf]])


def test_max_candidates_caps_output() -> None:
    grid = [[0.0] * 8 for _ in range(8)]
    for row in range(8):
        for col in range(8):
            grid[row][col] = 0.1 * ((row * 8 + col) % 8 + 1)
    candidates = decode_candidates(grid, max_candidates=3)
    assert len(candidates) <= 3
