@echo off
chcp 65001 >NUL 2>&1
setlocal EnableDelayedExpansion
title InspireMe² - Setup Wizard
color 0F

echo.
echo   ╔══════════════════════════════════════╗
echo   ║    InspireMe² - Setup Wizard         ║
echo   ╠══════════════════════════════════════╣
echo   ║  First-time installation assistant   ║
echo   ╚══════════════════════════════════════╝
echo.

:: ─────────────────────────────────────────────
:: [1/4] Check prerequisites
:: ─────────────────────────────────────────────
echo   [1/4] Checking prerequisites...
echo.

:: Check Node.js
where node >NUL 2>&1
if errorlevel 1 (
    echo   [ERROR] Node.js is not installed.
    echo   Node.js is required to run InspireMe².
    echo   Download it from: https://nodejs.org
    echo.
    echo   Opening download page...
    start "" "https://nodejs.org"
    echo.
    echo   Install Node.js, then re-run this script.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>NUL') do set NODE_VER=%%v
echo   [OK] Node.js found: %NODE_VER%

:: Check Ollama
where ollama >NUL 2>&1
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        echo   [OK] Ollama found in local programs.
    ) else (
        echo   [ERROR] Ollama is not installed.
        echo   Ollama is required to run the AI models.
        echo   Download it from: https://ollama.com/download
        echo.
        echo   Opening download page...
        start "" "https://ollama.com/download"
        echo.
        echo   Install Ollama, then press any key to continue...
        pause >NUL
        echo.
        where ollama >NUL 2>&1
        if errorlevel 1 (
            echo   [WARNING] Ollama still not detected. Continuing anyway...
            echo   You may need to restart this script after installing Ollama.
        )
    )
) else (
    for /f "tokens=*" %%v in ('ollama --version 2^>NUL') do set OLLAMA_VER=%%v
    echo   [OK] Ollama found: !OLLAMA_VER!
)

:: Start Ollama if not running
set OLLAMA_ORIGINS=*
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I "ollama.exe" >NUL
if errorlevel 1 (
    echo   [INFO] Starting Ollama...
    start "" ollama serve
    timeout /t 3 /nobreak >NUL
) else (
    echo   [OK] Ollama is already running.
)
echo.

:: ─────────────────────────────────────────────
:: [2/4] Download AI models
:: ─────────────────────────────────────────────
echo   [2/4] Downloading AI models (this may take 10-15 minutes)...
echo.

echo   Pulling qwen3.5:4b ...
ollama pull qwen3.5:4b
if errorlevel 1 (
    echo   [WARNING] Failed to pull qwen3.5:4b. You can retry later with: ollama pull qwen3.5:4b
) else (
    echo   [OK] qwen3.5:4b ready.
)
echo.

echo   Pulling qwen3-embedding:4b ...
ollama pull qwen3-embedding:4b
if errorlevel 1 (
    echo   [WARNING] Failed to pull qwen3-embedding:4b. You can retry later with: ollama pull qwen3-embedding:4b
) else (
    echo   [OK] qwen3-embedding:4b ready.
)
echo.

:: ─────────────────────────────────────────────
:: [3/4] Install dependencies
:: ─────────────────────────────────────────────
echo   [3/4] Installing dependencies...
echo.

cd /d "%~dp0inspire-server"
call npm install
if errorlevel 1 (
    echo   [WARNING] npm install encountered errors. The server may not work correctly.
) else (
    echo   [OK] Dependencies installed.
)
echo.

:: ─────────────────────────────────────────────
:: [3.5] Check for database
:: ─────────────────────────────────────────────
cd /d "%~dp0"
if not exist "data\inspire.db" (
    echo   ╔══════════════════════════════════════╗
    echo   ║  Database not found!                 ║
    echo   ╠══════════════════════════════════════╣
    echo   ║  Download inspire.db from GitHub     ║
    echo   ║  Releases and place it in the        ║
    echo   ║  data\ folder.                       ║
    echo   ╚══════════════════════════════════════╝
    echo.
    echo   Download URL:
    echo   https://github.com/OWNER/InspireMe2-Qwen/releases/latest/download/inspire.db
    echo.
    echo   Place the file at: %~dp0data\inspire.db
    echo.
    echo   Press any key once the database is in place...
    pause >NUL
    echo.
    if exist "data\inspire.db" (
        echo   [OK] Database found.
    ) else (
        echo   [WARNING] Database still not found. The app may not work without it.
    )
) else (
    echo   [OK] Database found.
)
echo.

:: ─────────────────────────────────────────────
:: [4/4] Start server
:: ─────────────────────────────────────────────
echo   [4/4] Starting InspireMe²...
echo.
echo   ╔══════════════════════════════════════╗
echo   ║  Setup complete!                     ║
echo   ╠══════════════════════════════════════╣
echo   ║  Server: http://localhost:3457       ║
echo   ║  Press Ctrl+C to stop.              ║
echo   ║                                      ║
echo   ║  Next time, use start.bat to launch. ║
echo   ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0inspire-server"
start "" http://localhost:3457
node server.js
