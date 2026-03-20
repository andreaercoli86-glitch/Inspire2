@echo off
cd /d "%~dp0"
node build/generate-enrichments.js > enrich.log 2>&1
