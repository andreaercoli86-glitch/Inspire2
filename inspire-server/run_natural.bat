@echo off
cd /d "%~dp0"
node test_natural.js > test_natural_log.txt 2>&1
