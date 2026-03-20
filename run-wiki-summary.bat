@echo off
cd /d "%~dp0inspire-server"
node build/wiki-summary-enrich.js > wiki-summary-log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> wiki-summary-log.txt
