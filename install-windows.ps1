# FamilyRoot — Windows Installer
# Run with: powershell -ExecutionPolicy Bypass -File install-windows.ps1
# Or right-click → "Run with PowerShell"

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Host.UI.RawUI.WindowTitle = "FamilyRoot Installer"

# ── Helper functions ──────────────────────────────────────────────────────────
function Info    { param([string]$msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Success { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn    { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Die     {
    param([string]$msg)
    Write-Host ""
    Write-Host "  [ERROR] $msg" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   FamilyRoot — Windows Installer" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""

# ── Paths ─────────────────────────────────────────────────────────────────────
$Root     = $PSScriptRoot
$Backend  = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Venv     = Join-Path $Root "venv"
$DataDir  = Join-Path $Root "data"
$MediaDir = Join-Path $Root "media"
$Port     = 5050

# ── 1. Check prerequisites: Python 3.9+ ───────────────────────────────────────
Info "Checking for Python 3.9+..."

$Python = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $v = & $cmd --version 2>&1
        if ($v -match "Python 3\.(9|1[0-9]|[2-9][0-9])") {
            $Python = $cmd
            break
        }
    } catch {}
}

if (-not $Python) {
    Write-Host ""
    Write-Host "  [ERROR] Python 3.9 or newer was not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Install Python using one of these methods:" -ForegroundColor Yellow
    Write-Host "    winget install Python.Python.3.12" -ForegroundColor Yellow
    Write-Host "    Direct download: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "    (Tick 'Add Python to PATH' during install)" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

$pyVersion = & $Python --version 2>&1
Success "Python found: $pyVersion ($Python)"

# ── 2. Check prerequisites: Node.js 18+ ───────────────────────────────────────
Info "Checking for Node.js 18+..."

$NodeOk = $false
try {
    $nodeVer = & node --version 2>&1
    if ($nodeVer -match "v(\d+)\." -and [int]$Matches[1] -ge 18) {
        $NodeOk = $true
        Success "Node.js found: $nodeVer"
    } else {
        Warn "Node.js found but version is too old ($nodeVer). Need 18+."
        Write-Host "    winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
        Write-Host "    Direct download: https://nodejs.org/en/download" -ForegroundColor Yellow
    }
} catch {
    Warn "Node.js not found — frontend build will be skipped."
    Write-Host "    Install with: winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
    Write-Host "    Or download from: https://nodejs.org/en/download" -ForegroundColor Yellow
}

Write-Host ""

# ── 3. Create venv and install Python packages ────────────────────────────────
$VenvPython = Join-Path $Venv "Scripts\python.exe"
$VenvPip    = Join-Path $Venv "Scripts\pip.exe"

if (-not (Test-Path $VenvPython)) {
    Info "Creating Python virtual environment at .\venv ..."
    try {
        & $Python -m venv $Venv
    } catch {
        Die "Could not create virtual environment. Is Python installed correctly?"
    }
    Success "Virtual environment created"
} else {
    Success "Virtual environment already exists"
}

Info "Upgrading pip..."
try {
    & $VenvPip install --upgrade pip --quiet
} catch {
    Warn "pip upgrade failed — continuing anyway"
}

Info "Installing Python dependencies from backend\requirements.txt ..."
try {
    & $VenvPip install -r "$Backend\requirements.txt" --quiet
} catch {
    Warn "Some Python packages failed to install (face AI libraries are optional on Windows)."
    Write-Host "    Core features (photos, Gramps import, map) will still work." -ForegroundColor Yellow
}

# Verify Flask installed
try {
    & $VenvPython -c "import flask" 2>&1 | Out-Null
    Success "Python dependencies ready"
} catch {
    Die "Flask did not install correctly. Check the output above and ensure you have enough disk space."
}

Write-Host ""

# ── 4. Build frontend ─────────────────────────────────────────────────────────
$DistIndex = Join-Path $Frontend "dist\index.html"

if (Test-Path $DistIndex) {
    Success "Using existing frontend build"
} elseif ($NodeOk) {
    Info "Installing Node.js dependencies..."
    try {
        Push-Location $Frontend
        $npmInstall = npm install 2>&1
        if ($LASTEXITCODE -ne 0) {
            Pop-Location
            Warn "npm install failed. UI will not load until this is resolved."
        } else {
            Info "Building React frontend..."
            $npmBuild = npm run build 2>&1
            Pop-Location
            if ($LASTEXITCODE -ne 0) {
                Warn "npm run build failed. Check the output above."
            } elseif (Test-Path $DistIndex) {
                Success "Frontend built successfully"
            } else {
                Warn "Build completed but dist/index.html not found."
            }
        }
    } catch {
        if ((Get-Location).Path -eq $Frontend) { Pop-Location }
        Warn "Frontend build encountered an error: $_"
    }
} else {
    Warn "Skipping frontend build (Node.js not available or too old)."
    Write-Host "    After installing Node.js 18+, run: npm install && npm run build" -ForegroundColor Yellow
    Write-Host "    from the frontend\ folder." -ForegroundColor Yellow
}

Write-Host ""

# ── 5. Create data directories ────────────────────────────────────────────────
Info "Creating data directories..."
New-Item -ItemType Directory -Force -Path $DataDir                    | Out-Null
New-Item -ItemType Directory -Force -Path "$MediaDir\originals"       | Out-Null
New-Item -ItemType Directory -Force -Path "$MediaDir\thumbnails"      | Out-Null
Success "Directories ready (data\, media\originals\, media\thumbnails\)"

Write-Host ""

# ── 6. Write FamilyRoot.bat launcher ─────────────────────────────────────────
$BatPath = Join-Path $Root "FamilyRoot.bat"
$BatContent = @"
@echo off
title FamilyRoot
setlocal

set "ROOT=%~dp0"
set "VENV_PYTHON=%ROOT%venv\Scripts\python.exe"
set "BACKEND=%ROOT%backend"
set "MEDIA_DIR=%ROOT%media"

if not exist "%VENV_PYTHON%" (
    echo [ERROR] Virtual environment not found.
    echo Run install-windows.ps1 first.
    pause
    exit /b 1
)

set PORT=5050
set DEBUG=0
set "FAMILYROOT_MEDIA=%MEDIA_DIR%"

echo.
echo  FamilyRoot starting on http://localhost:%PORT%
echo  Close this window to stop.
echo.

:: Open browser after 3 second delay
start "" /min cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:%PORT%"

cd /d "%BACKEND%"
"%VENV_PYTHON%" app.py
"@

Set-Content -Path $BatPath -Value $BatContent -Encoding ASCII
Success "Created FamilyRoot.bat launcher"

Write-Host ""

# ── 7. Optional: Windows scheduled task for auto-start ───────────────────────
$autoStart = Read-Host "  Start FamilyRoot automatically at login? (y/n)"
if ($autoStart -match "^[Yy]") {
    Info "Registering scheduled task 'FamilyRoot' for current user..."
    try {
        $action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$BatPath`"" -WorkingDirectory $Root
        $trigger = New-ScheduledTaskTrigger -AtLogOn
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 24) -MultipleInstances IgnoreNew
        $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

        Register-ScheduledTask `
            -TaskName "FamilyRoot" `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -Principal $principal `
            -Force | Out-Null

        Success "Scheduled task 'FamilyRoot' registered — will start at next login"
    } catch {
        Warn "Could not register scheduled task: $_"
        Write-Host "    You can add it manually via Task Scheduler if needed." -ForegroundColor Yellow
    }
} else {
    Info "Skipping auto-start task"
}

Write-Host ""

# ── Success banner ────────────────────────────────────────────────────────────
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   FamilyRoot installation complete!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Local URL : " -NoNewline -ForegroundColor Cyan
Write-Host "http://localhost:$Port" -ForegroundColor White
Write-Host ""
Write-Host "  To start FamilyRoot:" -ForegroundColor Cyan
Write-Host "    Double-click  FamilyRoot.bat  in this folder" -ForegroundColor White
Write-Host "    — or —" -ForegroundColor Gray
Write-Host "    Right-click start-windows.ps1 → Run with PowerShell" -ForegroundColor White
Write-Host ""
Write-Host "  Integration scripts (Gramps, Photoprism, etc.):" -ForegroundColor Cyan
Write-Host "    See the scripts\ folder for optional integrations" -ForegroundColor White
Write-Host ""
Write-Host "  Tip: Pin FamilyRoot.bat to your taskbar or Start menu" -ForegroundColor Yellow
Write-Host "       for quick access." -ForegroundColor Yellow
Write-Host ""

Read-Host "  Press Enter to exit"
