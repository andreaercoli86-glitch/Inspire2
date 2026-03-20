@echo off
cd /d "%~dp0inspire-server"
node build/expand-books.js > expand-books-log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> expand-books-log.txt
