@echo off
cd /d "%~dp0"
node download.js > download_log.txt 2>&1
echo EXIT:%ERRORLEVEL% > download_status.txt
