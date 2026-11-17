@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Se necesita Node.js para levantar el servidor local.
  pause
  exit /b 1
)
echo Abre http://127.0.0.1:8090 en el navegador. Cierra esta ventana para parar el servidor.
node serve.mjs
pause
