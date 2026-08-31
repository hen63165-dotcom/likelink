# PowerShell script to run git-auto.cjs
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\User\Desktop\likelink2"

# Run the node script
$process = Start-Process -FilePath "node" -ArgumentList "C:\Users\User\Desktop\likelink2\git-auto.cjs" -WorkingDirectory "C:\Users\User\Desktop\likelink2" -NoNewWindow -Wait -PassThru -RedirectStandardOutput "_stdout.txt" -RedirectStandardError "_stderr.txt"

Write-Host "Exit code: $($process.ExitCode)"
if (Test-Path "_stdout.txt") {
    Write-Host "STDOUT:"
    Get-Content "_stdout.txt"
}
if (Test-Path "_stderr.txt") {
    Write-Host "STDERR:"
    Get-Content "_stderr.txt"
}
