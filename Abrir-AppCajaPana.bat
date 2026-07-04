@echo off
setlocal
cd /d "%~dp0"

set "APP_URL=file:///%CD:\=/%/index.html"
set "APP_PROFILE=%CD%\_perfil_caja"

if not exist "%APP_PROFILE%" mkdir "%APP_PROFILE%"

if exist "%CD%\tools\update-app.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\tools\update-app.ps1" -Auto -Quiet
)

if exist "%CD%\Browser\chrome.exe" (
  start "" "%CD%\Browser\chrome.exe" --app="%APP_URL%" --user-data-dir="%APP_PROFILE%" --disable-extensions --disable-background-networking --disable-sync
  exit /b
)

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%" --user-data-dir="%APP_PROFILE%" --disable-extensions --disable-background-networking --disable-sync
  exit /b
)

if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%" --user-data-dir="%APP_PROFILE%" --disable-extensions --disable-background-networking --disable-sync
  exit /b
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%" --user-data-dir="%APP_PROFILE%" --disable-extensions --disable-background-networking --disable-sync
  exit /b
)

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%" --user-data-dir="%APP_PROFILE%" --disable-extensions --disable-background-networking --disable-sync
  exit /b
)

if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" (
  start "" "%ProgramFiles%\Mozilla Firefox\firefox.exe" -profile "%APP_PROFILE%" "%APP_URL%"
  exit /b
)

if exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" (
  start "" "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" -profile "%APP_PROFILE%" "%APP_URL%"
  exit /b
)

echo No se encontro Chrome, Edge ni Firefox.
echo.
echo Se va a abrir con el navegador predeterminado, pero si es Internet Explorer
echo la app puede no funcionar bien. Para Windows 7 viejo, instalar un navegador
echo liviano compatible y volver a ejecutar este archivo.
echo.
pause
start "" "%APP_URL%"
