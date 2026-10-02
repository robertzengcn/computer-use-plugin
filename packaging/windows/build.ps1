# Windows packaging shim (design §7.2). Thin, versioned wrapper: the real
# verification logic lives in TypeScript tooling so it runs identically in CI
# on any OS. Fails closed while the backend pin is unresolved.
#
# Usage: pwsh packaging/windows/build.ps1 [-Version <semver>]
param(
    [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot | Split-Path -Parent

$lockPath = Join-Path $repoRoot "adapters/windows/upstream.lock"
$lock = Get-Content $lockPath -Raw | ConvertFrom-Json
if ($lock.status -ne "pinned") {
    Write-Error ("packaging refused: adapters/windows/upstream.lock status is '{0}'; P0-C must pin the revision first" -f $lock.status)
    exit 3
}

# Assembly is implemented by the TypeScript tooling; this shim stays thin.
node (Join-Path $repoRoot "dist/tooling/cli.js") package:build --target win32-x64
exit $LASTEXITCODE
