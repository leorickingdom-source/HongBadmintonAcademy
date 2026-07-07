@echo off
setlocal enabledelayedexpansion
title HBA WhatsApp Worker

REM ============================================================
REM  HBA WhatsApp worker launcher (Windows).
REM  Double-click to start. Keeps the window open on exit/crash
REM  so you can read errors. For always-on, install as a service
REM  with NSSM instead (see OPERATING.md).
REM ============================================================

REM Run from this script's own folder no matter where it's launched.
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

REM --- Run ----------------------------------------------------
echo.
echo Starting HBA WhatsApp worker...
echo   - QR / link:  http://localhost:8787/qr?secret=YOUR_SECRET
echo   - Health:     http://localhost:8787/health
echo   - Stop:       close this window or press Ctrl+C
echo.
node server.mjs

REM If node exits (crash / stop), hold the window so the error stays visible.
echo.
echo [!] Worker stopped.
pause
