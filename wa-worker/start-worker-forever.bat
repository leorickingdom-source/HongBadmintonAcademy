@echo off
setlocal enabledelayedexpansion
title HBA WhatsApp Worker (auto-restart)

REM ============================================================
REM  HBA WhatsApp worker — auto-restart launcher (Windows).
REM  Same as start-worker.bat but RELAUNCHES the worker if it
REM  crashes/exits. Keep this window open (or minimised).
REM
REM  This is a stopgap for always-on. It does NOT survive a
REM  reboot or run before login. For real always-on, install as
REM  a Windows service with NSSM (see OPERATING.md).
REM ============================================================

cd /d "%~dp0"

REM --- Node present? -----------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [X] Node.js not found on PATH.
  echo     Install Node 20+ LTS from https://nodejs.org then re-run.
  echo.
  pause
  exit /b 1
)

REM --- Config present? ---------------------------------------
if not exist ".env" (
  echo [X] No .env file found.
  echo     1. Copy .env.example to .env
  echo     2. Set WA_WORKER_SECRET to the SAME value as Vercel's WA_WORKER_SECRET
  echo     3. Keep APP_URL set to enable auto-reminders
  echo.
  pause
  exit /b 1
)

REM --- Dependencies present? ---------------------------------
if not exist "node_modules" (
  echo Installing dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 (
    echo [X] npm install failed.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo HBA WhatsApp worker — auto-restart mode.
echo   - QR / link:  http://localhost:8787/qr?secret=YOUR_SECRET
echo   - Health:     http://localhost:8787/health
echo   - Stop for good: close this window
echo.

:loop
echo [%date% %time%] starting worker...
node server.mjs
echo.
echo [%date% %time%] [!] worker exited. Restarting in 5s... (close window to stop)
timeout /t 5 /nobreak >nul
goto loop
