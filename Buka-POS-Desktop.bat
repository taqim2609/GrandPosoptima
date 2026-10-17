@echo off
title Grand Aceh Kuliner POS Desktop Launcher
color 0A
echo ===================================================
echo   MEMBUKA GRAND ACEH KULINER POS (DESKTOP MODE)
echo ===================================================
echo.

set "APP_URL=http://localhost:3000"

set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"

set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_PATH%" set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%CHROME_PATH%" (
    echo Menggunakan Google Chrome App Mode...
    start "" "%CHROME_PATH%" --app="%APP_URL%" --start-maximized
    exit /b
)

if exist "%EDGE_PATH%" (
    echo Menggunakan Microsoft Edge App Mode...
    start "" "%EDGE_PATH%" --app="%APP_URL%" --start-maximized
    exit /b
)

echo Buka browser default...
start "" "%APP_URL%"
exit /b
