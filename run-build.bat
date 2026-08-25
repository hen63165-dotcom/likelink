@echo off
cd /d C:\Users\User\Desktop\likelink2
"C:\Program Files\nodejs\node.exe" node_modules\vite\bin\vite.js build > build-output.txt 2>&1
echo BUILD_EXIT_CODE=%ERRORLEVEL% >> build-output.txt