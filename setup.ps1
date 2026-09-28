param([switch]$InstallModel)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\classroom-env.ps1')

Write-Host 'Preparing Adaptive Classroom (Windows)'
$python = Get-ClassroomPython
$node = Get-ClassroomNode
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
$libreoffice = Get-ClassroomLibreOffice

Write-ClassroomCheck 'Python 3.12' $(if ($python) { 'PASS' } else { 'FAIL' }) $(if ($python) { $python.Version } else { 'Install Python 3.12 and enable py/python.' })
Write-ClassroomCheck 'Node.js' $(if ($node) { 'PASS' } else { 'FAIL' }) $(if ($node) { $node.Version } else { 'Install Node 20.19+ or 22.12+.' })
Write-ClassroomCheck 'npm' $(if ($npm) { 'PASS' } else { 'FAIL' }) $(if ($npm) { $npm.Source } else { 'Install npm with Node.js.' })
Write-ClassroomCheck 'Ollama installed' $(if ($ollama) { 'PASS' } else { 'WARNING' }) $(if ($ollama) { $ollama.Source } else { 'Install Ollama to enable AI generation.' })
Write-ClassroomCheck 'LibreOffice' $(if ($libreoffice) { 'PASS' } else { 'WARNING' }) $(if ($libreoffice) { $libreoffice } else { 'Optional; PPTX text view still works.' })

if (-not $python -or -not $node -or -not $npm) {
    Write-Host 'Install the missing mandatory tools above, then run .\setup.ps1 again.'
    exit 1
}

if (-not (Test-Path -LiteralPath $script:VenvPython -PathType Leaf)) {
    Write-Host 'Creating backend/.venv with Python 3.12...'
    & $python.Path @($python.Arguments) -m venv (Join-Path $script:BackendRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the backend virtual environment.' }
}
Write-ClassroomCheck 'Backend venv' 'PASS' $script:VenvPython

Write-Host 'Installing or checking backend requirements...'
$uv = Get-Command uv -ErrorAction SilentlyContinue
if ($uv) {
    & $uv.Source --no-cache pip install --python $script:VenvPython -r (Join-Path $script:BackendRoot 'requirements.txt')
} else {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $script:VenvPython -m pip --version *> $null; $pipAvailable = $LASTEXITCODE -eq 0 }
    finally { $ErrorActionPreference = $previousErrorAction }
    if (-not $pipAvailable) {
        & $script:VenvPython -m ensurepip --upgrade
        if ($LASTEXITCODE -ne 0) { throw 'Could not make pip available in the backend venv.' }
    }
    & $script:VenvPython -m pip install -r (Join-Path $script:BackendRoot 'requirements.txt')
}
if ($LASTEXITCODE -ne 0) { throw 'Backend requirements installation failed.' }
Write-ClassroomCheck 'Backend packages' 'PASS' 'requirements.txt satisfied'

$nodeModules = Join-Path $script:FrontendRoot 'node_modules'
$lockfile = Join-Path $script:FrontendRoot 'package-lock.json'
if (-not (Test-Path -LiteralPath $lockfile -PathType Leaf)) { throw 'frontend/package-lock.json is missing; npm ci cannot be used safely.' }
Push-Location $script:FrontendRoot
try {
    $needsInstall = -not (Test-Path -LiteralPath $nodeModules -PathType Container)
    if (-not $needsInstall) {
        & $npm.Source ls --depth=0 --silent *> $null
        $needsInstall = $LASTEXITCODE -ne 0
    }
    if ($needsInstall) {
        Write-Host 'Installing frontend packages from package-lock.json...'
        & $npm.Source ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend npm ci failed.' }
    } else { Write-Host 'Frontend packages already satisfy package-lock.json.' }
} finally { Pop-Location }
Write-ClassroomCheck 'Frontend packages' 'PASS' 'node_modules ready'

$models = Get-ClassroomOllamaModels
if ($InstallModel -and -not $ollama) { throw 'Cannot install the model: Ollama is not installed.' }
if ($InstallModel -and $null -eq $models) {
    if ($script:OllamaBaseUrl -ne 'http://127.0.0.1:11434' -and $script:OllamaBaseUrl -ne 'http://localhost:11434') {
        throw "Cannot start the configured Ollama service at $script:OllamaBaseUrl automatically. Start it, then rerun -InstallModel."
    }
    Write-Host 'Starting the local Ollama service for the requested model install...'
    $ollamaLog = Join-Path $env:TEMP 'classroom-setup-ollama.log'
    $ollamaProcess = Start-Process -FilePath $ollama.Source -ArgumentList 'serve' -WindowStyle Hidden -PassThru -RedirectStandardOutput $ollamaLog -RedirectStandardError (Join-Path $env:TEMP 'classroom-setup-ollama-error.log')
    for ($attempt = 0; $attempt -lt 20 -and $null -eq $models; $attempt++) {
        Start-Sleep -Milliseconds 500
        $models = Get-ClassroomOllamaModels
    }
    if ($null -eq $models) { throw 'Ollama did not become ready. Start the Ollama app and retry.' }
}
if ($InstallModel -and $script:ModelName -notin $models) {
    Write-Host "Downloading $script:ModelName because -InstallModel was explicitly requested..."
    & $ollama.Source pull $script:ModelName
    if ($LASTEXITCODE -ne 0) { throw "Could not pull $script:ModelName." }
    $models = Get-ClassroomOllamaModels
}

if ($null -eq $models) {
    Write-ClassroomCheck $script:ModelName 'WARNING' "Could not check $script:OllamaBaseUrl. Start Ollama, then run .\check.ps1."
} elseif ($script:ModelName -in $models) {
    Write-ClassroomCheck $script:ModelName 'PASS' 'Model ready'
} else {
    Write-ClassroomCheck $script:ModelName 'WARNING' "Missing. Run: ollama pull $script:ModelName (or .\setup.ps1 -InstallModel)."
}
Write-Host 'Setup complete. Check with .\check.ps1, then start with .\run.ps1.'
