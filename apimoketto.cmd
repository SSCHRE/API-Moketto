@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18.3 or newer is required: https://nodejs.org
  pause
  exit /b 1
)
node "%~dp0bin\apimoketto.js" %*
if errorlevel 1 pause
