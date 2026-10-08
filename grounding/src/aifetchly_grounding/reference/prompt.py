"""GUI-Actor grounding prompt assembly (design §6.2, step 1).

Builds the chat prompt for placeholder-mode inference: system grounding
message, the image, the user instruction, and the assistant starter carrying
the pointer token sequence. Pure string assembly over the model's chat
template markers — the tokenizer runs in the pinned model environment; this
module is the reviewable contract for what the prompt must contain and is
unit-tested without torch.
"""

from __future__ import annotations

from dataclasses import dataclass

SYSTEM_MESSAGE = (
    "You are a GUI agent. You are given a task and a screenshot. "
    "Output the action to perform."
)
ASSISTANT_STARTER = "<|recipient|>os\npyautogui.click({})"
POINTER_TOKENS = "<|pointer_start|><|pointer_pad|><|pointer_end|>"


class PromptError(Exception):
    """Invalid prompt inputs."""


@dataclass(frozen=True)
class GroundingPrompt:
    system: str
    instruction: str
    assistant_starter: str

    def prompt_text(self) -> str:
        """Canonical text view (chat markers are tokenizer-level detail)."""
        return f"{self.system}\n{self.instruction}\n{self.assistant_starter}"


def build_grounding_prompt(instruction: str) -> GroundingPrompt:
    """Assemble the §6.2 prompt for a grounding instruction.

    One forward pass, no token-by-token generation: the assistant starter is
    fixed and carries exactly one pointer span for the pointer head to read.
    """
    if not isinstance(instruction, str) or not instruction.strip():
        raise PromptError("instruction must be a non-empty string")
    if len(instruction) > 1000:
        raise PromptError(f"instruction exceeds the 1000-char bound ({len(instruction)} chars)")
    return GroundingPrompt(
        system=SYSTEM_MESSAGE,
        instruction=instruction,
        assistant_starter=ASSISTANT_STARTER.format(POINTER_TOKENS),
    )


def contains_single_pointer_span(prompt: GroundingPrompt) -> bool:
    """The starter must carry exactly one pointer span (pointer head input)."""
    starter = prompt.assistant_starter
    return (
        starter.count("<|pointer_start|>") == 1
        and starter.count("<|pointer_pad|>") == 1
        and starter.count("<|pointer_end|>") == 1
        and starter.index("<|pointer_start|>") < starter.index("<|pointer_pad|>") < starter.index("<|pointer_end|>")
    )
