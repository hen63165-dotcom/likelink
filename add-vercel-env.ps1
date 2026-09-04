# Adds the required environment variables to the linked Vercel project.
# Values are read automatically from the local .env file - nothing to paste.
#
# SECURITY: ADMIN_CODE + ADMIN_SESSION_SECRET are SERVER-ONLY (used by
# /api/admin/auth). They must NOT be VITE_-prefixed. If an old VITE_ADMIN_CODE
# still exists in .env or in Vercel, remove it.
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

# Client (public by design) + server-only admin secrets.
$wanted  = @('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'ADMIN_CODE', 'ADMIN_SESSION_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'STORE_SIGN_SECRET')
$targets = @('production', 'preview')

# SECURITY CHECK: never push a VITE_-prefixed admin code (it is public).
if ($vars['VITE_ADMIN_CODE']) {
    Write-Host "`nSECURITY WARNING: VITE_ADMIN_CODE exists in .env. It is PUBLIC (baked into JS) and will NOT be added." -ForegroundColor Red
    Write-Host "Remove it from .env and from Vercel, and use ADMIN_CODE instead: it is checked server-side by /api/admin/auth." -ForegroundColor Yellow
}
if (-not $vars['ADMIN_CODE']) {
    Write-Host "`nNOTE: ADMIN_CODE is not defined in .env. The admin panel will stay locked (server returns 503) until it is set in Vercel." -ForegroundColor Yellow
}

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
