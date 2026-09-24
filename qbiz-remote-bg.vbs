' qbiz-remote-bg.vbs - Chay ngam toan bo he thong QBiz Kho Remote (Khong hien cua so)
Set WshShell = CreateObject("WScript.Shell")
strAppDir = "D:\google driver\Codex PC\Quản lý kho - bán hàng trên Qbiz\app"
WshShell.CurrentDirectory = strAppDir

' Chay run-background-service.ps1 hoan toan an (WindowStyle Hidden)
strCommand = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & strAppDir & "\run-background-service.ps1"""
WshShell.Run strCommand, 0, False
