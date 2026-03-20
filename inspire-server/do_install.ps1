$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
"START" | Out-File "install_status.txt"
npm install --ignore-scripts *> "npm_full_log.txt"
"EXIT:$LASTEXITCODE" | Out-File "install_status.txt"
