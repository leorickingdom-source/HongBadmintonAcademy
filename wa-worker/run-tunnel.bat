@echo off
title HBA WA Tunnel
cd /d "%~dp0"
if exist "%~dp0.node\node.exe" set "PATH=%~dp0.node;%PATH%"
REM Cloudflare tunnel + URL self-registration; auto-restart if it exits.
:loop
node tunnel.mjs >> "%~dp0tunnel.log" 2>&1
timeout /t 3 /nobreak >nul
goto loop
