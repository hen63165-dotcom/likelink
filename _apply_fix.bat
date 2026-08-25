@echo off
cd /d C:\Users\User\Desktop\likelink2
git add -A
git status --porcelain
echo ---COMMIT---
git commit -m "Fix: use relative module path in index.html so Vite build resolves script on Vercel" 2>&1
echo ---HEAD---
git rev-parse HEAD
echo ---PUSH---
git push 2>&1
echo ---END---
