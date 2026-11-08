# Installs H0x Video Studio on Windows and connects Claude Code.
#   irm https://raw.githubusercontent.com/buckleson/h0x-video-studio/main/install.ps1 | iex
# This script never asks for, reads or stores API keys.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo = 'buckleson/h0x-video-studio'
$AppName = 'H0x Video Studio'

function Say($msg) { Write-Host "`n==> $msg" }

Say 'Finding the latest release'
$release = Invoke-RestMethod -UseBasicParsing "https://api.github.com/repos/$Repo/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like '*_x64-setup.exe' } | Select-Object -First 1
if (-not $asset) { throw "No _x64-setup.exe file in the latest release." }

Say "Installing $AppName"
$setup = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name)"
Invoke-WebRequest -UseBasicParsing $asset.browser_download_url -OutFile $setup
Write-Host 'This build is not signed yet. If Windows SmartScreen appears, choose More info, then Run anyway.'
Start-Process -FilePath $setup -ArgumentList '/S' -Wait
Remove-Item $setup -Force
Write-Host "$AppName is installed."

Say "Checking Node.js (the plugin's local server needs Node 18 or newer)"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node -and [int]((& node -p 'process.versions.node.split(".")[0]')) -ge 18) {
  Write-Host "Found Node $(& node -v)."
} else {
  Write-Host 'Node 18+ not found. Install it from https://nodejs.org (or: winget install OpenJS.NodeJS.LTS).'
}

Say 'Connecting Claude Code'
if (Get-Command claude -ErrorAction SilentlyContinue) {
  & claude plugin marketplace add $Repo
  if ($LASTEXITCODE -ne 0) { & claude plugin marketplace update h0x-video-studio }
  & claude plugin install h0x@h0x-video-studio
  if ($LASTEXITCODE -ne 0) { throw 'Could not install the h0x plugin.' }
  Write-Host 'The h0x plugin is installed.'
} else {
  Write-Host 'Claude Code is not installed. Install it from https://claude.com/claude-code, then run:'
  Write-Host "  claude plugin marketplace add $Repo"
  Write-Host '  claude plugin install h0x@h0x-video-studio'
}

Say 'Done'
Write-Host "Open $AppName, then run 'claude' and type /h0x:start"
