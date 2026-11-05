@echo off
title Dark Venus Bridge Watchdog
cd /d "%~dp0"
set BRIDGE_CLIENT_ID=0000
python bridge\watchdog.py
pause
