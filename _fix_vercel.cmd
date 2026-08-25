@echo off
cd /d C:\Users\User\Desktop\likelink2
git -c user.name="hen63165-dotcom" -c user.email="hen63165@gmail.com" add -A
git -c user.name="hen63165-dotcom" -c user.email="hen63165@gmail.com" commit -m "Fix: serve SPA assets on Vercel (add filesystem handle to routes)"
git push origin main
echo EXIT:%ERRORLEVEL%