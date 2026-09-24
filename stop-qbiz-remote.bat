@echo off
title QBiz Kho - Dung dich vu Remote
cd /d "%~dp0"

echo ===================================================
echo   DANG DUNG TOAN BO DICH VU CHAY NGAM QBIZ KHO
echo ===================================================
echo.

powershell.exe -ExecutionPolicy Bypass -Command "& {
    # 1. Dung python tren port 4180
    Get-NetTCPConnection -LocalPort 4180 -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id `$_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    # 2. Dung cloudflared
    Stop-Process -Name 'cloudflared' -Force -ErrorAction SilentlyContinue
    # 3. Dung localtunnel
    Get-CimInstance Win32_Process | Where-Object { `$_.Name -eq 'node.exe' -and `$_.CommandLine -like '*localtunnel*' } | ForEach-Object {
        Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    # 4. Go bo khoi Windows Startup
    `$startup = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
    `$lnk = Join-Path `$startup 'QBizKhoRemote.lnk'
    `$vbs = Join-Path `$startup 'qbiz-remote-autostart.vbs'
    if (Test-Path `$lnk) { Remove-Item `$lnk -Force }
    if (Test-Path `$vbs) { Remove-Item `$vbs -Force }
}"

echo [OK] Da dung tat ca tien trinh (Python 4180, Cloudflare, Localtunnel).
echo [OK] Da go bo khoi tu dong khoi dong Windows Startup.
echo.
echo Cua so nay se tu dong dong sau 3 giay...
ping 127.0.0.1 -n 4 >nul
exit
