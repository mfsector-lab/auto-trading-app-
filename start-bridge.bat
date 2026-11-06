@echo off
title Dark Venus Bridge Watchdog
cd /d "%~dp0"
set BRIDGE_CLIENT_ID=0000
where python >nul 2>nul
if %errorlevel% neq 0 (
  set PYTHON_EXE=C:\Users\rio_j\AppData\Local\Python\pythoncore-3.14-64\python.exe
) else (
  for /f "tokens=*" %%i in ('where python') do set PYTHON_EXE=%%i
)
"%PYTHON_EXE%" bridge\watchdog.py
exit /b 0
