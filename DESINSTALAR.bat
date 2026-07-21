@echo off
chcp 65001 >nul
title DETONA CONCURSOS — Desinstalador
cd /d "%~dp0"

echo.
echo  Removendo DETONA CONCURSOS...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall.ps1"
if errorlevel 1 (
  echo  [ERRO] Falha ao desinstalar.
  pause
  exit /b 1
)

echo.
echo  Desinstalacao concluida.
echo  Obs.: progresso no navegador pode permanecer ate limpar dados do site.
echo.
pause
