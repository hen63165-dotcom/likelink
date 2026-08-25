@echo off
cd /d C:\Users\User\Desktop\likelink2
echo Running vite build...
npx vite build > build_output.txt 2>&1
echo EXIT_CODE:%ERRORLEVEL% >> build_output.txt
echo Build complete. Check build_output.txt for details.
