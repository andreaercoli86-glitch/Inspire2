@echo off
cd /d "%~dp0"
echo === NPM VERSION ===
npm --version > npm_ver.txt 2>&1
type npm_ver.txt
echo === NPM INSTALL ===
npm install --ignore-scripts > npm_full_log.txt 2>&1
echo EXIT:%ERRORLEVEL% > install_status.txt
type install_status.txt
echo === DONE ===
