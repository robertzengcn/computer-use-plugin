"""Grounding prompt assembly (design §6.2 step 1, M04)."""

from __future__ import annotations

import pytest

from aifetchly_grounding.reference.prompt import (
    ASSISTANT_STARTER,
    SYSTEM_MESSAGE,
    PromptError,
    build_grounding_prompt,
    contains_single_pointer_span,
)


def test_prompt_carries_system_instruction_and_starter() -> None:
    prompt = build_grounding_prompt("Name Box in the formula bar area")
    assert prompt.system == SYSTEM_MESSAGE
    assert prompt.instruction == "Name Box in the formula bar area"
    assert prompt.assistant_starter == ASSISTANT_STARTER.format(
        "<|pointer_start|><|pointer_pad|><|pointer_end|>"
    )


def test_starter_has_exactly_one_ordered_pointer_span() -> None:
    assert contains_single_pointer_span(build_grounding_prompt("filter arrow"))


def test_instruction_validation() -> None:
    with pytest.raises(PromptError, match="non-empty"):
        build_grounding_prompt("   ")
    with pytest.raises(PromptError, match="1000-char"):
        build_grounding_prompt("x" * 1001)


def test_prompt_text_views_all_parts() -> None:
    prompt = build_grounding_prompt("电子邮件 header cell")
    text = prompt.prompt_text()
    assert SYSTEM_MESSAGE in text
    assert "电子邮件 header cell" in text
    assert "<|pointer_pad|>" in text
