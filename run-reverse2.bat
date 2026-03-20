@echo off
cd /d "%~dp0inspire-server"
node build/reverse-wikiplots.js > reverse2-log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> reverse2-log.txt
