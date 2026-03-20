@echo off
cd /d "%~dp0"
node debug_search.js > debug_search.txt 2>&1
