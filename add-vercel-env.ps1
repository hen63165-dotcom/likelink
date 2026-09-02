# Adds the required client env vars to the linked Vercel project ("likelink2").
# Values are read automatically from the local .env file - nothing to paste.
#
# Run from the project root:
#   powershell -ExecutionPolicy Bypass -File .\add-vercel-env.ps1
#
# After it finishes, redeploy so the new variables are baked into the bundle:
#   vercel --prod
# (or just git push - Vercel deploys automatically)

$ErrorActionPreference = "Continue"

# 1. Read values from .env
$vars = @{}
Get-Content -Path (Join-Path $PSScriptRoot ".env") | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$') {
        $vars[$Matches[1]] = $Matches[2]
    }
}

$wanted  = @('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_ADMIN_CODE')
$targets = @('production', 'preview')

# 2. Push each variable to Vercel
$failed = 0
foreach ($name in $wanted) {
    $value = $vars[$name]
    if (-not $value) {
        Write-Host "SKIP $name - not found in .env" -ForegroundColor Yellow
        $failed++
        continue
    }
    foreach ($envName in $targets) {
        Write-Host "Adding $name -> $envName ... " -NoNewline
        $value | vercel env add $name $envName --force 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK" -ForegroundColor Green
        } else {
            Write-Host "FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
            $failed++
        }
    }
}

# 3. Show what's now configured
Write-Host ""
Write-Host "=== Current production env vars ===" -ForegroundColor Cyan
vercel env ls production 2>&1 | Write-Host

if ($failed -gt 0) {
    Write-Host "$failed step(s) failed - see messages above." -ForegroundColor Red
} else {
    Write-Host "All variables added. Now redeploy:  vercel --prod" -ForegroundColor Green
}
