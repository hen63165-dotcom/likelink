# ============================================================
# Likelink — build + deploy helper (Windows / PowerShell)
# ------------------------------------------------------------
# 1. Builds the production bundle (bundles src/luxury.css into
#    the compiled CSS asset so the 2026 luxury theme ships live).
# 2. Syncs the Capacitor Android wrapper (per README: npm run
#    build && npx cap sync). Use -SkipCapSync to skip.
# 3. Deploys dist/ to Netlify production. Use -SkipDeploy to
#    only build + sync.
#
# Usage:
#   .\deploy.ps1               # build + cap sync + netlify deploy
#   .\deploy.ps1 -SkipDeploy   # build + cap sync only
#   .\deploy.ps1 -SkipCapSync  # build + deploy only
# ============================================================
param(
  [switch]$SkipDeploy,
  [switch]$SkipCapSync
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "==> 1/3 Building production bundle (npm run build)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
Write-Host "    Build OK — dist/ is fresh." -ForegroundColor Green

if (-not $SkipCapSync) {
  Write-Host ""
  Write-Host "==> 2/3 Syncing Android wrapper (npx cap sync android)..." -ForegroundColor Cyan
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { Write-Host "    cap sync reported an error (non-fatal for web deploy)." -ForegroundColor Yellow }
  else { Write-Host "    Android wrapper synced." -ForegroundColor Green }
}

if ($SkipDeploy) {
  Write-Host ""
  Write-Host "Build complete. dist/ is ready for deployment (skipped)." -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "==> 3/3 Deploying dist/ to Netlify (production)..." -ForegroundColor Cyan
netlify deploy --prod --dir=dist
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Netlify CLI deploy failed (not installed / not logged in?)." -ForegroundColor Yellow
  Write-Host "If the site is git-connected, deploy with:" -ForegroundColor Yellow
  Write-Host "    git add -A" -ForegroundColor Yellow
  Write-Host "    git commit -m \"Apply luxury theme via entry import\"" -ForegroundColor Yellow
  Write-Host "    git push origin main" -ForegroundColor Yellow
  Write-Host "Or log in and retry:  netlify login  then  netlify deploy --prod --dir=dist" -ForegroundColor Yellow
}
Write-Host "Done." -ForegroundColor Green
