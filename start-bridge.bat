@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "BRIDGE_CLIENT_ID=%~1"
if "%BRIDGE_CLIENT_ID%"=="" set "BRIDGE_CLIENT_ID=default"
echo [INFO] BRIDGE_CLIENT_ID=%BRIDGE_CLIENT_ID%

if not exist "bridge\bridge.py" (
  echo [ERROR] Could not find bridge\bridge.py in:
  echo         %CD%
  exit /b 1
)

set "PYCMD="
where py >nul 2>&1
if %errorlevel%==0 set "PYCMD=py -3"

if not defined PYCMD (
  where python >nul 2>&1
  if %errorlevel%==0 set "PYCMD=python"
)

if not defined PYCMD (
  echo [WARN] Python was not found. Falling back to PowerShell relay...
  if not exist "bridge\relay.ps1" (
    echo [ERROR] Could not find bridge\relay.ps1
    exit /b 1
  )
  echo [INFO] Starting PowerShell relay...
  start "TradeAutomate Relay" cmd /k "cd /d ""%CD%"" && powershell -NoProfile -ExecutionPolicy Bypass -File ""bridge\relay.ps1"" -ClientId ""%BRIDGE_CLIENT_ID%"""
  goto :healthcheck
)

echo [INFO] Using Python launcher: %PYCMD%
%PYCMD% --version
if errorlevel 1 (
  echo [ERROR] Python launcher failed.
  exit /b 1
)

echo [INFO] Installing bridge dependencies...
%PYCMD% -m pip install --disable-pip-version-check -r bridge\requirements.txt
if errorlevel 1 (
  echo [ERROR] Failed to install requirements.
  exit /b 1
)

echo [INFO] Starting bridge...
start "TradeAutomate Bridge" cmd /k "cd /d ""%CD%"" && set BRIDGE_CLIENT_ID=%BRIDGE_CLIENT_ID% && %PYCMD% bridge\bridge.py"

:healthcheck
echo [INFO] Waiting for bridge health endpoint...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 25;$i++){ try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:5001/health' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ $ok=$true; break } } catch {}; Start-Sleep -Seconds 1 }; if($ok){ Write-Host '[OK] Bridge is running: http://127.0.0.1:5001/health'; exit 0 } else { Write-Host '[WARN] Bridge window started, but health check is not ready yet.'; exit 1 }"

if errorlevel 1 (
  echo [WARN] Check the "TradeAutomate Bridge" window for errors.
  exit /b 1
)

echo [DONE] Bridge startup check passed.
exit /b 0
