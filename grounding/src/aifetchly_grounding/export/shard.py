"""External-data shard planning under the §6.4 producer limits.

A file at or under the shard ceiling stays whole; a larger file splits into
`.data.NNN` external-data pieces of at most 512 MiB. The plan counts EVERY
package file it produces (whole files and pieces alike) against the 128-file
ceiling, and total bytes against 8 GiB. Planning is pure arithmetic so limits
are enforceable and testable before any real bytes exist.
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

    @property
    def split(self) -> bool:
        """True when the file was split into external-data pieces."""
        return len(self.shards) > 1 or not self.shards[0][0].endswith(self.base_name)


def plan_shards(
    file_specs: list[tuple[str, int]],
    max_shard_bytes: int = MAX_SHARD_BYTES,
    max_file_bytes: int = MAX_FILE_BYTES,
    max_files: int = MAX_FILES,
    max_total_bytes: int = MAX_TOTAL_BYTES,
) -> list[ShardedFile]:
    """Plan the package file list for each (name, size) input under the limits."""
    if not file_specs:
        raise ShardingError("no files to shard")
    planned: list[ShardedFile] = []
    package_file_count = 0
    total = 0
    for name, size in file_specs:
        if size <= 0:
            raise ShardingError(f"{name}: size must be positive, got {size}")
        if size > max_file_bytes:
            raise ShardingError(f"{name}: {size} bytes exceeds the {max_file_bytes} per-file ceiling")
        if size <= max_shard_bytes:
            # Small files stay whole in the package; no external data needed.
            planned.append(ShardedFile(base_name=name, shards=((name, size),)))
            package_file_count += 1
        else:
            stem = name.removesuffix(".onnx")
            shards: list[tuple[str, int]] = []
            remaining = size
            index = 0
            while remaining > 0:
                piece = min(remaining, max_shard_bytes)
                shards.append((f"{stem}.data.{index:03d}", piece))
                remaining -= piece
                index += 1
            planned.append(ShardedFile(base_name=name, shards=tuple(shards)))
            package_file_count += len(shards)
        total += size
    if package_file_count > max_files:
        raise ShardingError(
            f"{package_file_count} package files exceed the {max_files}-file limit"
        )
    if total > max_total_bytes:
        raise ShardingError(f"{total} bytes exceed the {max_total_bytes} package ceiling")
    return planned
