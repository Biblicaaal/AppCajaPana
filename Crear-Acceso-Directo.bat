@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$desk=[Environment]::GetFolderPath('Desktop'); $ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut((Join-Path $desk 'AppCajaPana.lnk')); $sc.TargetPath=(Join-Path (Get-Location) 'AppCajaPana.vbs'); $sc.WorkingDirectory=(Get-Location).Path; $sc.IconLocation=(Join-Path (Get-Location) 'assets\logo.png'); $sc.Save()"

echo Acceso directo creado en el escritorio.
pause
