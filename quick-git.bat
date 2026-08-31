@echo off
cd /d C:\Users\User\Desktop\likelink2
echo START > _schtasks_out.txt 2>&1
git status >> _schtasks_out.txt 2>&1
git add -A >> _schtasks_out.txt 2>&1
git commit -m "fix: resolve studio login crash, handleForgot, autoPublish integration" >> _schtasks_out.txt 2>&1
git push origin main >> _schtasks_out.txt 2>&1
echo DONE >> _schtasks_out.txt 2>&1