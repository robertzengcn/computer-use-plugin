#!/usr/bin/env bash
# macOS packaging shim (design §5.1, §7.2): build/sign/notarize the selected
# native helper. Fails closed until the P0-E spike pins the source and the
# build/sign/notarize pipeline is wired on a Mac runner.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

status="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${repo_root}/adapters/macos/ghost-os/upstream.lock','utf8')).status)")"
if [ "$status" != "pinned" ]; then
  echo "packaging refused: adapters/macos/ghost-os/upstream.lock status is '${status}'; P0-E must pin the revision first" >&2
  exit 3
fi

echo "packaging/macos: build/sign/notarize pipeline pending the P0-E decision" >&2
exit 3
