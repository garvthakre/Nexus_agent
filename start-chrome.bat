@echo off
title Nexus Chrome Debug Launcher
echo ========================================================
echo   Launching Chrome with Remote Debugging Port 9222
echo   This allows Nexus Floating Assistant to control tabs!
echo ========================================================
echo.

set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME_PATH%" (
    echo [ERROR] Google Chrome was not found at standard locations.
    pause
    exit /b 1
)

:: A dedicated profile is required for Chrome's remote-debugging port. Keep it
:: outside Chrome's normal User Data folder so a stale profile lock cannot stop
:: the panel from attaching.
set "PROFILE_DIR=%TEMP%\NexusChromeDebug"

set TARGET_URL=%1
if "%TARGET_URL%"=="" set TARGET_URL=about:blank

echo Launching Chrome with CDP port 9222 (URL: %TARGET_URL%)...
start "" "%CHROME_PATH%" --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="%PROFILE_DIR%" --no-first-run --no-default-browser-check %TARGET_URL%

echo Chrome launched successfully!
echo You can now navigate to any site (e.g. Paytm, Airtel) and use the Nexus Floating Assistant.
