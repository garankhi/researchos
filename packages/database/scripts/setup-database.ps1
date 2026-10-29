# Creates the ResearchOS database and applies the initial Prisma migration.
#
# The script prompts for the PostgreSQL superuser password instead of taking it
# as an argument, so the password never lands in the shell history or in the
# process list.
#
# Usage from the repository root:
#   pwsh packages/database/scripts/setup-database.ps1
#
# Optional parameters:
#   -HostName     PostgreSQL host. Default: localhost
#   -Port         PostgreSQL port. Default: 5432
#   -User         PostgreSQL superuser. Default: postgres
#   -Database     Database to create. Default: researchos
#   -SkipMigrate  Create the database but do not run the migration.

[CmdletBinding()]
param(
  [string]$HostName = 'localhost',
  [int]$Port = 5432,
  [string]$User = 'postgres',
  [string]$Database = 'researchos',
  [switch]$SkipMigrate
)

$ErrorActionPreference = 'Stop'

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($candidate) {
    $psql = $candidate
  }
  else {
    throw 'psql was not found. Add PostgreSQL bin to PATH or install PostgreSQL.'
  }
}

$securePassword = Read-Host -Prompt "Password for PostgreSQL user '$User'" -AsSecureString
$env:PGPASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

try {
  Write-Host "Checking the connection to $User@$HostName`:$Port ..."
  & $psql.Source -U $User -h $HostName -p $Port -tAc 'SELECT 1' | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot connect to PostgreSQL as '$User'. Check the host, the port and the password."
  }

  $exists = & $psql.Source -U $User -h $HostName -p $Port -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
  if ($exists -match '1') {
    Write-Host "Database '$Database' already exists. Leaving it untouched."
  }
  else {
    Write-Host "Creating database '$Database' ..."
    & $psql.Source -U $User -h $HostName -p $Port -c "CREATE DATABASE `"$Database`"" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to create the database '$Database'."
    }
    Write-Host "Database '$Database' created."
  }

  $url = "postgresql://${User}:<password>@${HostName}:${Port}/${Database}?schema=public"
  Write-Host ''
  Write-Host 'Set the connection string in the root .env file:'
  Write-Host "  DATABASE_URL=`"$url`""
  Write-Host '(replace <password> with the password you just typed)'
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

if ($SkipMigrate) {
  Write-Host ''
  Write-Host 'Skipping the migration as requested.'
  exit 0
}

Write-Host ''
Write-Host 'Applying the migrations ....'
Push-Location (Join-Path $PSScriptRoot '..')
try {
  pnpm exec prisma migrate deploy
  if ($LASTEXITCODE -ne 0) {
    throw 'The migration failed.'
  }
}
finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Done. The database is ready.'