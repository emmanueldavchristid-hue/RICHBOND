<#
.SYNOPSIS
  Restauration d'une sauvegarde PostgreSQL (LOT-18). Remplace les données de la base cible : arrêter l'application avant.
.EXAMPLE
  .\scripts\restore.ps1 -File .\backups\richbond_20261029_020000.dump
.NOTES
  Connexion : DATABASE_URL ou PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD (voir backup.ps1). PG_BIN facultatif.
  Tester d'abord sur une base vide en changeant DATABASE_URL.
#>
param(
  [Parameter(Mandatory = $true)][string]$File,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $File)) { throw "Fichier introuvable : $File" }
if (-not $Force) {
  $ans = Read-Host "Cette opération REMPLACE les données de la base cible. Continuer (oui/non)"
  if ($ans -ne 'oui') { Write-Output 'Annulé.'; exit 1 }
}
$bin = if ($env:PG_BIN) { $env:PG_BIN } else { '' }
$pgRestore = if ($bin) { Join-Path $bin 'pg_restore.exe' } else { 'pg_restore' }

if ($env:DATABASE_URL) {
  $u = [System.Uri]($env:DATABASE_URL -replace '\?.*$', '')
  $cred = $u.UserInfo.Split(':', 2)
  $env:PGUSER = [System.Uri]::UnescapeDataString($cred[0])
  if ($cred.Length -gt 1) { $env:PGPASSWORD = [System.Uri]::UnescapeDataString($cred[1]) }
  $env:PGHOST = $u.Host
  $env:PGPORT = if ($u.Port -gt 0) { "$($u.Port)" } else { '5432' }
  $env:PGDATABASE = $u.AbsolutePath.TrimStart('/')
}

& $pgRestore --list "$File" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "L'archive $File est illisible." }
& $pgRestore --clean --if-exists --no-owner --single-transaction --dbname="$env:PGDATABASE" "$File"
if ($LASTEXITCODE -ne 0) { throw "pg_restore a échoué (code $LASTEXITCODE)." }
Write-Output "Restauration terminée depuis $File. Redémarrer l'application puis vérifier la connexion et le stock."
