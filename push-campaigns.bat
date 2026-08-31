@echo off
cd /d C:\Users\User\Desktop\likelink2
echo === Adding all files ===
git add -A
echo === Committing ===
git commit -m "feat: campaign templates + sharing to all platforms"
echo === Pushing to GitHub ===
git push origin main
echo === Done! ===
pause
