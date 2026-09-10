param(
  [switch]$StartInfrastructure
)

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host 'Created .env. Set local passwords and optional seed administrator values before continuing.'
}

if ($StartInfrastructure) {
  docker compose up -d postgres minio mailpit
}

Write-Host 'Install frontend packages with pnpm install in frontend, then run dotnet restore backend/Betcco.sln.'
