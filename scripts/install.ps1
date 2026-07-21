param(
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [Parameter(Mandatory = $true)][string]$InstallDir
)

$ErrorActionPreference = 'Stop'

Write-Host "  Copiando arquivos..." -ForegroundColor Cyan

if (Test-Path $InstallDir) {
  Remove-Item -LiteralPath $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# copia app
robocopy $SourceDir $InstallDir /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if (-not (Test-Path (Join-Path $InstallDir 'index.html'))) {
  throw "Falha ao copiar index.html"
}

# launcher na pasta de instalação
$launchBat = Join-Path $InstallDir 'INICIAR-DETONA.bat'
@"
@echo off
chcp 65001 >nul
title DETONA CONCURSOS
cd /d "%~dp0"
start "" "http://localhost:8765/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
"@ | Set-Content -LiteralPath $launchBat -Encoding ASCII

# atalho Area de Trabalho
$desktop = [Environment]::GetFolderPath('Desktop')
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut((Join-Path $desktop 'DETONA CONCURSOS.lnk'))
$sc.TargetPath = $launchBat
$sc.WorkingDirectory = $InstallDir
$sc.WindowStyle = 1
$sc.Description = 'DETONA CONCURSOS — PC/AL 2026'
$sc.Save()

# Menu Iniciar
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Detona Concursos'
New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
$sc2 = $wsh.CreateShortcut((Join-Path $startMenu 'DETONA CONCURSOS.lnk'))
$sc2.TargetPath = $launchBat
$sc2.WorkingDirectory = $InstallDir
$sc2.Description = 'DETONA CONCURSOS — PC/AL 2026'
$sc2.Save()

# desinstalador local
$uninst = Join-Path $InstallDir 'DESINSTALAR.bat'
@"
@echo off
chcp 65001 >nul
title Desinstalar DETONA CONCURSOS
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath '%LOCALAPPDATA%\DetonaConcursos' -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath ([Environment]::GetFolderPath('Desktop') + '\DETONA CONCURSOS.lnk') -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath (`$env:APPDATA + '\Microsoft\Windows\Start Menu\Programs\Detona Concursos') -Recurse -Force -ErrorAction SilentlyContinue; Write-Host 'Removido.'; pause"
"@ | Set-Content -LiteralPath $uninst -Encoding ASCII

Write-Host "  OK -> $InstallDir" -ForegroundColor Green
Write-Host "  Atalho criado na Area de Trabalho." -ForegroundColor Green
