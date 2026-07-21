@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo =====================================================
echo   DETONA — Extrair questões de PDF de apostila
echo   PDF → Excel (padrão DETONA)
echo =====================================================
echo.

REM Garante pypdf
py -3.12 -c "import pypdf" 2>nul
if errorlevel 1 (
  echo Instalando pypdf...
  py -3.12 -m pip install pypdf --quiet
)

if not "%~1"=="" (
  if /I "%~x1"==".pdf" (
    set "PDF=%~1"
    set /p DISC="Disciplina (ex: Direito Penal): "
    if "!DISC!"=="" set "DISC=Geral"
    node scripts\extrairPdfApostila.mjs --pdf "!PDF!" --disciplina "!DISC!" --secao comentados
    goto END
  )
  node scripts\extrairPdfApostila.mjs %*
  goto END
)

echo Escolha:
echo.
echo  1 - Extrair UM PDF (caminho)
echo  2 - Extrair PASTA inteira de PDFs (ex: D. Penal)
echo  3 - Teste rapido (se existir PDF de Direito Penal no OneDrive)
echo  4 - Sair
echo.
set /p OP="Opcao: "

if "%OP%"=="1" (
  set /p PDF="Caminho completo do PDF: "
  set /p DISC="Disciplina: "
  if "!DISC!"=="" set "DISC=Geral"
  node scripts\extrairPdfApostila.mjs --pdf "!PDF!" --disciplina "!DISC!" --secao comentados
  goto END
)
if "%OP%"=="2" (
  set /p DIR="Pasta com PDFs: "
  set /p DISC="Disciplina: "
  if "!DISC!"=="" set "DISC=Geral"
  node scripts\extrairPdfApostila.mjs --dir "!DIR!" --disciplina "!DISC!" --secao comentados
  goto END
)
if "%OP%"=="3" (
  set "PDF=C:\Users\wwwmi\OneDrive\Imagens\CURSOS\PF - Agente\D. Penal\curso-223697-aula-00-grifado-505e.pdf"
  if not exist "!PDF!" (
    echo PDF de teste nao encontrado.
    goto END
  )
  node scripts\extrairPdfApostila.mjs --pdf "!PDF!" --disciplina "Direito Penal" --secao comentados
  goto END
)
if "%OP%"=="4" goto END

echo Opcao invalida.

:END
echo.
if errorlevel 1 (
  echo Falhou. Leia a mensagem acima.
) else (
  echo Planilha gerada em: app\imports\questions\
  echo.
  echo Proximo passo:
  echo   node scripts\importQuestionBanks.mjs
)
echo.
pause
