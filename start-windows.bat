@echo off
setlocal
title Xadrez Studio

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Erro: Node.js nao esta instalado ou nao esta no PATH.
  echo Instale a versao LTS em https://nodejs.org/ e tente novamente.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo Erro: npm nao esta disponivel no PATH.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 goto :error
) else (
  echo Dependencias encontradas.
)

echo.
echo Iniciando Xadrez Studio...
echo O navegador abrira em http://localhost:5173
echo Para encerrar o servidor, pressione Ctrl+C nesta janela.
echo.
call npm run dev -- --host 127.0.0.1 --open

if errorlevel 1 goto :error
goto :end

:error
echo.
echo A aplicacao nao iniciou corretamente.
pause
exit /b 1

:end
endlocal
