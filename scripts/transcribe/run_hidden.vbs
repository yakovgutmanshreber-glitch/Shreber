' Launches run.cmd with no visible window (for the scheduled task).
Set fso = CreateObject("Scripting.FileSystemObject")
p = fso.GetParentFolderName(WScript.ScriptFullName) & "\run.cmd"
CreateObject("WScript.Shell").Run "cmd /c """ & p & """", 0, False
