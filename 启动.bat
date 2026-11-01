@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Please follow the opening guide first.
  pause
  exit /b 1
)
start "AI 数据搜索台" http://127.0.0.1:4173
node src/server.js
pause
