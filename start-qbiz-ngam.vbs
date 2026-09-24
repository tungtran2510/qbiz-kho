Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir

WshShell.Run "cmd.exe /c """ & strDir & "\start-qbiz-remote.bat""", 0, False

MsgBox "QBiz Kho dang chay ngam!" & vbCrLf & vbCrLf & "Link xem tren dien thoai:" & vbCrLf & "https://frontpage-functional-ext-dim.trycloudflare.com" & vbCrLf & vbCrLf & "(Chi tiet xem tai file remote-links.txt)", vbInformation, "QBiz Kho Remote"
