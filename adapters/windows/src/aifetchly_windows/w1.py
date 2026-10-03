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


MAX_WALK_ELEMENTS = 50_000
MAX_WALK_DEPTH = 128


def _walk(node: dict[str, object]) -> list[dict[str, object]]:
    """Depth- and element-bounded document-order traversal (B12): traversal
    STOPS at the limits instead of processing everything and flagging later."""
    elements: list[dict[str, object]] = []
    stack: list[tuple[dict[str, object], int]] = [(node, 0)]
    while stack:
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
            for child in children:
                if not isinstance(child, dict):
                    raise W1ObservationError("AX child node must be an object")
            # Reversed so the LIFO stack pops children in document order.
            stack.extend(
                reversed([(child, depth + 1) for child in children if isinstance(child, dict)])
            )
    return elements


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
            if not isinstance(row, int) or not isinstance(column, int):
                raise W1ObservationError("cell without integer row/column coordinates")
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
        )

    cells.sort(key=lambda cell: (cell.row, cell.column))
    max_row = max(cell.row for cell in cells)
    max_column = max(cell.column for cell in cells)
    first_row = min(cell.row for cell in cells)
    # B12: header and used range are distinguished as OBSERVED facts unless
    # the tree carries authoritative grid metadata; a scrolled view must not
    # masquerade as a verified header/used range.
    authoritative_range = root.get("usedRange") if isinstance(root.get("usedRange"), list) else None
    authoritative_header = root.get("headerRow") if isinstance(root.get("headerRow"), list) else None
    header_cells = [cell for cell in cells if cell.row == first_row]
    header_row = (
        tuple(name if isinstance(name, str) else None for name in authoritative_header)
        if authoritative_header is not None
        else tuple(
            next((cell.name for cell in header_cells if cell.column == index), None)
            for index in range(max_column + 1)
        )
    )
    if authoritative_header is None:
        notes.append(
            "header inferred from the first observed row; a scrolled view can mislabel it"
        )
    if authoritative_range is not None and len(authoritative_range) == 2:
        used_range = (int(authoritative_range[0]), int(authoritative_range[1]))
    else:
        used_range = (max_row - first_row + 1, max_column + 1)
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
    )
