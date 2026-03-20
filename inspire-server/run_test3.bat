@echo off
cd /d "%~dp0"
node test_api3.js > test_api3_log.txt 2>&1
