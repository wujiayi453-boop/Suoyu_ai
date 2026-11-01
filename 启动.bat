@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 索yu - 启动窗口
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js：在打开的网页选择 LTS 版本，安装时保持默认选项。
  echo 安装完成后，关闭此窗口，再次双击启动.bat。
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)
node scripts/start-easy.js
if errorlevel 1 pause