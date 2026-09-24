@echo off
title QBiz Kho - Khoi dong dich vu tu xa
cd /d "%~dp0"

echo ===================================================================
echo             QBIZ KHO - HE THONG KET NOI DIEN THOAI TU XA
echo ===================================================================
echo.

:: 1. Kiem tra va khoi dong Local Server chay ngam
netstat -ano | findstr :4180 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [*] Dang khoi dong may chu ngam tai port 4180...
    start "" /b "C:\Users\Admin\AppData\Local\Programs\Python\Python313\pythonw.exe" server.py
    ping 127.0.0.1 -n 3 >nul
) else (
    echo [OK] May chu Web noi bo (Port 4180) dang hoat dong.
)

:: 2. Kiem tra va khoi dong Cloudflare Tunnel chay ngam
tasklist /fi "imagename eq cloudflared.exe" 2>nul | findstr /i "cloudflared.exe" >nul
if %errorlevel% neq 0 (
    echo [*] Dang khoi dong ket noi Cloudflare Tunnel...
    start "" /b cloudflared.exe tunnel --url http://127.0.0.1:4180
    ping 127.0.0.1 -n 4 >nul
) else (
    echo [OK] Ket noi Cloudflare Tunnel tu xa dang hoat dong.
)

:: 3. Tu dong mo trang ma QR tren man hinh may tinh de dien thoai quet
start "" "http://localhost:4180/qr-mobile.html"

echo.
echo ===================================================================
echo   DA KHOI DONG THANH CONG! MAY CHU DANG CHAY NGAM LIEN TUC.
echo ===================================================================
echo.
echo 1. DUONG LINK MO TREN DIEN THOAI (4G / 5G / NGOAI DUONG):
echo    https://frontpage-functional-ext-dim.trycloudflare.com
echo.
echo 2. QUET MA QR NHANH:
echo    Trang ma QR da duoc tu dong mo tren trinh duyet may tinh!
echo    Chi can lay dien thoai, bat Camera roi vao ma QR tren man hinh.
echo.
echo ===================================================================
echo LUU Y:
echo - Cac tien trinh da duoc chay ngam tren he thong.
echo - Ban co the DONG (tat) cua so nay hoac thu nho lai tuy y.
echo - He thong van se tiep tuc chay ngam phuc vu cho dien thoai!
echo ===================================================================
echo.
pause
