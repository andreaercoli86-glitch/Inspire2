@echo off
cd /d "%~dp0"
node build\generate-embeddings.js --batch-size 50 > embeddings_log.txt 2>&1
echo EXIT:%ERRORLEVEL% > embeddings_status.txt
