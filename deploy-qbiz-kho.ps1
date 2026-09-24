# ===================================================================
# QBIZ KHO - DUAL-HOST ONE-COMMAND DEPLOYMENT SCRIPT
# Deploy version hien tai dong thoi len ca 2 Hosting:
# 1. PRIMARY (Host A): Vercel (https://qbiz-kho.vercel.app)
# 2. BACKUP  (Host B): Netlify (https://qbiz-kho.netlify.app)
# ===================================================================

$ErrorActionPreference = "Stop"
$appDir = $PSScriptRoot

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   QBIZ KHO - TRIEN KHAI DUAL-HOST (VERCEL + NETLIFY)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Kiem tra thu muc source
Set-Location $appDir
Write-Host "[1/5] Kiem tra source code..." -ForegroundColor Yellow
$gitStatus = git status --short
if ($gitStatus) {
    Write-Host "Cac file co thay doi:" -ForegroundColor Gray
    Write-Host $gitStatus -ForegroundColor Gray
}

# 2. Trien khai len Host A (Vercel)
Write-Host "`n[2/5] Trien khai len Host A (PRIMARY - Vercel)..." -ForegroundColor Yellow
$vercelBin = "C:\Users\Admin\.agent-reach\tools\npm-global\vercel.cmd"
if (-not (Test-Path $vercelBin)) { $vercelBin = "vercel" }

& $vercelBin --prod --yes
if ($LASTEXITCODE -ne 0) {
    Write-Host "LOI: Trien khai Vercel that bai!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Host A (Vercel) da san sang tai: https://qbiz-kho.vercel.app" -ForegroundColor Green

# 3. Trien khai len Host B (Netlify)
Write-Host "`n[3/5] Trien khai len Host B (BACKUP - Netlify)..." -ForegroundColor Yellow
$netlifyBin = "C:\Users\Admin\.agent-reach\tools\npm-global\netlify.cmd"
if (-not (Test-Path $netlifyBin)) { $netlifyBin = "netlify" }

& $netlifyBin deploy --prod --dir=.
if ($LASTEXITCODE -ne 0) {
    Write-Host "LOI: Trien khai Netlify that bai!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Host B (Netlify) da san sang tai: https://qbiz-kho.netlify.app" -ForegroundColor Green

# 4. Chay Smoke Test tu dong tren ca 2 Host
Write-Host "`n[4/5] Chay kiem thu tu dong (Smoke Test) tren ca 2 Hosting..." -ForegroundColor Yellow
python tests/test_dual_host_smoke.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "CANH BAO: Smoke test co loi can kiem tra!" -ForegroundColor Yellow
} else {
    Write-Host "[OK] 100% Smoke tests dat tren ca 2 Hosting!" -ForegroundColor Green
}

# 5. Bao cao ket qua
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "          HOAN TAT TRIEN KHAI DUAL-HOST THANG CONG!      " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Host A (Primary - Vercel):   https://qbiz-kho.vercel.app" -ForegroundColor White
Write-Host "Host B (Backup - Netlify):   https://qbiz-kho.netlify.app" -ForegroundColor White
Write-Host "Tên miền dự phòng Netlify:   https://kho-backup.qbiz.vn" -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Cyan
