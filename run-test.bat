@echo off
cd /d "%~dp0"
node final-test.js > final-test-log.txt 2>&1
