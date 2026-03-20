@echo off
cd /d "%~dp0inspire-server"
node analyze-missing.js > analyze-log.txt 2>&1
