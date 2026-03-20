@echo off
cd /d "%~dp0"
node test_api2.js > test_api2_log.txt 2>&1
