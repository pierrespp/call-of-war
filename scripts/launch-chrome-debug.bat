@echo off
echo ===================================================
echo Iniciando Google Chrome com Remote Debugging (Porta 9222)
echo ===================================================

REM Tenta caminhos comuns do executável do Chrome no Windows
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

set PROFILE_DIR="%~dp0..\scratch\chrome-debug-profile"

if not exist %PROFILE_DIR% mkdir %PROFILE_DIR%

start "" %CHROME_PATH% --remote-debugging-port=9222 --user-data-dir=%PROFILE_DIR% --no-first-run --no-default-browser-check http://localhost:3000
echo Chrome iniciado! Você pode conectar ferramentas via DevTools Protocol em http://localhost:9222
