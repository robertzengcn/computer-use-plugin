"""AX normalization: bounding, truncation flags, CJK, typed errors (§4.2)."""

from __future__ import annotations

import pytest

from aifetchly_windows.normalize import NormalizationError, normalize_ax_tree


def cell(name: str, frame: list[float], value: str | None = None) -> dict[str, object]:
    node: dict[str, object] = {"role": "header", "name": name, "frame": frame}
    if value is not None:
        node["value"] = value
    return node


def test_cjk_labels_preserved() -> None:
    tree = normalize_ax_tree(
        {"role": "pane", "name": "工作表 Sheet1", "frame": [0, 40, 1920, 1000],
         "children": [cell("电子邮件", [64, 188, 120, 24])]}
    )
    assert tree.elements[1].name == "电子邮件"
    assert tree.element_count == 2
    assert tree.truncated is False


def test_empty_tree_is_explicit_empty() -> None:
    tree = normalize_ax_tree({"role": "document", "name": ""})
    assert tree.element_count == 1
    assert tree.truncated is False


def test_large_tree_reports_truncation() -> None:
    def chain(depth: int) -> dict[str, object]:
        node: dict[str, object] = {"role": "pane", "frame": [0, 0, 10, 10]}
        for _ in range(depth):
            node = {"role": "pane", "frame": [0, 0, 10, 10], "children": [node]}
        return node

    tree = normalize_ax_tree(chain(500), max_elements=100, max_depth=1000)
    assert tree.element_count == 100
    assert tree.truncated is True


def test_missing_geometry_is_typed_error() -> None:
    with pytest.raises(NormalizationError, match="frame"):
        normalize_ax_tree({"role": "header", "name": "x", "frame": [1, 2, 0, 5]})
    with pytest.raises(NormalizationError, match="frame"):
        normalize_ax_tree({"role": "header", "name": "x", "frame": "nope"})


def test_node_without_role_is_typed_error() -> None:
    with pytest.raises(NormalizationError, match="role"):
        normalize_ax_tree({"name": "orphan"})


def test_role_index_supports_bounded_lookup() -> None:
    tree = normalize_ax_tree(
        {"role": "pane", "frame": [0, 0, 1, 1], "children": [
            cell("A", [0, 0, 1, 1]),
            cell("B", [0, 1, 1, 1]),
        ]}
    )
    assert tree.index_by_role["header"] == (1, 2)
