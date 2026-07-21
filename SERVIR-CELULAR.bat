@echo off
chcp 65001 >nul
title DETONA CONCURSOS — Servir no Celular (Wi-Fi)
cd /d "%~dp0"

echo.
echo  ============================================================
echo   DETONA CONCURSOS no CELULAR (mesma Wi-Fi do PC)
echo  ============================================================
echo.
echo  1) PC e celular na MESMA rede Wi-Fi
echo  2) Este script libera a porta e inicia o servidor
echo  3) No celular, abra o endereco http://IP:PORTA que aparecer
echo  4) No Chrome/Safari: menu - Adicionar a tela inicial
echo.
echo  Obs: pode pedir permissao de Administrador (so para liberar rede).
echo.

:: Reserva URL para escutar na rede (uma vez)
netsh http add urlacl url=http://+:8765/ user=%USERNAME% >nul 2>&1
netsh http add urlacl url=http://+:8766/ user=%USERNAME% >nul 2>&1
netsh http add urlacl url=http://+:8767/ user=%USERNAME% >nul 2>&1
netsh http add urlacl url=http://+:8768/ user=%USERNAME% >nul 2>&1
netsh http add urlacl url=http://+:8769/ user=%USERNAME% >nul 2>&1
netsh http add urlacl url=http://+:8770/ user=%USERNAME% >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Rede
pause
