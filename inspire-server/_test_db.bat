@echo off
cd /d "%~dp0"
node _test_db.js > test_db_result.txt 2>&1
