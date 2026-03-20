@echo off
cd /d "%~dp0inspire-server"
node build/import-wikiplots.js > import-wikiplots-log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> import-wikiplots-log.txt
