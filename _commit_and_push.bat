@echo off
REM This script stages the index.html fix, commits, and pushes to origin/main
REM Double-click this file to run, or run from a terminal: _commit_and_push.bat

cd /d "%~dp0"

echo === Git Auto Commit and Push ===
echo.

echo [1/5] Staging index.html...
git add index.html
if errorlevel 1 (
    echo ERROR: git add failed. Is git installed?
    pause
    exit /b 1
)

echo [2/5] Checking git status...
git status --porcelain

echo [3/5] Committing changes...
git commit -m "Fix: use relative module path in index.html for Vite build on Vercel"
if errorlevel 1 (
    echo ERROR: git commit failed.
    pause
    exit /b 1
)

echo [4/5] Pushing to origin main...
git push origin main
if errorlevel 1 (
    echo WARNING: git push failed. Check authentication.
    echo Try: git push origin main
    pause
    exit /b 1
)

echo [5/5] Done!
echo.
echo New commit details:
git log --oneline -1
echo.
echo The fix has been committed and pushed.
echo Vercel should automatically rebuild from the new commit.
pause
