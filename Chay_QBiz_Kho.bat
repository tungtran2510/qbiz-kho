@echo off
setlocal

if exist "%~dp0app\server.py" (
    cd /d "%~dp0app"
) else (
    cd /d "%~dp0"
)

REM 1. Kiem tra xem cong 4180 co dang lang nghe khong
netstat -ano | findstr ":4180 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [INFO] Dang khoi dong QBiz Kho Local Server...
    start /min "" python server.py
    timeout /t 2 /nobreak >nul
)

REM 2. Tim kiem Chrome hoac Edge de mo cua so ung dung rieng biet
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "EDGE_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "EDGE_64_EXE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

set "TARGET_URL=http://localhost:4180/preview.html"

if exist "%CHROME_EXE%" (
    start "" "%CHROME_EXE%" --app="%TARGET_URL%" --start-maximized
    exit /b
)

if exist "%EDGE_EXE%" (
    start "" "%EDGE_EXE%" --app="%TARGET_URL%" --start-maximized
    exit /b
)

if exist "%EDGE_64_EXE%" (
    start "" "%EDGE_64_EXE%" --app="%TARGET_URL%" --start-maximized
    exit /b
)

start "" "%TARGET_URL%"
exit /b