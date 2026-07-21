@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================
echo   DETONA — Criar banco de questoes (Excel)
echo ============================================
echo.

if "%~1"=="" goto MENU

node scripts\criarBancoQuestoes.mjs %*
goto END

:MENU
echo Escolha uma opcao:
echo.
echo  1 - Gerar TEMPLATE Excel vazio (modelo)
echo  2 - Importar o EXEMPLO JSON (2 questoes)
echo  3 - Importar pasta entrada-exemplo (TXT + JSON)
echo  4 - Importar um arquivo seu (arraste o arquivo nesta janela)
echo  5 - Sair
echo.
set /p OP="Opcao: "

if "%OP%"=="1" (
  node scripts\criarBancoQuestoes.mjs --template --disciplina "Língua Portuguesa"
  goto END
)
if "%OP%"=="2" (
  node scripts\criarBancoQuestoes.mjs --from=imports\entrada-exemplo\exemplo-questoes.json --disciplina "Língua Portuguesa" --status=REVISADA
  goto END
)
if "%OP%"=="3" (
  node scripts\criarBancoQuestoes.mjs --from=imports\entrada-exemplo --disciplina "Língua Portuguesa" --status=REVISADA
  goto END
)
if "%OP%"=="4" (
  set /p ARQ="Caminho do arquivo JSON/CSV/TXT: "
  set /p DISC="Disciplina (ex: Direito Penal): "
  node scripts\criarBancoQuestoes.mjs --from="!ARQ!" --disciplina="!DISC!" --status=REVISADA
  goto END
)
if "%OP%"=="5" goto END

echo Opcao invalida.
goto MENU

:END
echo.
if errorlevel 1 (
  echo Falhou. Verifique a mensagem acima.
) else (
  echo Concluido. Planilha em: app\imports\questions\
  echo.
  echo Para carregar no app, rode:
  echo   node scripts\importQuestionBanks.mjs
)
echo.
pause
