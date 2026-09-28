$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\classroom-env.ps1')

$failed = $false
$python = Get-ClassroomPython
$node = Get-ClassroomNode
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
$libreoffice = Get-ClassroomLibreOffice

Write-ClassroomCheck 'Python 3.12' $(if ($python) { 'PASS' } else { $failed = $true; 'FAIL' }) $(if ($python) { $python.Version } else { 'Install Python 3.12.' })
Write-ClassroomCheck 'Backend venv' $(if (Test-Path -LiteralPath $script:VenvPython -PathType Leaf) { 'PASS' } else { $failed = $true; 'FAIL' }) $(if (Test-Path -LiteralPath $script:VenvPython -PathType Leaf) { $script:VenvPython } else { 'Run .\setup.ps1.' })
if (Test-Path -LiteralPath $script:VenvPython -PathType Leaf) {
    $ErrorActionPreference = 'Continue' # PyMuPDF may print a harmless stderr suggestion.
    & $script:VenvPython -c 'import fastapi, uvicorn, websockets, httpx, multipart, pymupdf, pptx' *> $null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -eq 0) { Write-ClassroomCheck 'Backend imports' 'PASS' 'Core dependencies import' }
    else { Write-ClassroomCheck 'Backend imports' 'FAIL' 'Run .\setup.ps1.'; $failed = $true }
} else { Write-ClassroomCheck 'Backend imports' 'FAIL' 'Backend venv missing'; $failed = $true }
Write-ClassroomCheck 'Node.js' $(if ($node) { 'PASS' } else { $failed = $true; 'FAIL' }) $(if ($node) { $node.Version } else { 'Install Node 20.19+ or 22.12+.' })
Write-ClassroomCheck 'npm' $(if ($npm) { 'PASS' } else { $failed = $true; 'FAIL' }) $(if ($npm) { $npm.Source } else { 'Install npm with Node.js.' })
Write-ClassroomCheck 'Frontend packages' $(if (Test-Path -LiteralPath (Join-Path $script:FrontendRoot 'node_modules\vite\bin\vite.js') -PathType Leaf) { 'PASS' } else { $failed = $true; 'FAIL' }) $(if (Test-Path -LiteralPath (Join-Path $script:FrontendRoot 'node_modules\vite\bin\vite.js') -PathType Leaf) { 'Vite available' } else { 'Run .\setup.ps1.' })
Write-ClassroomCheck 'Ollama installed' $(if ($ollama) { 'PASS' } else { 'WARNING' }) $(if ($ollama) { $ollama.Source } else { 'Install Ollama for AI generation.' })
$models = Get-ClassroomOllamaModels
Write-ClassroomCheck 'Ollama service' $(if ($null -ne $models) { 'PASS' } else { 'WARNING' }) $(if ($null -ne $models) { $script:OllamaBaseUrl } else { 'Unavailable; start the Ollama app or run ollama serve.' })
Write-ClassroomCheck $script:ModelName $(if ($null -ne $models -and $script:ModelName -in $models) { 'PASS' } else { 'WARNING' }) $(if ($null -eq $models) { 'Cannot check until Ollama is running.' } elseif ($script:ModelName -in $models) { 'Model ready' } else { "Run: ollama pull $script:ModelName" })
Write-ClassroomCheck 'LibreOffice' $(if ($libreoffice) { 'PASS' } else { 'WARNING' }) $(if ($libreoffice) { $libreoffice } else { 'Optional; PPTX uses text view.' })
foreach ($port in @(8000, 5173)) {
    $busy = Test-ClassroomPort $port
    Write-ClassroomCheck "Port $port" $(if ($busy) { 'WARNING' } else { 'PASS' }) $(if ($busy) { 'Already in use; .\run.ps1 will not replace that service.' } else { 'Available' })
}
if ($failed) { Write-Host 'Some required items are missing. Run .\setup.ps1 after installing the prerequisites.'; exit 1 }
Write-Host 'Core classroom prerequisites are ready. AI generation requires Ollama and the model above.'
