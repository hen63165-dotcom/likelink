Set objShell = CreateObject("WScript.Shell")
Set objFS = CreateObject("Scripting.FileSystemObject")

outputFile = "C:\Users\User\Desktop\likelink2\build-output.txt"
projectDir = "C:\Users\User\Desktop\likelink2"
nodePath = "C:\Program Files\nodejs\node.exe"

' Write initial marker
Set objFile = objFS.CreateTextFile(outputFile, True)
objFile.WriteLine "STARTED"
objFile.Close

' Run the build
Set objExec = objShell.Exec("""" & nodePath & """ node_modules\vite\bin\vite.js build""", 0, projectDir)

' Wait for it to complete
Do While objExec.Status = 0
    WScript.Sleep 1000
Loop

stdout = objExec.StdOut.ReadAll()
stderr = objExec.StdErr.ReadAll()
exitCode = objExec.ExitCode

' Write result
Set objFile = objFS.CreateTextFile(outputFile, True)
objFile.WriteLine "EXIT_CODE: " & exitCode
objFile.WriteLine "STDOUT: " & stdout
objFile.WriteLine "STDERR: " & stderr
objFile.Close