@echo off
chcp 65001 >nul
title Likelink - Fix and Deploy
cd /d "%~dp0"

echo ============================================
echo   Likelink - committing fixes and deploying
echo ============================================
echo.

git add -A
git commit -m "fix: i18n structure - move cart/analytics/reels/search/legal into he block, fix t() fallback support"
git push origin main

echo.
echo Building production bundle...
call npm run build
if errorlevel 1 (
  echo BUILD FAILED - check errors above
  pause
  exit /b 1
)

echo.
echo Deploying to Vercel production...
call vercel --prod --yes

echo.
echo DONE! Site: https://likelink.vercel.app
pause
