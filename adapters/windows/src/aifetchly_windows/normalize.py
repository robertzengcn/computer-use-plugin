"""AX-tree normalization into the observation contract (design §4.1, §4.2).

Bounding is explicit: traversal that stops at depth/element limits sets
``truncated``; silent truncation is forbidden. Missing geometry is a typed
error, never a null-silence. CJK labels pass through untouched.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

MAX_ELEMENTS = 5000
MAX_DEPTH = 60


class NormalizationError(Exception):
    """The raw AX payload could not be normalized."""


@dataclass(frozen=True)
class AxElement:
    role: str
    name: str | None = None
    value: str | None = None
    frame: tuple[float, float, float, float] | None = None
    children: tuple[int, ...] = ()
    # Grid fields consumed by w1.extract_w1_observation (B11): preserved
    # through normalization so the two stages compose.
    row: int | None = None
    column: int | None = None
    selected: bool = False
    focused: bool = False


@dataclass(frozen=True)
class NormalizedAxTree:
    elements: tuple[AxElement, ...] = ()
    element_count: int = 0
    truncated: bool = False
    index_by_role: Mapping[str, tuple[int, ...]] = field(default_factory=dict)


def _parse_frame(raw: Any) -> tuple[float, float, float, float]:
    import math

    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        raise NormalizationError("frame must be [x, y, w, h]")
    try:
        x, y, w, h = (float(part) for part in raw)
    except (TypeError, ValueError) as error:
        raise NormalizationError(f"non-numeric frame values: {raw}") from error
    if any(math.isnan(value) or math.isinf(value) for value in (x, y, w, h)):
        raise NormalizationError(f"non-finite frame values: {raw}")
    if w <= 0 or h <= 0:
        raise NormalizationError(f"non-positive frame extent: {raw}")
    return (x, y, w, h)


def normalize_ax_tree(
    raw_root: Mapping[str, Any],
    max_elements: int = MAX_ELEMENTS,
    max_depth: int = MAX_DEPTH,
) -> NormalizedAxTree:
    """Bound an AX subtree into flat elements with an explicit truncation flag."""
    if not isinstance(raw_root, Mapping):
        raise NormalizationError("root must be an object")
    elements: list[AxElement] = []
    truncated = False

    def visit(node: Any, depth: int) -> int | None:
        nonlocal truncated
        if depth > max_depth:
            truncated = True
            return None
        if len(elements) >= max_elements:
            truncated = True
            return None
        if not isinstance(node, Mapping):
            raise NormalizationError("AX node must be an object")
        role = node.get("role")
        if not isinstance(role, str) or not role:
            raise NormalizationError("AX node missing role")
        frame_raw = node.get("frame")
        row_raw, column_raw = node.get("row"), node.get("column")
        # E11/E12: booleans are not valid grid coordinates (bool subclasses int).
        row = row_raw if isinstance(row_raw, int) and not isinstance(row_raw, bool) else None
        column = column_raw if isinstance(column_raw, int) and not isinstance(column_raw, bool) else None
        element = AxElement(
            role=role,
            name=node.get("name") if isinstance(node.get("name"), str) else None,
            value=node.get("value") if isinstance(node.get("value"), str) else None,
            frame=_parse_frame(frame_raw) if frame_raw is not None else None,
            row=row,
            column=column,
            selected=node.get("selected") is True,
            focused=node.get("focused") is True,
        )
        index = len(elements)
        elements.append(element)
        children_raw = node.get("children")
        if isinstance(children_raw, list):
            child_indices: list[int] = []
            for child in children_raw:
                # E11: stop sibling work once the output bound is reached so
                # traversal work/allocation stops at limits.
                if len(elements) >= max_elements:
                    truncated = True
                    break
                if not isinstance(child, Mapping):
                    raise NormalizationError("AX child node must be an object")
                child_index = visit(child, depth + 1)
                # Omit truncated references: only in-range integers survive.
                if child_index is not None:
                    child_indices.append(child_index)
            # Preserve the hierarchy so downstream consumers (w1) can walk
            # relationships instead of a flat soup (B11).
            elements[index] = AxElement(
                role=element.role,
                name=element.name,
                value=element.value,
                frame=element.frame,
                children=tuple(child_indices),
                row=element.row,
                column=element.column,
                selected=element.selected,
                focused=element.focused,
            )
        return index

    visit(raw_root, 0)

    by_role: dict[str, tuple[int, ...]] = {}
    for index, element in enumerate(elements):
        by_role.setdefault(element.role, ())
        by_role[element.role] = (*by_role[element.role], index)

    return NormalizedAxTree(
        elements=tuple(elements),
        element_count=len(elements),
        truncated=truncated,
        index_by_role=by_role,
    )


def normalized_to_dict_tree(tree: NormalizedAxTree, root_index: int = 0) -> dict[str, object]:
    """E11: real normalized-tree-to-W-1 interface.

    Expand the flat indexed representation back into the nested-dict shape
    ``w1.extract_w1_observation`` consumes, preserving hierarchy, headers,
    values, focus and selection. Child indices are validated in-range;
    ``None``/out-of-range references can never survive normalization after
    the E11 fix, but this asserts the invariant at the boundary.
    """
    if root_index < 0 or root_index >= len(tree.elements):
        raise NormalizationError(f"root index {root_index} out of range")
    memo: dict[int, dict[str, object]] = {}

    def expand(index: int) -> dict[str, object]:
        if index in memo:
            return memo[index]
        if index < 0 or index >= len(tree.elements):
            raise NormalizationError(f"child index {index} out of range")
        element = tree.elements[index]
        node: dict[str, object] = {"role": element.role}
        if element.name is not None:
            node["name"] = element.name
        if element.value is not None:
            node["value"] = element.value
        if element.row is not None:
            node["row"] = element.row
        if element.column is not None:
            node["column"] = element.column
        if element.selected:
            node["selected"] = True
        if element.focused:
            node["focused"] = True
        children: list[dict[str, object]] = []
        for child_index in element.children:
            if not isinstance(child_index, int) or isinstance(child_index, bool):
                raise NormalizationError(f"invalid child reference {child_index!r}")
            if child_index < 0 or child_index >= len(tree.elements):
                raise NormalizationError(f"child index {child_index} out of range")
            children.append(expand(child_index))
        if children:
            node["children"] = children
        memo[index] = node
        return node

    return expand(root_index)
