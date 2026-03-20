@echo off
chcp 65001 >NUL 2>&1
title InspireMe² - Starting...

echo.
echo   ========================================
echo    InspireMe² - Starting...
echo   ========================================
echo.

:: Set Ollama to accept local requests
set OLLAMA_ORIGINS=*

:: [1] Check if Ollama is running, start if not
echo   [1/3] Checking Ollama...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I "ollama.exe" >NUL
if errorlevel 1 (
    echo   [INFO] Starting Ollama...
    start "" ollama serve
    timeout /t 3 /nobreak >NUL
) else (
    echo   [OK] Ollama is running.
)

:: [2] Install dependencies (silent, in case of updates)
echo   [2/3] Checking dependencies...
cd /d "%~dp0inspire-server"
call npm install --silent >NUL 2>&1
echo   [OK] Dependencies up to date.

:: [3] Open browser and start server
echo   [3/3] Opening browser...
echo.
timeout /t 1 /nobreak >NUL
start "" http://localhost:3457

echo   ========================================
echo    InspireMe² running: http://localhost:3457
echo    Press Ctrl+C to stop the server.
echo   ========================================
echo.

node server.js
