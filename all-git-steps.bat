@echo off
cd /d C:\Users\User\Desktop\likelink2
echo ===== GIT STATUS ===== > _all_git_out.txt 2>&1
git status >> _all_git_out.txt 2>&1
echo ===== CHANGED FILES ===== >> _all_git_out.txt 2>&1
git diff --name-only >> _all_git_out.txt 2>&1
git diff --cached --name-only >> _all_git_out.txt 2>&1
git ls-files --others --exclude-standard >> _all_git_out.txt 2>&1
echo ===== GIT ADD ===== >> _all_git_out.txt 2>&1
git add -A >> _all_git_out.txt 2>&1
echo ===== GIT STATUS AFTER ADD ===== >> _all_git_out.txt 2>&1
git status --porcelain >> _all_git_out.txt 2>&1
echo ===== GIT COMMIT ===== >> _all_git_out.txt 2>&1
git commit -m "fix: resolve studio login crash on pre-auth access, handleForgot, autoPublish integration" >> _all_git_out.txt 2>&1
echo ===== GIT LOG ===== >> _all_git_out.txt 2>&1
git log --oneline -3 >> _all_git_out.txt 2>&1
echo ===== GIT PUSH ===== >> _all_git_out.txt 2>&1
git push origin main >> _all_git_out.txt 2>&1
echo ===== ALL DONE ===== >> _all_git_out.txt 2>&1