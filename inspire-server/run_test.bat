@echo off
cd /d "%~dp0"
node test_api.js > test_api_log.txt 2>&1
