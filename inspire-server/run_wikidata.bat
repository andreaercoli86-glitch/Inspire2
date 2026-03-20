@echo off
cd /d "%~dp0"
node build\fetch-wikidata.js --min-sitelinks 10 --batch-size 300 > wikidata_log.txt 2>&1
echo EXIT:%ERRORLEVEL% > wikidata_status.txt
