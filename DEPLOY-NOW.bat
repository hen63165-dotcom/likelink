@echo off
title Likelink Deploy
cd /d "%~dp0"

echo ==================================================
echo    Likelink - Deploy to production
echo ==================================================
echo.

echo [1/6] Installing packages (npm install)...
call npm install
if errorlevel 1 goto error

echo.
echo [2/6] Building project (npm run build)...
call npm run build
if errorlevel 1 goto builderror
echo     Build OK!

echo.
echo [3/6] Staging all changes...
git add -A

echo.
echo [4/6] Committing...
git commit -m "Upgrade stack: AutoPilot + Price Watch + Web Push + Dynamic Sitemap + PWA offline" --allow-empty -q
echo     Committed.

echo.
echo [5/6] Syncing with GitHub...
git pull --rebase origin main
if errorlevel 1 goto error

echo.
echo [6/6] Pushing to GitHub (Vercel will deploy automatically)...
git push origin main
if errorlevel 1 goto error

echo.
echo ==================================================
echo   SUCCESS! Build passed and everything was pushed.
echo   Your new site will be live in 1-2 minutes at:
echo   https://likelink.vercel.app
echo.
echo   You can close this window now.
echo ==================================================
pause
exit /b 0

:builderror
echo.
echo ==================================================
echo   BUILD FAILED - push was cancelled.
echo   Nothing is broken online.
echo   Screenshot the error above and send it to me!
echo ==================================================
pause
exit /b 1

:error
echo.
echo ==================================================
echo   SOMETHING FAILED - screenshot this window
echo   and send it to me!
echo ==================================================
pause
exit /b 1


