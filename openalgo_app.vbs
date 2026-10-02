Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if OpenAlgo is already listening on port 5000
Set objExec = WshShell.Exec("netstat -aon")
isListening = False
Do While Not objExec.StdOut.AtEndOfStream
    line = objExec.StdOut.ReadLine()
    If InStr(line, ":5000") > 0 And InStr(line, "LISTENING") > 0 Then
        isListening = True
        Exit Do
    End If
Loop

If isListening Then
    ' Already running - simply bring up or open the browser app
    WshShell.Run "cmd /c start http://127.0.0.1:5000/trading", 0, False
Else
    ' Start server in background
    WshShell.CurrentDirectory = strPath
    WshShell.Run "cmd /c uv run app.py", 0, False
    
    ' Wait for server port 5000 to become active (up to 15 seconds)
    started = False
    For i = 1 To 30
        WScript.Sleep 500
        Set objCheck = WshShell.Exec("netstat -aon")
        Do While Not objCheck.StdOut.AtEndOfStream
            l = objCheck.StdOut.ReadLine()
            If InStr(l, ":5000") > 0 And InStr(l, "LISTENING") > 0 Then
                started = True
                Exit Do
            End If
        Loop
        If started Then Exit For
    Next
    
    ' Open OpenAlgo Trading terminal in default browser
    WshShell.Run "cmd /c start http://127.0.0.1:5000/trading", 0, False
End If
