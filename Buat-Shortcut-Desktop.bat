@echo off
title Buat Shortcut Desktop Grand POS Optima
color 0B
echo =========================================================
echo   MEMBUAT SHORTCUT DESKTOP WINDOWS (GRAND POS OPTIMA)
echo =========================================================
echo.

set "APP_URL=http://localhost:3000"
set "VBS_SCRIPT=%TEMP%\create_pos_shortcut.vbs"
set "DESKTOP_DIR=%USERPROFILE%\Desktop"

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo sLinkFile = "%DESKTOP_DIR%\Grand POS Optima.lnk" >> "%VBS_SCRIPT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%VBS_SCRIPT%"

set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME_PATH%" (
    echo oLink.TargetPath = "%CHROME_PATH%" >> "%VBS_SCRIPT%"
    echo oLink.Arguments = "--app=%APP_URL% --start-maximized" >> "%VBS_SCRIPT%"
    echo Target: Google Chrome App Mode
) else (
    set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    if not exist "%EDGE_PATH%" set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    echo oLink.TargetPath = "%EDGE_PATH%" >> "%VBS_SCRIPT%"
    echo oLink.Arguments = "--app=%APP_URL% --start-maximized" >> "%VBS_SCRIPT%"
    echo Target: Microsoft Edge App Mode
)

echo oLink.Description = "Grand Aceh Kuliner POS App" >> "%VBS_SCRIPT%"
echo oLink.WorkingDirectory = "%USERPROFILE%" >> "%VBS_SCRIPT%"
echo oLink.Save >> "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%"

echo.
echo SUCCESS: Shortcut 'Grand POS Optima' telah berhasil dibuat di Desktop Windows!
echo Anda sekarang dapat membuka POS langsung dari ikon di Desktop.
echo.
pause
