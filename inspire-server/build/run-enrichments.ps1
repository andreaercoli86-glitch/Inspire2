$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
$LogFile = Join-Path (Split-Path -Parent (Split-Path -Parent $ScriptDir)) "enrichments_qwen_log.txt"
& node "$ScriptDir\clear-enrichments.js" 2>&1 | Out-File $LogFile -Encoding utf8
& node "$ScriptDir\generate-enrichments.js" 2>&1 | Out-File $LogFile -Append -Encoding utf8
