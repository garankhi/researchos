param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'ResearchOS.sql'),
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$previousOutput = $env:RESEARCHOS_SCHEMA_OUTPUT
Push-Location $PSScriptRoot
try {
    $env:RESEARCHOS_SCHEMA_OUTPUT = $resolvedOutput
    if ($CheckOnly) {
        & pnpm --package=@dbml/cli@11.0.0 dlx -c 'node schema-tools.cjs --check'
    } else {
        & pnpm --package=@dbml/cli@11.0.0 dlx -c 'node schema-tools.cjs'
    }
    if ($LASTEXITCODE -ne 0) { throw 'Official DBML editor validation/v2 export failed.' }
} finally {
    $env:RESEARCHOS_SCHEMA_OUTPUT = $previousOutput
    Pop-Location
}
