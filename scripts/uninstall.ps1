$ErrorActionPreference = 'SilentlyContinue'

$installDir = Join-Path $env:LOCALAPPDATA 'DetonaConcursos'
$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DETONA CONCURSOS.lnk'
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Detona Concursos'

if (Test-Path $installDir) {
  Remove-Item -LiteralPath $installDir -Recurse -Force
  Write-Host "  Pasta removida: $installDir" -ForegroundColor Yellow
} else {
  Write-Host "  Pasta de instalacao nao encontrada (ja removida?)." -ForegroundColor DarkGray
}

if (Test-Path $desktopLnk) {
  Remove-Item -LiteralPath $desktopLnk -Force
  Write-Host "  Atalho da Area de Trabalho removido." -ForegroundColor Yellow
}

if (Test-Path $startMenu) {
  Remove-Item -LiteralPath $startMenu -Recurse -Force
  Write-Host "  Atalho do Menu Iniciar removido." -ForegroundColor Yellow
}

Write-Host "  Concluido." -ForegroundColor Green
