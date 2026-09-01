@echo off
chcp 65001 >nul
cd /d C:\Users\User\Desktop\likelink2
echo ============================================
echo   Likelink2 - Build check and then push
echo ============================================
echo.
echo === Step 1: Running build to verify fixes ===
call npm run build
if errorlevel 1 (
    echo.
    echo *** BUILD FAILED - not pushing! ***
    echo Fix the errors above first.
    pause
    exit /b 1
)
echo.
echo === Build passed! ===
echo.
echo === Step 2: Git status ===
git status
echo.
echo === Step 3: Cleaning temp files ===
del /q build-log.txt build-log2.txt verify-out.txt filelist.txt ap-mid.txt syntax-check.txt push-result.txt status-out.txt 2>nul
echo.
echo === Step 4: Adding files ===
git add -A
echo.
echo === Step 5: Committing ===
git commit -m "feat: AutoPilot smart marketing engine - rotating angles, hashtags, UTM tracking, smart scheduling + browser tick for Hobby plan"
echo.
echo === Step 6: Pushing to main ===
git push origin main
echo.
echo ============================================
echo   Done! Vercel will redeploy automatically.
echo ============================================
pause
