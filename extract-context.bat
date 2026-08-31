@echo off
set GIT_TERMINAL_PROMPT=0
cd /d C:\Users\User\Desktop\likelink2

echo ===== GIT STATUS ===== 
git status --porcelain 2>&1

echo ===== GIT BRANCH =====
git branch 2>&1

echo ===== GIT LOG =====
git log --oneline -5 2>&1

echo ===== DONE =====