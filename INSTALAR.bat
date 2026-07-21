@echo off
chcp 65001 >nul
title DETONA CONCURSOS — Instalador
cd /d "%~dp0"

echo.
echo  ============================================================
echo   DETONA CONCURSOS — PC/AL 2026
echo   Instalador para Windows
echo  ============================================================
echo.

:: Pasta de instalação padrão (não precisa admin)
set "INSTALL_DIR=%LOCALAPPDATA%\DetonaConcursos"

echo  Destino: %INSTALL_DIR%
echo.

if not exist "%~dp0app\index.html" (
  echo  [ERRO] Pasta "app" nao encontrada. Extraia o ZIP completo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" -SourceDir "%~dp0app" -InstallDir "%INSTALL_DIR%"
if errorlevel 1 (
  echo.
  echo  [ERRO] Falha na instalacao.
  pause
  exit /b 1
)

echo.
echo  ============================================================
echo   Instalacao concluida!
echo   Use o atalho "DETONA CONCURSOS" na Area de Trabalho.
echo  ============================================================
echo.
pause
