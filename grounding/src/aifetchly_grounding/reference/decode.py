"""GUI-Actor attention postprocess (design §6.2, step 6).

Keep patches at or above ``threshold_ratio`` × max activation, group
4-connected regions, rank regions by mean activation, and return
activation-weighted centers normalized to [0, 1] in model-input image space.
Pure Python on small grids so the decoding policy is testable without torch.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

DEFAULT_THRESHOLD_RATIO = 0.3
DEFAULT_MAX_CANDIDATES = 5


class DecodingError(Exception):
    """The attention grid is malformed."""


@dataclass(frozen=True)
class Candidate:
    """A ranked candidate region in normalized model-input coordinates."""

    x: float
    y: float
    mean_activation: float
    patch_count: int


def decode_candidates(
    grid: list[list[float]],
    threshold_ratio: float = DEFAULT_THRESHOLD_RATIO,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
) -> list[Candidate]:
    """Decode an attention grid over the merged patch grid."""
    if not grid or not grid[0]:
        raise DecodingError("attention grid is empty")
    width = len(grid[0])
    if any(len(row) != width for row in grid):
        raise DecodingError("attention grid rows have inconsistent widths")
    for row in grid:
        for value in row:
            if math.isnan(value) or math.isinf(value):
                raise DecodingError("attention grid contains non-finite values")

    max_activation = max(value for row in grid for value in row)
    if max_activation <= 0:
        return []
    threshold = threshold_ratio * max_activation

    height = len(grid)
    visited: list[list[bool]] = [[False] * width for _ in range(height)]
    regions_with_origin: list[tuple[Candidate, int, int]] = []
    for start_row in range(height):
        for start_col in range(width):
            if visited[start_row][start_col] or grid[start_row][start_col] < threshold:
                continue
            regions_with_origin.append(
                _collect_region(grid, visited, start_row, start_col, threshold),
            )

    # Rank by mean activation descending; ties break on the top-left patch of
    # each region so identical inputs always yield the identical order.
    regions_with_origin.sort(key=lambda item: (-item[0].mean_activation, item[1], item[2]))
    return [region for region, _, _ in regions_with_origin[:max_candidates]]


def _collect_region(
    grid: list[list[float]],
    visited: list[list[bool]],
    start_row: int,
    start_col: int,
    threshold: float,
) -> tuple[Candidate, int, int]:
    height = len(grid)
    width = len(grid[0])
    stack: list[tuple[int, int]] = [(start_row, start_col)]
    activation_sum = 0.0
    weighted_row = 0.0
    weighted_col = 0.0
    count = 0
    min_row = start_row
    min_col = start_col
    while stack:
        row, col = stack.pop()
        if visited[row][col]:
            continue
        visited[row][col] = True
        value = grid[row][col]
        activation_sum += value
        weighted_row += value * row
        weighted_col += value * col
        count += 1
        min_row = min(min_row, row)
        min_col = min(min_col, col)
        for delta_row, delta_col in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            next_row, next_col = row + delta_row, col + delta_col
            if (
                0 <= next_row < height
                and 0 <= next_col < width
                and not visited[next_row][next_col]
                and grid[next_row][next_col] >= threshold
            ):
                stack.append((next_row, next_col))

    # Patch i covers [i, i+1) of the grid, so its centre in normalized [0, 1]
    # model-input space is (i + 0.5) / grid_size; the activation-weighted
    # centre follows the same mapping (design §6.2).
    mean_row = weighted_row / activation_sum if activation_sum else 0.0
    mean_col = weighted_col / activation_sum if activation_sum else 0.0
    candidate = Candidate(
        x=(mean_col + 0.5) / width,
        y=(mean_row + 0.5) / height,
        mean_activation=activation_sum / count if count else 0.0,
        patch_count=count,
    )
    return candidate, min_row, min_col
