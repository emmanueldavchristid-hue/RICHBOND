# Installation du projet RICHBOND (a lancer une seule fois)
# Usage, dans PowerShell, depuis ce dossier :
#   powershell -ExecutionPolicy Bypass -File .\installer.ps1

$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot
Write-Host "=== Installation du projet RICHBOND ===" -ForegroundColor Cyan

# 1. Configuration Claude Code : config-claude -> .claude
if (Test-Path "config-claude") {
    if (Test-Path ".claude") {
        Copy-Item -Path "config-claude\*" -Destination ".claude" -Recurse -Force
        Remove-Item -Path "config-claude" -Recurse -Force
    } else {
        Rename-Item -Path "config-claude" -NewName ".claude"
    }
    Write-Host "[OK] Agents et commandes Claude Code installes dans .claude" -ForegroundColor Green
} elseif (Test-Path ".claude") {
    Write-Host "[OK] .claude deja en place" -ForegroundColor Green
}

# 2. Verification des outils
function Test-Tool($name, $cmd) {
    try { $v = & $cmd --version 2>$null | Select-Object -First 1; Write-Host "[OK] $name : $v" -ForegroundColor Green; return $true }
    catch { Write-Host "[MANQUANT] $name" -ForegroundColor Yellow; return $false }
}
$okNode = Test-Tool "Node.js" "node"
$okGit  = Test-Tool "Git" "git"
$okPsql = Test-Tool "PostgreSQL (psql)" "psql"
if (-not $okNode) { Write-Host "   -> Installer Node.js LTS : https://nodejs.org" -ForegroundColor Yellow }
if (-not $okPsql) { Write-Host "   -> Installer PostgreSQL 16 ou plus : https://www.postgresql.org/download/windows/ (retenir le mot de passe postgres)" -ForegroundColor Yellow }

# 3. Fichier .env
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[A FAIRE] .env cree : ouvre-le et remplace les valeurs 'a-remplacer' et MOT_DE_PASSE" -ForegroundColor Yellow
} else {
    Write-Host "[OK] .env existe deja" -ForegroundColor Green
}

# 4. Git et GitHub
if (-not $okGit) { Write-Host "Git manquant : arret." -ForegroundColor Red; exit 1 }
if (-not (git config --global user.name))  { git config --global user.name "Jason Mouhi" }
if (-not (git config --global user.email)) { git config --global user.email "emmanueldavchristid@gmail.com" }

if (-not (Test-Path ".git")) {
    git init -b main | Out-Null
    Write-Host "[OK] Depot Git initialise" -ForegroundColor Green
}
git add -A
$pending = git status --porcelain
if ($pending) {
    git commit -m "chore: cadrage du projet RICHBOND (specs, agents, plan des lots)" | Out-Null
    Write-Host "[OK] Premier commit cree" -ForegroundColor Green
}

$remote = "https://github.com/emmanueldavchristid-hue/RICHBOND.git"
$hasOrigin = (git remote) -contains "origin"
if (-not $hasOrigin) { git remote add origin $remote }

Write-Host "Envoi vers GitHub (une fenetre de connexion GitHub peut s'ouvrir)..." -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Le depot GitHub contient deja des fichiers : fusion puis nouvel envoi..." -ForegroundColor Yellow
    git pull origin main --allow-unrelated-histories --no-edit
    git push -u origin main
}
if ($LASTEXITCODE -eq 0) { Write-Host "[OK] Projet sauvegarde sur GitHub (prive)" -ForegroundColor Green }
else { Write-Host "[A FAIRE] Envoi GitHub non abouti : relance 'git push -u origin main' et note le message d'erreur" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=== Termine ===" -ForegroundColor Cyan
Write-Host "Prochaines etapes :"
Write-Host "  1. Remplir le fichier .env (voir docs\07-guide-de-travail.md)"
Write-Host "  2. Creer les bases : psql -U postgres -c ""CREATE DATABASE richbond;"" puis richbond_test"
Write-Host "  3. Lancer : claude   puis taper : /lots-auto"
