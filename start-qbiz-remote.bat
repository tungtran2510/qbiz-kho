@echo off
title QBiz Kho - Remote Access Tunnel
cd /d "%~dp0"

echo ===================================================
echo   QBIZ KHO - DICH VU TRUY CAP TU XA CO DINH
echo ===================================================

:: 1. Kiem tra va khoi dong Local Web Server neu chua co
netstat -ano | findstr :4180 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [1/3] Dang khoi dong Local Server tai port 4180...
    start /b "" "C:\Users\Admin\AppData\Local\Programs\Python\Python313\python.exe" -m http.server 4180 --bind 0.0.0.0
    timeout /t 2 /nobreak >nul
) else (
    echo [1/3] Local Server port 4180 da san sang.
)

:: 2. Khoi dong Localtunnel co dinh subdomain (qbiz-kho-2026.loca.lt)
echo [2/3] Dang ket noi Backup Tunnel (loca.lt)...
start /b "" "C:\Users\Admin\.agent-reach\tools\node\node-v24.21.0-win-x64\npx.cmd" --yes localtunnel --port 4180 --subdomain qbiz-kho-2026 > "%~dp0localtunnel.log" 2>&1

:: 3. Khoi dong Cloudflare Tunnel
echo [3/3] Dang ket noi Primary Tunnel (Cloudflare)...
start /b "" "D:\google driver\Codex PC\QBiz Connect (Quản lý & Kết nối Quan hệ)\cloudflared.exe" tunnel --url http://127.0.0.1:4180 > "%~dp0cloudflare.log" 2>&1

echo.
echo ===================================================
echo DA KHOI DONG THANH CONG CAC DUONG TRUY CAP:
echo 1. Cloudflare: Xem link moi nhat trong cloudflare.log
echo 2. Localtunnel: https://qbiz-kho-2026.loca.lt
echo ===================================================
