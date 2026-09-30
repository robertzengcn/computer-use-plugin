"""Shard planning under §6.4 producer limits."""

from __future__ import annotations

import pytest

from aifetchly_grounding.export.shard import (
    MAX_SHARD_BYTES,
    ShardingError,
    plan_shards,
)

MIB = 1024 * 1024


def test_small_file_stays_whole() -> None:
    # E-9 regression: files under the shard ceiling are package files
    # themselves; they are not renamed into external-data pieces.
    planned = plan_shards([("pointer_head.onnx", 512)])
    assert planned[0].shards == (("pointer_head.onnx", 512),)
    assert planned[0].split is False


def test_exact_shard_boundary_stays_whole() -> None:
    planned = plan_shards([("decoder_prefill.onnx", MAX_SHARD_BYTES)])
    assert planned[0].shards == (("decoder_prefill.onnx", MAX_SHARD_BYTES),)


def test_oversize_file_splits_into_512mib_shards() -> None:
    size = MAX_SHARD_BYTES + 1
    planned = plan_shards([("vision_encoder.onnx", size)])
    shards = planned[0].shards
    assert [s for _, s in shards] == [MAX_SHARD_BYTES, 1]
    assert [n for n, _ in shards] == ["vision_encoder.data.000", "vision_encoder.data.001"]


def test_per_file_ceiling_rejected() -> None:
    with pytest.raises(ShardingError, match="per-file ceiling"):
        plan_shards([("huge.onnx", 1024 * MIB + 1)])


def test_file_count_ceiling_counts_every_package_file() -> None:
    # E-9 regression: whole files, not just .data pieces, count against the
    # 128-file package limit (§6.4). 127 whole files + one file split into
    # 2 pieces = 129 package files > 128.
    specs = [(f"f{i:03d}.bin", MIB) for i in range(127)]
    specs.append(("big.onnx", MAX_SHARD_BYTES + 1))
    with pytest.raises(ShardingError, match="package files exceed"):
        plan_shards(specs)


def test_boundary_128_package_files_passes() -> None:
    specs = [(f"f{i:03d}.bin", MIB) for i in range(127)]
    specs.append(("edge.onnx", MAX_SHARD_BYTES + 1))  # 127 + 1 piece = 128
    # edge.onnx just over the ceiling would split into 2 pieces -> 129; use
    # exactly MAX_SHARD_BYTES so it stays whole: 128 package files.
    specs[-1] = ("edge.onnx", MAX_SHARD_BYTES)
    planned = plan_shards(specs)
    assert len(planned) == 128


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
