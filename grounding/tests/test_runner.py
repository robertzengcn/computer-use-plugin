"""Reference runner boundary: lazy toolchain import fails typed (design §2.5)."""

from __future__ import annotations

import pytest

from aifetchly_grounding.reference.runner import MissingToolchainError, require_reference_toolchain


def test_missing_torch_fails_typed_not_importerror() -> None:
    # The model engineering environment is intentionally not installed in this
    # scaffold; if torch happens to be present the requirement simply passes.
    try:
        require_reference_toolchain()
        pytest.skip("pinned toolchain present; typed failure path not reachable")
    except MissingToolchainError as error:
        assert "P0-D" in str(error) or "model engineering environment" in str(error)
