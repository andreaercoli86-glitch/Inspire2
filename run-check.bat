@echo off
cd /d "%~dp0"
node check-classes.js > check-classes-log.txt 2>&1
