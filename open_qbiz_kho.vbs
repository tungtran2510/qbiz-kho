Set WshShell = CreateObject("WScript.Shell")
Dim fso, scriptDir, batPath
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

batPath = scriptDir & "\Chay_QBiz_Kho.bat"
If Not fso.FileExists(batPath) Then
    batPath = scriptDir & "\..\Chay_QBiz_Kho.bat"
End If

WshShell.Run "cmd /c """ & batPath & """", 0, False
Set WshShell = Nothing
Set fso = Nothing
