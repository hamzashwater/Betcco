[CmdletBinding()]
param(
    [switch]$SkipFrontendBuild,
    [switch]$SkipDockerConfig
)

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $workspaceRoot "frontend"
$solutionPath = Join-Path $workspaceRoot "backend/Betcco.sln"

Push-Location $frontendRoot
try {
    pnpm install --frozen-lockfile
    pnpm format:check
    pnpm lint
    pnpm typecheck
    pnpm test
    if (-not $SkipFrontendBuild) {
        pnpm build
    }
}
finally {
    Pop-Location
}

dotnet tool restore
dotnet format $solutionPath --verify-no-changes
dotnet restore $solutionPath
dotnet build $solutionPath --no-restore
dotnet test $solutionPath --no-build --no-restore

if (-not $SkipDockerConfig) {
    Push-Location $workspaceRoot
    try {
        docker compose config --quiet
    }
    finally {
        Pop-Location
    }
}
