@echo off
title HBA WhatsApp Worker
cd /d "%~dp0"
REM Prefer the bundled portable Node (setup-client.bat downloads it), else PATH.
if exist "%~dp0.node\node.exe" set "PATH=%~dp0.node;%PATH%"
REM Bring up the tunnel manager in its own minimized window (self-registers URL).
start "HBA-Tunnel" /min cmd /c "%~dp0run-tunnel.bat"
REM Run the worker; auto-restart on any exit (crash or /logout re-link).
:loop
node server.mjs >> "%~dp0worker.log" 2>&1
echo [%date% %time%] worker exited - restarting in 3s >> "%~dp0worker.log"
timeout /t 3 /nobreak >nul
goto loop
