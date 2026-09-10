[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $workspaceRoot ".env"

if (-not (Test-Path -LiteralPath $environmentFile)) {
    throw "Create .env from .env.example before applying migrations."
}

foreach ($line in Get-Content -LiteralPath $environmentFile) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) { continue }
    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($parts[0])) { continue }
    Set-Item -Path "Env:$($parts[0].Trim())" -Value $parts[1]
}

$env:ASPNETCORE_ENVIRONMENT = "Development"
Push-Location $workspaceRoot
try {
    dotnet tool run dotnet-ef database update --project backend/src/Betcco.Infrastructure --startup-project backend/src/Betcco.Api
}
finally {
    Pop-Location
}
