@echo off
chcp 65001 >nul
title DETONA CONCURSOS — PC/AL 2026
cd /d "%~dp0"
echo.
echo   DETONA CONCURSOS — PC/AL 2026
echo   Iniciando servidor local...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 pause
