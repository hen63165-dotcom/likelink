Set-Location "C:\Users\User\Desktop\likelink2"

Write-Host "=== Step 1: Git Status ===" -ForegroundColor Cyan
git status

Write-Host ""
Write-Host "=== Step 2: Add all files ===" -ForegroundColor Cyan
git add -A

Write-Host ""
Write-Host "=== Step 3: Commit ===" -ForegroundColor Cyan
git commit -m "fix: resolve build errors - duplicate functions and missing imports"

Write-Host ""
Write-Host "=== Step 4: Run build to check for errors ===" -ForegroundColor Cyan
npm run build 2>&1

Write-Host ""
Write-Host "=== Step 5: Push to main ===" -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Read-Host "Press Enter to exit"
