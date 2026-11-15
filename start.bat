@echo off
chcp 65001 >nul
title MediaPipe Demo
cd /d "%~dp0"

set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"

if not defined NODE_EXE (
  if exist "D:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=D:\Program Files (x86)\nodejs\node.exe"
)
if not defined NODE_EXE (
  for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%D\node.exe" set "NODE_EXE=%%D\node.exe"
  )
)

if not defined NODE_EXE (
  echo.
  echo [ERROR] Node.js not found.
  echo Install Node.js 18+ or run this folder with any static server.
  echo.
  pause
  exit /b 1
)

"%NODE_EXE%" server.js
if errorlevel 1 pause
