@echo off
"%LOCALAPPDATA%\Programs\Ollama\ollama.exe" list > ollama_check.txt 2>&1
echo EXIT:%ERRORLEVEL% >> ollama_check.txt
