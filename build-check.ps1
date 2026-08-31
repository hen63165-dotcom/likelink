Set-Location "C:\Users\User\Desktop\likelink2"
Write-Host "=== Running npm run build ===" -ForegroundColor Cyan
npm run build 2>&1
Write-Host ""
Write-Host "=== Build completed ===" -ForegroundColor Green
Read-Host "Press Enter to exit"
