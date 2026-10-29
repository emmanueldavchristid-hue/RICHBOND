<#
.SYNOPSIS
  Sauvegarde quotidienne PostgreSQL (LOT-18). Aucun mot de passe en dur.
.DESCRIPTION
  Connexion : variable d'environnement DATABASE_URL (postgresql://utilisateur:motdepasse@hote:5432/base),
  sinon variables PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD (ou fichier %APPDATA%\postgresql\pgpass.conf).
  Variables facultatives : BACKUP_DIR (défaut .\backups), BACKUP_RETENTION_DAYS (défaut 30), PG_BIN (dossier bin de PostgreSQL).
  Planification : Planificateur de tâches, une fois par jour, action
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\richbond\scripts\backup.ps1
#>
$ErrorActionPreference = 'Stop'

$dir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { '.\backups' }
$retention = if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 30 }
$bin = if ($env:PG_BIN) { $env:PG_BIN } else { '' }
$pgDump = if ($bin) { Join-Path $bin 'pg_dump.exe' } else { 'pg_dump' }
$pgRestore = if ($bin) { Join-Path $bin 'pg_restore.exe' } else { 'pg_restore' }

New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$file = Join-Path $dir "richbond_$stamp.dump"

if ($env:DATABASE_URL) {
  # Décompose l'URL : le mot de passe passe par PGPASSWORD (jamais sur la ligne de commande).
  $u = [System.Uri]($env:DATABASE_URL -replace '\?.*$', '')
  $cred = $u.UserInfo.Split(':', 2)
  $env:PGUSER = [System.Uri]::UnescapeDataString($cred[0])
  if ($cred.Length -gt 1) { $env:PGPASSWORD = [System.Uri]::UnescapeDataString($cred[1]) }
  $env:PGHOST = $u.Host
  $env:PGPORT = if ($u.Port -gt 0) { "$($u.Port)" } else { '5432' }
  $env:PGDATABASE = $u.AbsolutePath.TrimStart('/')
}

& $pgDump --format=custom --no-owner --file="$file"
if ($LASTEXITCODE -ne 0) { throw "pg_dump a échoué (code $LASTEXITCODE)." }

# Contrôle : l'archive doit être lisible.
& $pgRestore --list "$file" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "L'archive $file est illisible." }

# Rétention.
Get-ChildItem -Path $dir -Filter 'richbond_*.dump' -File |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$retention) } |
  Remove-Item -Force

$size = [math]::Round((Get-Item $file).Length / 1MB, 2)
Write-Output "$(Get-Date -Format s) Sauvegarde OK : $file ($size Mo)"
