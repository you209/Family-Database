# FamilyRoot — Windows PowerShell launcher
# Right-click → "Run with PowerShell"   OR   powershell -ExecutionPolicy Bypass -File start-windows.ps1

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "FamilyRoot"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host "   FamilyRoot — Windows launcher" -ForegroundColor Green
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend   = Join-Path $ScriptDir "backend"
$Frontend  = Join-Path $ScriptDir "frontend"
$Venv      = Join-Path $ScriptDir "venv"
$DataDir   = Join-Path $ScriptDir "data"
$MediaDir  = Join-Path $ScriptDir "media"
$Port      = 5050

# ── Python check ─────────────────────────────────────────────────────────────
$Python = $null
foreach ($cmd in @("python","python3")) {
    try {
        $v = & $cmd --version 2>&1
        if ($v -match "Python 3\.([9-9]|1[0-9])") { $Python = $cmd; break }
    } catch {}
}
if (-not $Python) {
    Write-Host "  [ERROR] Python 3.9+ not found." -ForegroundColor Red
    Write-Host "  Download: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "  Tick 'Add Python to PATH' during install." -ForegroundColor Yellow
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-Host "  [OK] $Python found" -ForegroundColor Green

# ── Directories ───────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path "$MediaDir\originals"  | Out-Null
New-Item -ItemType Directory -Force -Path "$MediaDir\thumbnails" | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir               | Out-Null

# ── Venv ──────────────────────────────────────────────────────────────────────
$VenvPython = Join-Path $Venv "Scripts\python.exe"
$VenvPip    = Join-Path $Venv "Scripts\pip.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "  Creating virtual environment..." -ForegroundColor Cyan
    & $Python -m venv $Venv
}

Write-Host "  Installing Python dependencies..." -ForegroundColor Cyan
& $VenvPip install --upgrade pip --quiet
& $VenvPip install -r "$Backend\requirements.txt" --quiet
Write-Host "  [OK] Python dependencies ready" -ForegroundColor Green

# ── Frontend build ────────────────────────────────────────────────────────────
$DistIndex = Join-Path $Frontend "dist\index.html"
if (Test-Path $DistIndex) {
    Write-Host "  [OK] Using existing frontend build" -ForegroundColor Green
} else {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        Write-Host "  Building React frontend..." -ForegroundColor Cyan
        Push-Location $Frontend
        npm install --silent
        npm run build
        Pop-Location
        if (Test-Path $DistIndex) {
            Write-Host "  [OK] Frontend built" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] Frontend build failed" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [WARN] Node.js not found — UI won't load." -ForegroundColor Yellow
        Write-Host "         Get it from https://nodejs.org" -ForegroundColor Yellow
    }
}

# ── Launch ────────────────────────────────────────────────────────────────────
$env:PORT               = $Port
$env:DEBUG              = "0"
$env:FAMILYROOT_MEDIA   = $MediaDir

Write-Host ""
Write-Host "  Starting FamilyRoot on http://localhost:$Port" -ForegroundColor Green
Write-Host "  Close this window to stop." -ForegroundColor Gray
Write-Host ""

# Open browser after Flask has had a moment to start
Start-Job {
    Start-Sleep 2
    Start-Process "http://localhost:5050"
} | Out-Null

Set-Location $Backend
& $VenvPython app.py
