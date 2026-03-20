@echo off
cd /d "%~dp0inspire-server"
node server.js > server-log.txt 2>&1
