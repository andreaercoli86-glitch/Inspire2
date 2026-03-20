# Enrichment Watchdog — auto-restarts on Ollama hangs
# Monitors the log file; if no new line appears in 3 minutes, kills and restarts

$env:LLM_TOP_N = "4000"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workDir = Split-Path -Parent $ScriptDir
$logFile = Join-Path (Split-Path -Parent (Split-Path -Parent $ScriptDir)) "enrichments_qwen_log.txt"
$nodeExe = "node"
$maxIdleSeconds = 180  # 3 minutes without log update = hung

$restartCount = 0

function Start-Enrichment {
    $proc = Start-Process -FilePath $nodeExe -ArgumentList "build\generate-enrichments.js","--resume" -WorkingDirectory $workDir -WindowStyle Normal -PassThru
    Write-Host "[watchdog] Started enrichment PID $($proc.Id) at $(Get-Date -Format 'HH:mm:ss')"
    return $proc
}

$proc = Start-Enrichment

while ($true) {
    Start-Sleep -Seconds 30
    
    # Check if process is still alive
    if ($proc.HasExited) {
        Write-Host "[watchdog] Process exited with code $($proc.ExitCode) at $(Get-Date -Format 'HH:mm:ss')"
        if ($proc.ExitCode -eq 0) {
            Write-Host "[watchdog] Enrichment completed successfully!"
            break
        }
        # Non-zero exit = crash, restart
        $restartCount++
        Write-Host "[watchdog] Crash detected, restarting... (restart #$restartCount)"
        Start-Sleep -Seconds 5
        $proc = Start-Enrichment
        continue
    }
    
    # Check log file freshness
    $lastWrite = (Get-Item $logFile).LastWriteTime
    $idleSeconds = (New-TimeSpan -Start $lastWrite -End (Get-Date)).TotalSeconds
    
    if ($idleSeconds -gt $maxIdleSeconds) {
        $restartCount++
        Write-Host "[watchdog] Log stale for $([int]$idleSeconds)s — killing hung process and restarting (restart #$restartCount)"
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
        $proc = Start-Enrichment
    }
}

Write-Host "[watchdog] Done! Total restarts: $restartCount"
