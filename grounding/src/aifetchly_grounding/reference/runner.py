"""Reference inference wrapper boundary.

The torch/transformers stack is imported lazily: on machines without the
pinned model engineering environment (CI smoke, contract developers) the
runner fails with a typed error instead of an ImportError traceback
(design §2.5: model engineers opt into the heavy environment).
"""

from __future__ import annotations


class MissingToolchainError(Exception):
    """The pinned model engineering environment is not installed here."""


class MissingWeightsError(Exception):
    """Approved weights are not present in the configured cache."""


def require_reference_toolchain() -> None:
    """Raise unless the pinned torch stack is importable."""
    try:
        import torch  # noqa: F401
    except ImportError as error:
        raise MissingToolchainError(
            "reference runner needs the pinned model engineering environment "
            "(uv sync in grounding/ after the P0-D spike pins it)"
        ) from error
