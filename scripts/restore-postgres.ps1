param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)

if (-not (Test-Path -LiteralPath $BackupPath)) {
  throw "Backup file not found: $BackupPath"
}

Write-Warning 'This restores over target database. Verify DATABASE_URL points to intended non-production test target first.'
& pg_restore --clean --if-exists --no-owner --dbname $DatabaseUrl $BackupPath
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE"
}
