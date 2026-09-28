$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\classroom-env.ps1')

function Show-ClassroomLog([string]$Path, [string]$Label, [ref]$Offset) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
                                     [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        [void]$stream.Seek($Offset.Value, [System.IO.SeekOrigin]::Begin)
        $reader = New-Object System.IO.StreamReader($stream)
        while (($line = $reader.ReadLine()) -ne $null) { Write-Host "[$Label] $line" }
        $Offset.Value = $stream.Position
    } finally { $stream.Close() }
}

function Stop-ClassroomTree([int]$RootId) {
    # Only the known process and processes descended from it can be stopped.
    $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $ids = New-Object System.Collections.Generic.List[int]
    $ids.Add($RootId)
    for ($i = 0; $i -lt $ids.Count; $i++) {
        foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $ids[$i] }) {
            if (-not $ids.Contains([int]$child.ProcessId)) { $ids.Add([int]$child.ProcessId) }
        }
    }
    for ($i = $ids.Count - 1; $i -ge 0; $i--) {
        Stop-Process -Id $ids[$i] -Force -ErrorAction SilentlyContinue
    }
}

$node = Get-ClassroomNode
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npm -or -not (Test-Path -LiteralPath $script:VenvPython -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $script:FrontendRoot 'node_modules\vite\bin\vite.js') -PathType Leaf)) {
    throw 'Required classroom tools are missing. Run .\setup.ps1 and .\check.ps1 first.'
}
if (Test-ClassroomPort 8000) { throw 'Port 8000 is already in use. This script will not disturb that backend.' }
if (Test-ClassroomPort 5173) { throw 'Port 5173 is already in use. This script will not disturb that frontend.' }

$runFolder = Join-Path $env:TEMP ("adaptive-classroom-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runFolder | Out-Null
$backendOutput = Join-Path $runFolder 'backend.out.log'
$backendError = Join-Path $runFolder 'backend.err.log'
$frontendOutput = Join-Path $runFolder 'frontend.out.log'
$frontendError = Join-Path $runFolder 'frontend.err.log'
$owned = New-Object System.Collections.Generic.List[int]

try {
    $ollama = Get-Command ollama -ErrorAction SilentlyContinue
    $models = Get-ClassroomOllamaModels
    if ($null -eq $models -and $ollama -and $script:OllamaBaseUrl -in @('http://127.0.0.1:11434', 'http://localhost:11434')) {
        Write-Host 'Ollama is installed but stopped. Starting its local service...'
        try {
            $modelProcess = Start-Process -FilePath $ollama.Source -ArgumentList 'serve' -WindowStyle Hidden -PassThru `
                -RedirectStandardOutput (Join-Path $runFolder 'ollama.out.log') `
                -RedirectStandardError (Join-Path $runFolder 'ollama.err.log')
            $owned.Add($modelProcess.Id)
            for ($attempt = 0; $attempt -lt 20 -and $null -eq $models; $attempt++) {
                Start-Sleep -Milliseconds 500
                $models = Get-ClassroomOllamaModels
            }
        } catch { Write-Warning "Could not start Ollama: $_" }
    }
    if ($null -eq $models) { Write-Warning 'Ollama is unavailable. Slides, feedback and saved activities still work; AI generation needs Ollama.' }
    elseif ($script:ModelName -notin $models) { Write-Warning "Model $script:ModelName is missing. Run: ollama pull $script:ModelName" }

    Write-Host 'Starting FastAPI at 127.0.0.1:8000...'
    $backend = Start-Process -FilePath $script:VenvPython `
        -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') `
        -WorkingDirectory $script:BackendRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $backendOutput -RedirectStandardError $backendError
    $owned.Add($backend.Id)

    Write-Host 'Starting Vite at 0.0.0.0:5173...'
    # This is the package.json "dev" Vite entry, launched via Node so its PID is owned directly.
    $frontend = Start-Process -FilePath $node.Path `
        -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--configLoader', 'runner') `
        -WorkingDirectory $script:FrontendRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $frontendOutput -RedirectStandardError $frontendError
    $owned.Add($frontend.Id)

    $healthy = $false; $frontendReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
            $healthy = $health.status -eq 'ok'
        } catch { }
        try {
            $page = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -TimeoutSec 2 -UseBasicParsing
            $frontendReady = $page.StatusCode -eq 200
        } catch { }
        if ($healthy -and $frontendReady) { break }
        if ($backend.HasExited -or $frontend.HasExited) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $healthy -or -not $frontendReady) {
        throw "Startup failed. Backend healthy: $healthy; frontend ready: $frontendReady. See logs in $runFolder"
    }

    Write-ClassroomCheck 'Backend /api/health' 'PASS' 'http://127.0.0.1:8000/api/health'
    Write-ClassroomCheck 'Frontend' 'PASS' 'http://localhost:5173/'
    Write-ClassroomCheck 'Ollama service' $(if ($null -eq $models) { 'WARNING' } else { 'PASS' }) $script:OllamaBaseUrl
    Write-ClassroomCheck 'Configured model' $(if ($null -ne $models -and $script:ModelName -in $models) { 'PASS' } else { 'WARNING' }) $script:ModelName
    Write-Host 'Lecturer URL: http://localhost:5173/'
    try {
        $addresses = @([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
            Where-Object { $_.OperationalStatus -eq 'Up' } |
            ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
            Where-Object { $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                           $_.Address.ToString() -notmatch '^(127\.|169\.254\.)' } |
            ForEach-Object { $_.Address.ToString() } | Select-Object -Unique)
        if (-not $addresses) { throw 'No LAN addresses were found.' }
        foreach ($address in $addresses) { Write-Host "Student LAN URL (if on the same reachable network): http://${address}:5173/" }
    } catch { Write-Host 'For students on the same LAN, use http://<this-PC-LAN-IP>:5173/.' }
    Write-Host 'Use the same reachable LAN and allow Node on a private-network firewall prompt if needed.'
    Write-Host "Logs below are from these processes only. Press Ctrl+C to stop them. Log files: $runFolder"

    $backendOutAt = 0L; $backendErrAt = 0L; $frontendOutAt = 0L; $frontendErrAt = 0L
    while ($true) {
        Show-ClassroomLog $backendOutput 'backend' ([ref]$backendOutAt)
        Show-ClassroomLog $backendError 'backend' ([ref]$backendErrAt)
        Show-ClassroomLog $frontendOutput 'frontend' ([ref]$frontendOutAt)
        Show-ClassroomLog $frontendError 'frontend' ([ref]$frontendErrAt)
        if ($backend.HasExited -or $frontend.HasExited) { throw 'A classroom service exited. Check the log output above.' }
        Start-Sleep -Seconds 1
    }
} finally {
    for ($i = $owned.Count - 1; $i -ge 0; $i--) { Stop-ClassroomTree $owned[$i] }
    Write-Host 'Stopped processes started by this run.ps1 instance.'
}
