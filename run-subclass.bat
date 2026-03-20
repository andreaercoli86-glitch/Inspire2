@echo off
cd /d "%~dp0"
node find-subclasses.js > subclasses-log.txt 2>&1
