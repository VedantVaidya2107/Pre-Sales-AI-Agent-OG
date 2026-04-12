# Start cloudflared and capture the tunnel URL
$logFile = "tunnel_output.log"
$urlFile = "tunnel_url.txt"

# Clear old files
"" | Set-Content $logFile
"" | Set-Content $urlFile

# Start cloudflared as a background job
$job = Start-Job -ScriptBlock {
    npx cloudflared tunnel --url http://localhost:8000 2>&1
}

Write-Host "Waiting for tunnel URL..."

# Poll the job output for the URL
$found = $false
$attempts = 0
while (-not $found -and $attempts -lt 60) {
    Start-Sleep -Seconds 2
    $attempts++
    $output = Receive-Job -Job $job -Keep 2>$null
    if ($output) {
        $outputStr = $output -join "`n"
        $outputStr | Set-Content $using:logFile -ErrorAction SilentlyContinue
        if ($outputStr -match '(https://[a-z0-9-]+\.trycloudflare\.com)') {
            $url = $Matches[1]
            $url | Set-Content $using:urlFile
            Write-Host "TUNNEL_URL=$url"
            $found = $true
        }
    }
    Write-Host "Attempt $attempts..."
}

if (-not $found) {
    Write-Host "ERROR: Could not find tunnel URL after 120 seconds"
}

# Keep the job running
Wait-Job -Job $job
