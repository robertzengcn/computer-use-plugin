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


@dataclass(frozen=True)
class NormalizedAxTree:
    elements: tuple[AxElement, ...] = ()
    element_count: int = 0
    truncated: bool = False
    index_by_role: Mapping[str, tuple[int, ...]] = field(default_factory=dict)


def _parse_frame(raw: Any) -> tuple[float, float, float, float]:
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        raise NormalizationError("frame must be [x, y, w, h]")
    try:
        x, y, w, h = (float(part) for part in raw)
    except (TypeError, ValueError) as error:
        raise NormalizationError(f"non-finite frame values: {raw}") from error
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

    def visit(node: Any, depth: int) -> None:
        nonlocal truncated
        if len(elements) >= max_elements:
            truncated = True
            return
        if depth > max_depth:
            truncated = True
            return
        if not isinstance(node, Mapping):
            raise NormalizationError("AX node must be an object")
        role = node.get("role")
        if not isinstance(role, str) or not role:
            raise NormalizationError("AX node missing role")
        frame_raw = node.get("frame")
        element = AxElement(
            role=role,
            name=node.get("name") if isinstance(node.get("name"), str) else None,
            value=node.get("value") if isinstance(node.get("value"), str) else None,
            frame=_parse_frame(frame_raw) if frame_raw is not None else None,
        )
        elements.append(element)
        children_raw = node.get("children")
        if isinstance(children_raw, list):
            for child in children_raw:
                visit(child, depth + 1)

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
