@echo off
setlocal EnableDelayedExpansion
title FamilyRoot
color 0A

echo.
echo  ==========================================
echo   FamilyRoot — Windows launcher
echo  ==========================================
echo.

:: ── Find Python ──────────────────────────────────────────────────────────────
set PYTHON=
for %%P in (python python3) do (
    if not defined PYTHON (
        %%P --version >nul 2>&1 && set PYTHON=%%P
    )
)
if not defined PYTHON (
    echo  [ERROR] Python not found.
    echo.
    echo  Download from: https://www.python.org/downloads/
    echo  Make sure to tick "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)

:: Check version >= 3.9
%PYTHON% -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python 3.9 or newer is required.
    %PYTHON% --version
    echo.
    pause
    exit /b 1
)
echo  [OK] %PYTHON% found

:: ── Locate backend folder ─────────────────────────────────────────────────────
set "SCRIPT_DIR=%~dp0"
set "BACKEND=%SCRIPT_DIR%backend"
set "FRONTEND=%SCRIPT_DIR%frontend"
set "DATA_DIR=%SCRIPT_DIR%data"
set "MEDIA_DIR=%SCRIPT_DIR%media"
set "VENV=%SCRIPT_DIR%venv"

if not exist "%BACKEND%\app.py" (
    echo  [ERROR] Cannot find backend\app.py
    echo  Make sure you run this .bat from the FamilyRoot folder.
    pause
    exit /b 1
)

:: ── Create data/media dirs ────────────────────────────────────────────────────
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%MEDIA_DIR%\originals"  mkdir "%MEDIA_DIR%\originals"
if not exist "%MEDIA_DIR%\thumbnails" mkdir "%MEDIA_DIR%\thumbnails"

:: ── Python venv ───────────────────────────────────────────────────────────────
if not exist "%VENV%\Scripts\python.exe" (
    echo  Creating Python virtual environment...
    %PYTHON% -m venv "%VENV%"
    if errorlevel 1 (
        echo  [ERROR] Could not create venv. Try: pip install virtualenv
        pause
        exit /b 1
    )
)

set "VENV_PYTHON=%VENV%\Scripts\python.exe"
set "VENV_PIP=%VENV%\Scripts\pip.exe"

echo  Installing Python dependencies ^(first run may take a minute^)...
"%VENV_PIP%" install --upgrade pip --quiet
"%VENV_PIP%" install -r "%BACKEND%\requirements.txt" --quiet
if errorlevel 1 (
    echo.
    echo  [WARN] Some packages failed. Trying without face AI...
    echo  Core features ^(photos, Gramps import, map^) will still work.
    echo.
)
echo  [OK] Python dependencies ready

:: ── Build frontend ─────────────────────────────────────────────────────────────
set BUILT_FRONTEND=0
if exist "%FRONTEND%\dist\index.html" (
    echo  [OK] Using existing frontend build
    set BUILT_FRONTEND=1
)

if %BUILT_FRONTEND%==0 (
    where node >nul 2>&1
    if not errorlevel 1 (
        echo  Building React frontend...
        pushd "%FRONTEND%"
        call npm install --silent
        call npm run build
        popd
        if exist "%FRONTEND%\dist\index.html" (
            echo  [OK] Frontend built
            set BUILT_FRONTEND=1
        ) else (
            echo  [WARN] Frontend build failed — UI will not load
        )
    ) else (
        echo  [WARN] Node.js not found — skipping frontend build.
        echo         Download from https://nodejs.org if you need the UI.
        echo         The REST API will still work.
    )
)

:: ── Start Flask ───────────────────────────────────────────────────────────────
set PORT=5050
set DEBUG=0
set "FAMILYROOT_MEDIA=%MEDIA_DIR%"

echo.
echo  Starting FamilyRoot on http://localhost:%PORT%
echo  Press Ctrl+C to stop.
echo.

:: Open browser after a short delay (give Flask time to start)
start "" /min cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%"

:: Run Flask in this window so Ctrl+C stops it cleanly
cd /d "%BACKEND%"
"%VENV_PYTHON%" app.py

echo.
echo  FamilyRoot stopped.
pause
