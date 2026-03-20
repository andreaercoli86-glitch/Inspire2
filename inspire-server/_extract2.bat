@echo off
cd /d "%~dp0"
node _extract2.js > extract_log.txt 2>&1
