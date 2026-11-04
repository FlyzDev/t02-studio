# Start T02 Studio locally. Optional T02_* variables can be set before launch.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    py -3 -m venv (Join-Path $projectRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.11+ is required.' }
}
& $python -c "import sys; assert sys.version_info >= (3, 11), 'Python 3.11+ is required'"
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11+ is required.' }
& $python -m pip install --disable-pip-version-check -r (Join-Path $projectRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Python package installation failed.' }
$env:PYTHONPATH = Join-Path $projectRoot 'src'
if (-not $env:T02_BIND_HOST) { $env:T02_BIND_HOST = '127.0.0.1' }
if (-not $env:T02_PORT) { $env:T02_PORT = '8062' }
if (-not $env:T02_COM_PORT) { throw 'Set T02_COM_PORT to your paired printer Bluetooth COM port (e.g. COM7).' }
& $python -m t02studio.launcher
if ($LASTEXITCODE -ne 0) { throw 'T02 Studio failed to start.' }
