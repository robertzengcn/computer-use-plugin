"""Shard planning under §6.4 producer limits."""

from __future__ import annotations

import pytest

from aifetchly_grounding.export.shard import (
    MAX_SHARD_BYTES,
    ShardingError,
    plan_shards,
)

MIB = 1024 * 1024


def test_small_file_gets_single_shard() -> None:
    planned = plan_shards([("pointer_head.onnx", 512)])
    assert planned[0].shards == (("pointer_head.data.000", 512),)


def test_exact_shard_boundary_is_not_split_further() -> None:
    planned = plan_shards([("decoder_prefill.onnx", MAX_SHARD_BYTES)])
    assert planned[0].shards == (("decoder_prefill.data.000", MAX_SHARD_BYTES),)


def test_oversize_file_splits_into_512mib_shards() -> None:
    size = MAX_SHARD_BYTES + 1
    planned = plan_shards([("vision_encoder.onnx", size)])
    shards = planned[0].shards
    assert [s for _, s in shards] == [MAX_SHARD_BYTES, 1]
    assert [n for n, _ in shards] == ["vision_encoder.data.000", "vision_encoder.data.001"]


def test_per_file_ceiling_rejected() -> None:
    with pytest.raises(ShardingError, match="per-file ceiling"):
        plan_shards([("huge.onnx", 1024 * MIB + 1)])


def test_file_count_ceiling_rejected() -> None:
    specs = [(f"f{i:03d}.onnx", MIB) for i in range(129)]
    with pytest.raises(ShardingError, match="file package limit"):
        plan_shards(specs)


def test_total_bytes_ceiling_rejected() -> None:
    specs = [(f"f{i:03d}.onnx", 65 * MIB) for i in range(128)]  # 8320 MiB > 8 GiB, 128 shards ok
    with pytest.raises(ShardingError, match="package ceiling"):
        plan_shards(specs)


def test_non_positive_size_rejected() -> None:
    with pytest.raises(ShardingError, match="positive"):
        plan_shards([("x.onnx", 0)])


def test_empty_input_rejected() -> None:
    with pytest.raises(ShardingError, match="no files"):
        plan_shards([])
