@echo off
cd /d "%~dp0"
node check_plot.js > check_plot.log 2>&1
