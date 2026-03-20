@echo off
cd /d "%~dp0"
echo Downloading WikiPlots from Dropbox...
curl -L -o plots.zip "https://www.dropbox.com/s/24pa44w7u7wvtma/plots.zip?dl=1" 2>download_log.txt
echo EXIT:%ERRORLEVEL% > download_status.txt
echo Download complete
dir plots.zip
