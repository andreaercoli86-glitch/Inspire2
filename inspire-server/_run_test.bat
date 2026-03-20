@echo off
cd /d "%~dp0"
node _test.js > test_result.txt 2>&1
