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
echo === Step 3: Adding files ===
git add -A
echo.
echo === Step 4: Committing ===
git commit -m "fix: remove duplicate AuthGate declaration in SellView"
echo.
echo === Step 5: Pushing to main ===
git push origin main
echo.
echo ============================================
echo   Done! Vercel will redeploy automatically.
echo ============================================
pause
