@echo off
setlocal
set LLM_TOP_N=4000
set NODE=node
set WORKDIR=%~dp0..
set LOGFILE=%~dp0..\enrichments_qwen_log.txt

:LOOP
echo [%date% %time%] Starting enrichment run...
cd /d %WORKDIR%
%NODE% build\generate-enrichments.js --resume
echo [%date% %time%] Process exited with code %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] Enrichment completed successfully!
    goto END
)
echo [%date% %time%] Crash or hang detected, restarting in 5 seconds...
timeout /t 5 /nobreak >/dev/null
goto LOOP

:END
echo Done!
pause
