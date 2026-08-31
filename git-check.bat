@echo off
cd /d C:\Users\User\Desktop\likelink2
echo ===== GIT STATUS ===== > _git_out.txt 2>&1
git status >> _git_out.txt 2>&1
echo ===== GIT REMOTE ===== >> _git_out.txt 2>&1
git remote -v >> _git_out.txt 2>&1
echo ===== GIT BRANCH ===== >> _git_out.txt 2>&1
git branch -a >> _git_out.txt 2>&1
echo ===== GIT LOG ===== >> _git_out.txt 2>&1
git log --oneline -5 >> _git_out.txt 2>&1
echo ===== UNTRACKED ===== >> _git_out.txt 2>&1
git ls-files --others --exclude-standard >> _git_out.txt 2>&1
echo ===== DONE ===== >> _git_out.txt 2>&1