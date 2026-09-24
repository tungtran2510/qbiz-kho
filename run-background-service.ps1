# run-background-service.ps1 - QBiz Kho Remote Background Service
$ErrorActionPreference = "SilentlyContinue"

# Xac dinh thu muc app
$appDir = $PSScriptRoot
if (-not $appDir) {
    $appDir = (Get-Item -LiteralPath ".").FullName
}
Set-Location -LiteralPath $appDir

$wsh = New-Object -ComObject WScript.Shell
$wsh.CurrentDirectory = $appDir

# 1. Kiem tra va khoi dong Local Web Server port 4180 bang pythonw.exe
$conn = Get-NetTCPConnection -LocalPort 4180 -State Listen -ErrorAction SilentlyContinue
if (-not $conn) {
    $pyw = "C:\Users\Admin\AppData\Local\Programs\Python\Python313\pythonw.exe"
    $serverPy = Join-Path $appDir "server.py"
    if (Test-Path -LiteralPath $pyw) {
        $null = $wsh.Run("cmd.exe /c start `"`" `"$pyw`" `"$serverPy`"", 0, $false)
    } else {
        $null = $wsh.Run("cmd.exe /c start `"`" pythonw.exe `"$serverPy`"", 0, $false)
    }
    Start-Sleep -Seconds 2
}

# 2. Khoi dong Localtunnel
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -like "*localtunnel*" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
$npx = "C:\Users\Admin\.agent-reach\tools\node\node-v24.21.0-win-x64\npx.cmd"
if (Test-Path -LiteralPath $npx) {
    $null = $wsh.Run("cmd.exe /c start `"`" `"$npx`" --yes localtunnel --port 4180 --subdomain qbiz-kho-2026", 0, $false)
}

# 3. Tim va khoi dong Cloudflare Tunnel (chi dong tunnel cua QBiz Kho port 4180)
Get-CimInstance Win32_Process | Where-Object { $_.Name -like "*cloudflared*" -and $_.CommandLine -like "*4180*" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1

$docRoot = (Get-Item -LiteralPath $appDir).Parent.FullName
$baseDir = (Get-Item -LiteralPath $docRoot).Parent.FullName
$cf = Join-Path $baseDir "QBiz Connect (Quản lý & Kết nối Quan hệ)\cloudflared.exe"
$logPath = Join-Path $appDir "cloudflare.log"

if (Test-Path -LiteralPath $cf) {
    $null = $wsh.Run("cmd.exe /c start `"`" `"$cf`" tunnel --url http://127.0.0.1:4180 --logfile `"$logPath`"", 0, $false)
}

# 4. Cho Cloudflare cap nhat link (6 giay)
Start-Sleep -Seconds 6
$cfUrl = ""
if (Test-Path -LiteralPath $logPath) {
    $rawLog = Get-Content -LiteralPath $logPath -ErrorAction SilentlyContinue | Out-String
    if ($rawLog -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
        $cfUrl = $matches[1]
    }
}
if (-not $cfUrl) {
    $cfUrl = "Dang tao link Cloudflare (Vui long mo lai remote-links.txt sau vai giay)..."
}

# 5. Lay IP mang LAN va Public IP
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "*Wi-Fi*","*Ethernet*" -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" } | Select-Object -First 1).IPAddress
if (-not $lanIp) { $lanIp = "192.168.1.10" }

$publicIp = "14.177.223.16"

$linksContent = @"
===================================================================
          QBIZ KHO - DICH VU TRUY CAP TU XA (CHAY NGAM 30 NGAY)
===================================================================
Thoi gian khoi dong: $(Get-Date -Format "dd/MM/yyyy HH:mm:ss")
Trang thai: DANG CHAY NGAM (KHONG CAN MO CUA SO CONSOLE)

[1] LINK CLOUDFLARE TUNNEL (Truy cap tu xa bat ky dau - Khong can mat khau):
    $cfUrl

[2] LINK LOCALTUNNEL CO DINH (Truy cap tu xa backup):
    https://qbiz-kho-2026.loca.lt
    * Mat khau nhap vao web: $publicIp (Chinh la IP mang cua may chu)

[3] LINK MANG LAN WIFI (Nhanh nhat - Khi dien thoai cung bat Wi-Fi nay):
    http://${lanIp}:4180

===================================================================
* Huong dan su dung tren dien thoai:
  - Mo Zalo/Camera quet QR hoac gui link vao Zalo de bam mo tren dien thoai.
  - Tren dien thoai: Bam nut Chia se / Menu trinh duyet -> chon "Them vao Man hinh chinh" (Add to Home screen)
    de tao bieu tuong mo app toan man hinh nhu ung dung that!

* Dung hoan toan dich vu:
  Chay file "stop-qbiz-remote.bat" trong thu muc app.
===================================================================
"@

$linksFile = Join-Path $appDir "remote-links.txt"
[System.IO.File]::WriteAllText($linksFile, $linksContent, [System.Text.Encoding]::UTF8)

# 6. Dang ky khoi dong tu dong trong Windows Startup (Duy tri chay ngam trong 30 ngay)
$startup = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$lnkPath = Join-Path $startup "QBizKhoRemote.lnk"
$shortcut = $wsh.CreateShortcut($lnkPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$appDir\run-background-service.ps1`""
$shortcut.WindowStyle = 7
$shortcut.WorkingDirectory = $appDir
$shortcut.Save()