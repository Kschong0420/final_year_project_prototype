# Shared, read-only discovery for the Windows setup, check and run commands.
$script:ClassroomRoot = Split-Path -Parent $PSScriptRoot
$script:BackendRoot = Join-Path $script:ClassroomRoot 'backend'
$script:FrontendRoot = Join-Path $script:ClassroomRoot 'frontend'
$script:VenvPython = Join-Path $script:BackendRoot '.venv\Scripts\python.exe'
$script:ModelName = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL.Trim() } else { 'phi3:mini' }
$script:OllamaBaseUrl = if ($env:OLLAMA_BASE_URL) { $env:OLLAMA_BASE_URL.TrimEnd('/') } else { 'http://127.0.0.1:11434' }

function Get-ClassroomPython {
    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher) {
        try {
            $version = & $launcher.Source -3.12 -c 'import sys; print(sys.version.split()[0])' 2>$null
            if ($LASTEXITCODE -eq 0 -and $version -match '^3\.12\.') {
                return @{ Path = $launcher.Source; Arguments = @('-3.12'); Version = $version }
            }
        } catch { }
    }
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        try {
            $version = & $python.Source -c 'import sys; print(sys.version.split()[0])' 2>$null
            if ($LASTEXITCODE -eq 0 -and $version -match '^3\.12\.') {
                return @{ Path = $python.Source; Arguments = @(); Version = $version }
            }
        } catch { }
    }
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    if ($uv) {
        try {
            $managed = & $uv.Source --no-cache python find 3.12 --no-python-downloads 2>$null
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $managed -PathType Leaf)) {
                $version = & $managed -c 'import sys; print(sys.version.split()[0])' 2>$null
                if ($LASTEXITCODE -eq 0 -and $version -match '^3\.12\.') {
                    return @{ Path = $managed; Arguments = @(); Version = $version }
                }
            }
        } catch { }
    }
    return $null
}

function Get-ClassroomNode {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $null }
    try {
        $version = (& $node.Source --version 2>$null).TrimStart('v')
        $parts = $version.Split('.')
        $major = [int]$parts[0]; $minor = [int]$parts[1]
        if (($major -eq 20 -and $minor -ge 19) -or ($major -eq 22 -and $minor -ge 12) -or $major -ge 23) {
            return @{ Path = $node.Source; Version = $version }
        }
    } catch { }
    return $null
}

function Get-ClassroomLibreOffice {
    if ($env:LIBREOFFICE_PATH) {
        if (Test-Path -LiteralPath $env:LIBREOFFICE_PATH -PathType Leaf) { return $env:LIBREOFFICE_PATH }
        return $null
    }
    foreach ($name in @('soffice.exe', 'soffice', 'libreoffice')) {
        $found = Get-Command $name -ErrorAction SilentlyContinue
        if ($found) { return $found.Source }
    }
    foreach ($path in @('C:\Program Files\LibreOffice\program\soffice.exe',
                         'C:\Program Files (x86)\LibreOffice\program\soffice.exe')) {
        if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
    }
    return $null
}

function Test-ClassroomPort([int]$Port) {
    $socket = New-Object System.Net.Sockets.TcpClient
    try {
        $attempt = $socket.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $attempt.AsyncWaitHandle.WaitOne(300)) { return $false }
        try { $socket.EndConnect($attempt); return $true } catch { return $false }
    } finally { $socket.Close() }
}

function Get-ClassroomOllamaModels {
    try {
        $response = Invoke-RestMethod -Uri "$script:OllamaBaseUrl/api/tags" -TimeoutSec 3 -ErrorAction Stop
        if ($null -eq $response.models) { return $null }
        return @($response.models | ForEach-Object { if ($_.name) { $_.name } else { $_.model } })
    } catch { return $null }
}

function Write-ClassroomCheck([string]$Name, [string]$Status, [string]$Detail) {
    Write-Host ('{0,-22} {1,-8} {2}' -f $Name, $Status, $Detail)
}
