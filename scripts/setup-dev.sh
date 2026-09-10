#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  cp .env.example .env
  echo 'Created .env. Set local passwords and optional seed administrator values before continuing.'
fi

if [ "${1:-}" = "--start-infrastructure" ]; then
  docker compose up -d postgres minio mailpit
fi

echo 'Install frontend packages with pnpm install in frontend, then run dotnet restore backend/Betcco.sln.'
