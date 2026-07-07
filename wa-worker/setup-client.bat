@echo off
setlocal enabledelayedexpansion
title HBA WhatsApp Worker - Setup
cd /d "%~dp0"

echo ==================================================
echo    HBA WhatsApp Worker  -  one-time setup
echo ==================================================
echo.

REM ----- 1/6  Node (download portable if not installed) -----
where node >nul 2>&1
if %errorlevel%==0 (
  echo [1/6] Node found on PATH.
) else if exist "%~dp0.node\node.exe" (
  echo [1/6] Portable Node already present.
  set "PATH=%~dp0.node;%PATH%"
) else (
  echo [1/6] Downloading portable Node ^(one time, ~30 MB^)...
  powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip' -OutFile 'node.zip'"
  if not exist "node.zip" ( echo    ERROR: Node download failed. Check internet. & pause & exit /b 1 )
  powershell -NoProfile -Command "Expand-Archive -Path 'node.zip' -DestinationPath '.nodetmp' -Force"
  move ".nodetmp\node-v20.18.0-win-x64" ".node" >nul
  rmdir /s /q ".nodetmp" 2>nul
  del "node.zip" 2>nul
  set "PATH=%~dp0.node;%PATH%"
)

REM ----- 2/6  cloudflared -----
if exist "cloudflared.exe" (
  echo [2/6] cloudflared present.
) else (
  echo [2/6] Downloading cloudflared...
  powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
  if not exist "cloudflared.exe" ( echo    ERROR: cloudflared download failed. & pause & exit /b 1 )
)

REM ----- 3/6  .env (shared secret) -----
if exist ".env" (
  echo [3/6] .env present ^(keeping it^).
) else (
  echo [3/6] Paste the WA_WORKER_SECRET ^(the SAME value set in Vercel^):
  set /p "WSEC=      Secret: "
  >  ".env" echo WA_WORKER_SECRET=!WSEC!
  >> ".env" echo PORT=8787
)

REM ----- 4/6  dependencies -----
if exist "node_modules" (
  echo [4/6] Dependencies present.
) else (
  echo [4/6] Installing dependencies...
  call npm install
)

REM ----- 5/6  autostart on login -----
echo [5/6] Registering autostart ^(runs on every login^)...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'HBA-WA-Worker.lnk')); $s.TargetPath='%~dp0run.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Description='HBA WhatsApp worker'; $s.Save()"

REM ----- 6/6  launch + open the QR to scan -----
echo [6/6] Starting the worker...
start "" "%~dp0run.bat"
echo       booting ^(~10s^)...
timeout /t 12 /nobreak >nul
for /f "usebackq tokens=1* delims==" %%a in ("%~dp0.env") do if "%%a"=="WA_WORKER_SECRET" set "WSEC=%%b"
start "" "http://localhost:8787/qr?secret=!WSEC!"

echo.
echo ==================================================
echo   DONE installing.  2 things left:
echo.
echo   1) SCAN the QR page that just opened, using the
echo      dedicated WhatsApp SIM  ^(WhatsApp -^> Linked
echo      devices -^> Link a device^).
echo.
echo   2) OPTIONAL - so reboots need nobody:
echo      Win+R  -^>  netplwiz  -^>  Enter  -^>  uncheck
echo      "Users must enter a user name and password"
echo      -^>  Apply  -^>  type the Windows password.
echo ==================================================
echo.
pause
