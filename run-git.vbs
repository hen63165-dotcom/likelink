Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\User\Desktop\likelink2 && node git-do-everything.js > _node_run.log 2>&1", 0, True
WshShell.Run "cmd /c type C:\Users\User\Desktop\likelink2\_git_everything_out.txt > C:\Users\User\Desktop\likelink2\_final_result.txt 2>&1", 0, True
Set WshShell = Nothing