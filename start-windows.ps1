# FamilyRoot — Windows PowerShell launcher
# Right-click → "Run with PowerShell"   OR   powershell -ExecutionPolicy Bypass -File start-windows.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "FamilyRoot"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host "   FamilyRoot — Windows launcher" -ForegroundColor Green
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host ""

$ScriptDir = $PSScriptRoot
$Backend   = Join-Path $ScriptDir "backend"
$Frontend  = Join-Path $ScriptDir "frontend"
$Venv      = Join-Path $ScriptDir "venv"
$DataDir   = Join-Path $ScriptDir "data"
$MediaDir  = Join-Path $ScriptDir "media"
$Port      = 5050

$VenvPython  = Join-Path $Venv "Scripts\python.exe"
$VenvActivate = Join-Path $Venv "Scripts\Activate.ps1"

# ── Venv check ────────────────────────────────────────────────────────────────
if (-not (Test-Path $VenvPython)) {
    Write-Host "  [ERROR] Virtual environment not found." -ForegroundColor Red
    Write-Host "  Run install-windows.ps1 first to set up FamilyRoot." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

# Activate the venv
. $VenvActivate
Write-Host "  [OK] Virtual environment activated" -ForegroundColor Green

# ── Ensure data directories exist ─────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path "$MediaDir\originals"  | Out-Null
New-Item -ItemType Directory -Force -Path "$MediaDir\thumbnails" | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir               | Out-Null

# ── Check for frontend build ──────────────────────────────────────────────────
$DistIndex = Join-Path $Frontend "dist\index.html"
if (Test-Path $DistIndex) {
    Write-Host "  [OK] Frontend build found" -ForegroundColor Green
} else {
    Write-Host "  [WARN] No frontend build found — UI may not load." -ForegroundColor Yellow
    Write-Host "         Run install-windows.ps1 to build the frontend." -ForegroundColor Yellow
}

# ── Launch ────────────────────────────────────────────────────────────────────
$env:PORT             = $Port
$env:DEBUG            = "0"
$env:FAMILYROOT_MEDIA = $MediaDir

Write-Host ""
Write-Host "  Starting FamilyRoot on http://localhost:$Port" -ForegroundColor Green
Write-Host "  Close this window to stop." -ForegroundColor Gray
Write-Host ""

# Open browser after Flask has had a moment to start
Start-Job {
    Start-Sleep 3
    Start-Process "http://localhost:5050"
} | Out-Null

Set-Location $Backend
& $VenvPython app.py
