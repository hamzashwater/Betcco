[CmdletBinding()]
param(
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $workspaceRoot ".env"

if (-not (Test-Path -LiteralPath $environmentFile)) {
    throw "Create .env from .env.example before starting the API."
}

# Load only this process's local development variables. Nothing is persisted to
# the user or machine environment, and .env remains ignored by Git.
foreach ($line in Get-Content -LiteralPath $environmentFile) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) { continue }
    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($parts[0])) { continue }
    Set-Item -Path "Env:$($parts[0].Trim())" -Value $parts[1]
}

$env:ASPNETCORE_ENVIRONMENT = "Development"
$projectPath = Join-Path $workspaceRoot "backend/src/Betcco.Api/Betcco.Api.csproj"
$arguments = @("run", "--project", $projectPath, "--urls", "http://localhost:5085")
if ($NoBuild) { $arguments += "--no-build" }
& dotnet @arguments
