@echo off
cd /d "%~dp0inspire-server"
node build/generate-embeddings.js --batch-size 50 > embeddings-regen-log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> embeddings-regen-log.txt
