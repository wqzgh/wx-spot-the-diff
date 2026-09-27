@echo off
cd /d "%~dp0"
title 找不同标注工具 - 本地服务

set PY=C:\Users\wqzghwq\.workbuddy\binaries\python\versions\3.13.12\python.exe
if not exist "%PY%" (
  where python >nul 2>nul
  if %errorlevel%==0 (set PY=python) else (
    echo Python not found. Open index.html with Chrome or Edge directly.
    pause
    goto :eof
  )
)

"%PY%" start-server.py
echo.
echo 服务已停止。
pause
