"""W-1 Excel observation extraction (design §4.1, CU-PLUGIN-06 bounded reads)."""

from __future__ import annotations

import pytest

from aifetchly_windows.w1 import W1ObservationError, extract_w1_observation


def cell(row: int, column: int, name: str | None = None, value: str | None = None, **flags: bool) -> dict[str, object]:
    node: dict[str, object] = {"role": "cell", "row": row, "column": column}
    if name is not None:
        node["name"] = name
    if value is not None:
        node["value"] = value
    node.update(flags)
    return node


def sheet(children: list[dict[str, object]], **extras: object) -> dict[str, object]:
    return {"role": "grid", "name": "Sheet1", "children": children, **extras}


def test_en_sheet_extraction() -> None:
    observation = extract_w1_observation(sheet([
        cell(0, 0, "Full Name"), cell(0, 1, "Email"), cell(0, 2, "Phone"),
        cell(1, 0, "张伟", "张伟"), cell(1, 1, "zhang.wei@example.com"),
        cell(2, 0, value="010-5555"),
    ]))
    assert observation.headerRow == ("Full Name", "Email", "Phone")
    assert observation.usedRange == (3, 3)
    assert observation.activeCell is None
    assert observation.selection == ()
    assert observation.truncated is False


def test_active_cell_and_selection() -> None:
    observation = extract_w1_observation(sheet([
        cell(0, 0, "A"), cell(0, 1, "B"),
        cell(1, 0, selected=True), cell(1, 1, selected=True),
        cell(2, 0, focused=True),
    ]))
    assert observation.activeCell is not None
    assert (observation.activeCell.row, observation.activeCell.column) == (2, 0)
    assert len(observation.selection) == 2


def test_multiple_focused_cells_is_ambiguous_error() -> None:
    with pytest.raises(W1ObservationError, match="ambiguous active cell"):
        extract_w1_observation(sheet([cell(0, 0, focused=True), cell(1, 0, focused=True)]))


def test_name_box_formula_bar_and_tabs_zh() -> None:
    tree: dict[str, object] = {
        "role": "pane",
        "children": [
            {"role": "edit", "name": "名称框", "value": "B3"},
            {"role": "edit", "name": "编辑栏", "value": "王芳"},
            {"role": "tabItem", "name": "客户名单"},
            {"role": "tabItem", "name": "Sheet2"},
            sheet([cell(0, 0, "姓名"), cell(1, 0, focused=True)]),
        ],
    }
    observation = extract_w1_observation(tree)
    assert observation.nameBox == "B3"
    assert observation.formulaBar == "王芳"
    assert observation.sheetTabs == ("客户名单", "Sheet2")
    assert observation.headerRow == ("姓名",)


def test_edit_mode_surfaces_formula_bar_value() -> None:
    observation = extract_w1_observation(sheet([
        cell(0, 0, "Email"),
        cell(1, 0, focused=True, value="=SUM("),
    ]))
    # Edit mode is visible through the focused cell carrying the in-progress
    # text; the host pauses typing-derived actions on it (§4.1 handoff).
    assert observation.activeCell is not None
    assert observation.activeCell.value == "=SUM("


def test_empty_or_protected_sheet_is_explicit_not_silent() -> None:
    observation = extract_w1_observation({"role": "pane", "children": []})
    assert observation.usedRange is None
    assert any("no spreadsheet grid" in note for note in observation.notes)


def test_cell_without_coordinates_fails_typed() -> None:
    with pytest.raises(W1ObservationError, match="integer row/column"):
        extract_w1_observation(sheet([{"role": "cell", "name": "x"}]))


def test_bounds_flag_truncation() -> None:
    rows = [cell(0, 0, "H")]
    rows.append(cell(1001, 0, value="beyond cap"))
    observation = extract_w1_observation(sheet(rows))
    assert observation.truncated is True
    assert observation.usedRange == (1, 1)  # capped cell did not extend range


def test_unnamed_tab_is_reported_not_dropped_silently() -> None:
    observation = extract_w1_observation({
        "role": "pane",
        "children": [
            {"role": "tabItem"},
            sheet([cell(0, 0, "A")]),
        ],
    })
    assert any("without a name" in note for note in observation.notes)


def test_normalize_to_w1_composition() -> None:
    """B11/B12 acceptance: normalized trees carry grid fields and feed W-1."""
    from aifetchly_windows.normalize import normalize_ax_tree
    from aifetchly_windows.w1 import extract_w1_observation

    raw = {
        "role": "grid",
        "name": "Sheet1",
        "children": [
            {"role": "cell", "name": "Email", "row": 0, "column": 0},
            {"role": "cell", "name": "Phone", "row": 0, "column": 1},
            {"role": "cell", "value": "z@example.com", "row": 1, "column": 0, "focused": True},
        ],
    }
    normalized = normalize_ax_tree(raw)
    flat = [
        {
            "role": element.role,
            "name": element.name,
            "value": element.value,
            "row": element.row,
            "column": element.column,
            "selected": element.selected,
            "focused": element.focused,
        }
        for element in normalized.elements
    ]
    grid = {"role": "grid", "name": "Sheet1", "children": flat}
    observation = extract_w1_observation(grid)
    assert observation.headerRow == ("Email", "Phone")
    assert observation.usedRange == (2, 2)
    assert observation.activeCell is not None
    assert observation.activeCell.value == "z@example.com"


def test_bounded_walk_rejects_oversized_trees_b12() -> None:
    from aifetchly_windows.w1 import MAX_WALK_ELEMENTS, W1ObservationError, extract_w1_observation

    huge = {"role": "grid", "children": [{"role": "cell", "row": 0, "column": 0} for _ in range(MAX_WALK_ELEMENTS)]}
    with pytest.raises(W1ObservationError, match="observation bound"):
        extract_w1_observation(huge)


def test_authoritative_header_and_range_beat_observation_b12() -> None:
    # A scrolled view: observed rows start at 5, but the tree carries
    # authoritative headerRow/usedRange metadata.
    tree = {
        "role": "grid",
        "headerRow": ["Full Name", "Email"],
        "usedRange": [20, 2],
        "children": [
            {"role": "cell", "name": "Lead 0006", "row": 5, "column": 0},
            {"role": "cell", "name": "z@example.com", "row": 5, "column": 1},
        ],
    }
    observation = extract_w1_observation(tree)
    assert observation.headerRow == ("Full Name", "Email")
    assert observation.usedRange == (20, 2)
    assert not any("inferred" in note for note in observation.notes)
