@echo off
setlocal EnableDelayedExpansion
title FamilyRoot
color 0A

echo.
echo  ==========================================
echo   FamilyRoot - Windows launcher
echo  ==========================================
echo.

:: Find Python
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

:: Locate folders
set "SCRIPT_DIR=%~dp0"
set "BACKEND=%SCRIPT_DIR%backend"
set "FRONTEND=%SCRIPT_DIR%frontend"
set "DATA_DIR=%SCRIPT_DIR%data"
set "MEDIA_DIR=%SCRIPT_DIR%media"
set "VENV=%SCRIPT_DIR%venv"
set "VENV_PYTHON=%VENV%\Scripts\python.exe"

if not exist "%BACKEND%\app.py" (
    echo  [ERROR] Cannot find backend\app.py
    echo  Make sure you run this .bat from the FamilyRoot folder.
    pause
    exit /b 1
)

:: Check disk space (need at least 500 MB free)
for /f "tokens=3" %%A in ('dir /-c "%SCRIPT_DIR%" ^| findstr "bytes free"') do set FREE_BYTES=%%A
set FREE_BYTES=%FREE_BYTES:,=%
if defined FREE_BYTES (
    set /a FREE_MB=%FREE_BYTES:~0,-6%
    if !FREE_MB! LSS 500 (
        echo  [ERROR] Less than 500 MB free on this drive.
        echo  pip needs space to download packages.
        echo  Free up disk space on C: then try again.
        pause
        exit /b 1
    )
    echo  [OK] Disk space OK ~!FREE_MB! MB free
)

:: Create dirs
if not exist "%DATA_DIR%"              mkdir "%DATA_DIR%"
if not exist "%MEDIA_DIR%\originals"   mkdir "%MEDIA_DIR%\originals"
if not exist "%MEDIA_DIR%\thumbnails"  mkdir "%MEDIA_DIR%\thumbnails"

:: Create venv
if not exist "%VENV_PYTHON%" (
    echo  Creating Python virtual environment...
    %PYTHON% -m venv "%VENV%"
    if errorlevel 1 (
        echo  [ERROR] Could not create venv.
        pause
        exit /b 1
    )
)

:: Install Python deps
:: --no-cache-dir prevents pip writing large temp files to disk
echo  Installing Python dependencies ^(first run may take a minute^)...
"%VENV_PYTHON%" -m pip install --upgrade pip --no-cache-dir --quiet
"%VENV_PYTHON%" -m pip install -r "%BACKEND%\requirements.txt" --no-cache-dir --quiet
if errorlevel 1 (
    echo.
    echo  [WARN] Some packages failed ^(face AI is optional on Windows^).
    echo  Core features ^(photos, Gramps import, map^) will still work.
    echo.
)
echo  [OK] Python dependencies ready

:: Check Flask actually installed (catches the disk-full case)
"%VENV_PYTHON%" -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Flask did not install - likely not enough disk space.
    echo  Free up space on C: and delete the venv folder, then retry.
    echo  venv folder: %VENV%
    pause
    exit /b 1
)
echo  [OK] Flask confirmed

:: Build frontend
set BUILT_FRONTEND=0
if exist "%FRONTEND%\dist\index.html" (
    echo  [OK] Using existing frontend build
    set BUILT_FRONTEND=1
)

if %BUILT_FRONTEND%==0 (
    where node >nul 2>&1
    if not errorlevel 1 (
        echo  Installing Node dependencies...
        pushd "%FRONTEND%"
        call npm install
        if errorlevel 1 (
            echo  [ERROR] npm install failed - check output above.
            popd
            goto :start_server
        )
        echo  Building React frontend...
        :: Call vite directly from node_modules - avoids npx version mismatch
        if exist "node_modules\.bin\vite.cmd" (
            call node_modules\.bin\vite.cmd build
        ) else (
            call node_modules\.bin\vite build
        )
        popd
        if exist "%FRONTEND%\dist\index.html" (
            echo  [OK] Frontend built
            set BUILT_FRONTEND=1
        ) else (
            echo  [WARN] Frontend build failed - UI will not load.
        )
    ) else (
        echo  [WARN] Node.js not found - skipping frontend build.
        echo         Download from https://nodejs.org then re-run this script.
        echo         The REST API will still work without Node.
    )
)

:start_server

:: Start Flask
set PORT=5050
set DEBUG=0
set "FAMILYROOT_MEDIA=%MEDIA_DIR%"

echo.
echo  Starting FamilyRoot on http://localhost:%PORT%
echo  Press Ctrl+C to stop.
echo.

:: Open browser after short delay
start "" /min cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%"

cd /d "%BACKEND%"
"%VENV_PYTHON%" app.py

echo.
echo  FamilyRoot stopped.
pause
