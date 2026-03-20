@echo off
cd /d "%~dp0"
node check-classes2.js > check-classes2-log.txt 2>&1
