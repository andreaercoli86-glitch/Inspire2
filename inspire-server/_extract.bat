@echo off
cd /d "%~dp0"
node _extract.js > extract_log.txt 2>&1
