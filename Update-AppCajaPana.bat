@echo off
setlocal
cd /d "%~dp0"

echo AppCajaPana updater
echo.
echo This will download the latest version from GitHub, create a backup,
echo and install the updated files in this folder.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update-app.ps1"

echo.
pause
