@echo off
cd /d "%~dp0"
node check_db.js > db_check.txt 2>&1
