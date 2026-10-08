"""Bounded W-1 Excel observations over a UI Automation tree (design §4.1).

Extracts the host-visible observation records the PRD requires — header row,
bounded used range, active cell, selection, sheet tabs, Name Box and formula
bar — from a generic AX element tree. Pure logic over the normalized shapes
``normalize.py`` produces, so it is testable everywhere; the live UIA walk is
the pinned-backend concern (P0-C/P1). Caps are explicit and every ambiguity
is a typed state, never a guess.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .normalize import AxElement
from .normalize import NormalizedAxTree as NAT

MAX_ROWS = 1000
MAX_COLUMNS = 64
MAX_TABS = 64

NAME_BOX_LABELS = {"Name Box", "名称框"}
FORMULA_BAR_LABELS = {"Formula Bar", "编辑栏"}
SHEET_TAB_ROLE = "tabItem"


class W1ObservationError(Exception):
    """The AX tree does not carry a usable W-1 spreadsheet structure."""


@dataclass(frozen=True)
class W1Cell:
    row: int
    column: int
    name: str | None = None
    value: str | None = None
    selected: bool = False
    focused: bool = False


@dataclass(frozen=True)
class W1Observation:
    headerRow: tuple[str | None, ...] = ()
    usedRange: tuple[int, int] | None = None  # (rows, columns), bounded
    activeCell: W1Cell | None = None
    selection: tuple[W1Cell, ...] = ()
    sheetTabs: tuple[str, ...] = ()
    nameBox: str | None = None
    formulaBar: str | None = None
    elementCount: int = 0
    truncated: bool = False
    notes: tuple[str, ...] = field(default=())
    # E12: explicit provenance so scrolled views cannot masquerade as verified
    # grid metadata. 'authoritative' means the tree carried verified grid
    # metadata; 'observed' means derived from visible cells; 'unavailable'
    # means no grid was observed.
    headerProvenance: str = "unavailable"
    rangeProvenance: str = "unavailable"


MAX_WALK_ELEMENTS = 50_000
MAX_WALK_DEPTH = 128


def _walk(node: dict[str, object]) -> list[dict[str, object]]:
    """Depth- and element-bounded document-order traversal (B12): traversal
    STOPS at the limits instead of processing everything and flagging later."""
    elements: list[dict[str, object]] = []
    stack: list[tuple[dict[str, object], int]] = [(node, 0)]
    while stack:
        # E12: bound total allocation before expanding. A very wide node must
        # not queue unbounded children before the element limit can stop it.
        if len(elements) + len(stack) >= MAX_WALK_ELEMENTS:
            raise W1ObservationError(f"AX tree exceeds the {MAX_WALK_ELEMENTS}-element observation bound")
        current, depth = stack.pop()
        if not isinstance(current, dict):
            raise W1ObservationError("AX node must be an object")
        if depth > MAX_WALK_DEPTH:
            raise W1ObservationError(f"AX tree exceeds depth {MAX_WALK_DEPTH}")
        elements.append(current)
        if len(elements) >= MAX_WALK_ELEMENTS:
            raise W1ObservationError(f"AX tree exceeds the {MAX_WALK_ELEMENTS}-element observation bound")
        children = current.get("children")
        if isinstance(children, list):
            # E12: per-node fan-out bound prevents a single malicious/buggy
            # node from allocating unbounded memory in one step.
            if len(children) > MAX_WALK_ELEMENTS:
                raise W1ObservationError(
                    f"AX node has {len(children)} children, exceeding the {MAX_WALK_ELEMENTS}-element bound"
                )
            if len(elements) + len(stack) + len(children) > MAX_WALK_ELEMENTS:
                raise W1ObservationError(
                    f"AX tree exceeds the {MAX_WALK_ELEMENTS}-element observation bound"
                )
            for child in children:
                if not isinstance(child, dict):
                    raise W1ObservationError("AX child node must be an object")
            # Reversed so the LIFO stack pops children in document order.
            stack.extend(
                reversed([(child, depth + 1) for child in children if isinstance(child, dict)])
            )
    return elements


def _is_int_coordinate(value: object) -> bool:
    """E12: booleans are not valid coordinates (bool subclasses int)."""
    return isinstance(value, int) and not isinstance(value, bool)


def extract_w1_observation(root: dict[str, object]) -> W1Observation:
    """Extract bounded W-1 records from an Excel AX subtree."""
    if not isinstance(root, dict):
        raise W1ObservationError("root must be an object")
    elements = _walk(root)
    truncated = len(elements) > MAX_ROWS * MAX_COLUMNS

    cells: list[W1Cell] = []
    sheet_tabs: list[str] = []
    name_box: str | None = None
    formula_bar: str | None = None
    notes: list[str] = []

    for element in elements:
        role = element.get("role")
        name = element.get("name") if isinstance(element.get("name"), str) else None
        value = element.get("value") if isinstance(element.get("value"), str) else None
        if role == "cell":
            row = element.get("row")
            column = element.get("column")
            if not _is_int_coordinate(row) or not _is_int_coordinate(column):
                raise W1ObservationError("cell without integer row/column coordinates")
            assert isinstance(row, int) and isinstance(column, int)
            if row < 0 or column < 0:
                raise W1ObservationError(f"negative cell coordinate ({row}, {column})")
            if row >= MAX_ROWS or column >= MAX_COLUMNS:
                truncated = True
                continue
            cells.append(
                W1Cell(
                    row=row,
                    column=column,
                    name=name,
                    value=value,
                    selected=element.get("selected") is True,
                    focused=element.get("focused") is True,
                )
            )
        elif role == SHEET_TAB_ROLE:
            if name is None:
                notes.append("sheet tab without a name was skipped")
                continue
            if len(sheet_tabs) >= MAX_TABS:
                truncated = True
                continue
            sheet_tabs.append(name)
        elif role in {"edit", "document"}:
            if name in NAME_BOX_LABELS and name_box is None:
                name_box = value
            elif name in FORMULA_BAR_LABELS and formula_bar is None:
                formula_bar = value

    if not cells:
        # No grid cells: an explicit empty/protected state, not a silent pass.
        return W1Observation(
            sheetTabs=tuple(sheet_tabs),
            nameBox=name_box,
            formulaBar=formula_bar,
            elementCount=len(elements),
            truncated=truncated,
            notes=tuple(notes) + ("no spreadsheet grid observed (empty or protected view)",),
            headerProvenance="unavailable",
            rangeProvenance="unavailable",
        )

    cells.sort(key=lambda cell: (cell.row, cell.column))
    max_row = max(cell.row for cell in cells)
    max_column = max(cell.column for cell in cells)
    first_row = min(cell.row for cell in cells)
    # B12/E12: header and used range are distinguished as OBSERVED facts unless
    # the tree carries authoritative grid metadata; a scrolled view must not
    # masquerade as a verified header/used range. Provenance is explicit, not
    # free-text only.
    authoritative_range_raw = root.get("usedRange")
    authoritative_header_raw = root.get("headerRow")
    authoritative_range: list[object] | None = (
        authoritative_range_raw if isinstance(authoritative_range_raw, list) else None
    )
    authoritative_header: list[object] | None = (
        authoritative_header_raw if isinstance(authoritative_header_raw, list) else None
    )
    if authoritative_range is not None:
        if len(authoritative_range) != 2 or not all(_is_int_coordinate(v) for v in authoritative_range):
            raise W1ObservationError("authoritative usedRange must be [rows, columns] integers")
        assert isinstance(authoritative_range[0], int) and isinstance(authoritative_range[1], int)
        rows, cols = authoritative_range[0], authoritative_range[1]
        if rows <= 0 or cols <= 0 or rows > MAX_ROWS or cols > MAX_COLUMNS:
            raise W1ObservationError(f"authoritative usedRange out of bounds: [{rows}, {cols}]")
    if authoritative_header is not None:
        for entry in authoritative_header:
            if entry is not None and not isinstance(entry, str):
                raise W1ObservationError("authoritative headerRow entries must be strings or null")
        if len(authoritative_header) > MAX_COLUMNS:
            raise W1ObservationError("authoritative headerRow exceeds column bound")
    header_cells = [cell for cell in cells if cell.row == first_row]
    if authoritative_header is not None:
        header_row = tuple(entry if isinstance(entry, str) else None for entry in authoritative_header)
        header_provenance = "authoritative"
    else:
        header_row = tuple(
            next((cell.name for cell in header_cells if cell.column == index), None)
            for index in range(max_column + 1)
        )
        header_provenance = "observed"
        notes.append(
            "header inferred from the first observed row; a scrolled view can mislabel it"
        )
    if authoritative_range is not None:
        assert isinstance(authoritative_range[0], int) and isinstance(authoritative_range[1], int)
        used_range = (authoritative_range[0], authoritative_range[1])
        range_provenance = "authoritative"
    else:
        used_range = (max_row - first_row + 1, max_column + 1)
        range_provenance = "observed"
        notes.append("used range derived from observed extents, not verified grid metadata")
    focused = [cell for cell in cells if cell.focused]
    if len(focused) > 1:
        raise W1ObservationError("multiple focused cells: ambiguous active cell")
    selected = tuple(cell for cell in cells if cell.selected)

    return W1Observation(
        headerRow=header_row,
        usedRange=used_range,
        activeCell=focused[0] if focused else None,
        selection=selected,
        sheetTabs=tuple(sheet_tabs),
        nameBox=name_box,
        formulaBar=formula_bar,
        elementCount=len(elements),
        truncated=truncated,
        notes=tuple(notes),
        headerProvenance=header_provenance,
        rangeProvenance=range_provenance,
    )


def extract_w1_from_normalized(tree: object) -> W1Observation:
    """E11: run a nontrivial normalized AX tree through W-1 extraction.

    Accepts a ``NormalizedAxTree`` (or its ``dataclasses.asdict`` form with
    ``elements`` list) and returns the W-1 observation, preserving hierarchy,
    headers, values, focus and selection. This is the tested composition path:
    normalize -> indexed tree -> nested dicts -> W-1.
    """
    from .normalize import normalized_to_dict_tree

    if isinstance(tree, NAT):
        nested = normalized_to_dict_tree(tree)
        # Preserve authoritative grid metadata if the original root carried it:
        # normalized elements drop unknown keys, so callers needing verified
        # ranges must pass them via the nested root explicitly.
        return extract_w1_observation(nested)
    if isinstance(tree, dict):
        # dataclasses.asdict(NormalizedAxTree) form: elements carry indexed
        # children; rebuild the nested root from index 0.
        elements_raw = tree.get("elements")
        if isinstance(elements_raw, list) and elements_raw:
            rebuilt: list[AxElement] = []
            for el in elements_raw:
                if not isinstance(el, dict):
                    raise W1ObservationError("normalized elements must be objects")
                role = el.get("role")
                if not isinstance(role, str):
                    raise W1ObservationError("normalized element missing role")
                children_raw = el.get("children", ())
                children: tuple[int, ...] = ()
                if isinstance(children_raw, (list, tuple)):
                    validated: list[int] = []
                    for c in children_raw:
                        if not isinstance(c, int) or isinstance(c, bool):
                            raise W1ObservationError(f"invalid child reference {c!r}")
                        validated.append(c)
                    children = tuple(validated)
                row = el.get("row")
                col = el.get("column")
                rebuilt.append(
                    AxElement(
                        role=role,
                        name=el.get("name") if isinstance(el.get("name"), str) else None,
                        value=el.get("value") if isinstance(el.get("value"), str) else None,
                        frame=None,
                        children=children,
                        row=row if isinstance(row, int) and not isinstance(row, bool) else None,
                        column=col if isinstance(col, int) and not isinstance(col, bool) else None,
                        selected=el.get("selected") is True,
                        focused=el.get("focused") is True,
                    )
                )
            nat = NAT(elements=tuple(rebuilt), element_count=len(rebuilt), truncated=bool(tree.get("truncated", False)))
            nested = normalized_to_dict_tree(nat)
            return extract_w1_observation(nested)
    raise W1ObservationError("extract_w1_from_normalized requires a NormalizedAxTree")
