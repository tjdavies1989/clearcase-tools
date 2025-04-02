# PowerShell script to launch Chrome with web security disabled for development
# WARNING: Only use this for development! Not for general browsing!

$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$UserDataDir = "$env:TEMP\ChromeDevSession"

# Check if Chrome exists at the expected path
if (-not (Test-Path $ChromePath)) {
    $ChromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    if (-not (Test-Path $ChromePath)) {
        Write-Host "Chrome not found at expected locations. Please update the script with your Chrome path."
        exit 1
    }
}

# Create user data directory if it doesn't exist
if (-not (Test-Path $UserDataDir)) {
    New-Item -ItemType Directory -Path $UserDataDir | Out-Null
}

Write-Host "WARNING: You are launching Chrome with security disabled!" -ForegroundColor Red
Write-Host "This should ONLY be used for testing the audio compression tool locally." -ForegroundColor Red
Write-Host "DO NOT use this Chrome instance for general browsing!" -ForegroundColor Red
Write-Host ""
Write-Host "Press Enter to continue or Ctrl+C to cancel..." -ForegroundColor Yellow

$null = Read-Host

# Launch Chrome with security disabled
$LocalUrl = "http://localhost:3000"
if ($args.Count -gt 0) {
    $LocalUrl = $args[0]
}

Write-Host "Launching Chrome with security disabled, pointing to $LocalUrl" -ForegroundColor Green

Start-Process -FilePath $ChromePath -ArgumentList "--disable-web-security", 
                                                 "--disable-site-isolation-trials", 
                                                 "--user-data-dir=`"$UserDataDir`"",
                                                 "--disable-features=BlockInsecurePrivateNetworkRequests",
                                                 $LocalUrl 