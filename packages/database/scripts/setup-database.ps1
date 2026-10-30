# Creates the ResearchOS database from ResearchOS.sql and regenerates the
# Prisma client.
#
# The database is owned by the PostgreSQL container in docker-compose.yml, so
# this script no longer prompts for a superuser password. The credentials
# live in the compose file and in the root .env.
#
# Usage from the repository root:
#   pwsh packages/database/scripts/setup-database.ps1
#
# Optional parameters:
#   -KeepData  Do not drop the database. Apply the SQL to the existing one.
#
# The script is a thin wrapper around `pnpm --filter @researchos/database
# db:reset`. The work itself lives in packages/database/scripts/reset-database.mjs
# so that it runs the same way on every platform.

[CmdletBinding()]
param(
  [switch]$KeepData
)

$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host 'Checking that the Docker services are running ...'

$running = docker compose ps --status running --services 2>$null

if ($running -notcontains 'postgres') {
  Write-Host 'The postgres service is not running. Start it with:'
  Write-Host '  docker compose up -d'
  exit 1
}

Push-Location $workspaceRoot
try {
  if ($KeepData) {
    pnpm --filter @researchos/database db:reset -- --keep-data
  }
  else {
    pnpm --filter @researchos/database db:reset
  }

  if ($LASTEXITCODE -ne 0) {
    throw 'The database setup failed.'
  }
}
finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Done. The database is ready.'
