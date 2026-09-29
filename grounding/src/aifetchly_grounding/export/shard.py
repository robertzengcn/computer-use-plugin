"""External-data shard planning under the §6.4 producer limits.

Shards are at most 512 MiB, every file at most 1 GiB, at most 128 files and
8 GiB total. Planning is pure arithmetic so limits are enforceable and
testable before any real bytes exist.
"""

from __future__ import annotations

from dataclasses import dataclass

MAX_SHARD_BYTES = 512 * 1024 * 1024
MAX_FILE_BYTES = 1024 * 1024 * 1024
MAX_FILES = 128
MAX_TOTAL_BYTES = 8 * 1024 * 1024 * 1024


class ShardingError(Exception):
    """The requested file set cannot satisfy the producer limits."""


@dataclass(frozen=True)
class ShardedFile:
    base_name: str
    shards: tuple[tuple[str, int], ...]

    @property
    def total_bytes(self) -> int:
        return sum(size for _, size in self.shards)


def plan_shards(
    file_specs: list[tuple[str, int]],
    max_shard_bytes: int = MAX_SHARD_BYTES,
    max_file_bytes: int = MAX_FILE_BYTES,
    max_files: int = MAX_FILES,
    max_total_bytes: int = MAX_TOTAL_BYTES,
) -> list[ShardedFile]:
    """Plan shard splits for each (name, size) input under the limits."""
    if not file_specs:
        raise ShardingError("no files to shard")
    planned: list[ShardedFile] = []
    shard_count = 0
    total = 0
    for name, size in file_specs:
        if size <= 0:
            raise ShardingError(f"{name}: size must be positive, got {size}")
        if size > max_file_bytes:
            raise ShardingError(f"{name}: {size} bytes exceeds the {max_file_bytes} per-file ceiling")
        stem = name.removesuffix(".onnx")
        shards: list[tuple[str, int]] = []
        remaining = size
        index = 0
        while remaining > 0:
            piece = min(remaining, max_shard_bytes)
            shards.append((f"{stem}.data.{index:03d}", piece))
            remaining -= piece
            index += 1
        shard_count += len(shards)
        total += size
        planned.append(ShardedFile(base_name=name, shards=tuple(shards)))
    if shard_count > max_files:
        raise ShardingError(f"{shard_count} shards exceed the {max_files}-file package limit")
    if total > max_total_bytes:
        raise ShardingError(f"{total} bytes exceed the {max_total_bytes} package ceiling")
    return planned
