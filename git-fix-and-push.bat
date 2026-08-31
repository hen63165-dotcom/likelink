@echo off
setlocal enabledelayedexpansion
set GIT_TERMINAL_PROMPT=0
set GIT_PAGER=cat
set GIT_CONFIG_NOSYSTEM=1
set HOME=C:\Users\User

cd /d C:\Users\User\Desktop\likelink2

echo === GIT STATUS === 
git status --porcelain 2>&1

echo === GIT ADD ===
git add -A 2>&1

echo === GIT COMMIT ===
git commit -m "fix: studio login crash for existing users, handleForgot, autoPublish" 2>&1

echo === GIT PUSH ===
git push origin main 2>&1

echo === DONE ===