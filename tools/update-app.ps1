param(
  [switch]$WhatIf,
  [string]$Repo = "Biblicaaal/AppCajaPana",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Copy-DirectoryContents {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [string[]]$Exclude = @()
  )

  Get-ChildItem -LiteralPath $Source -Force | Where-Object {
    $Exclude -notcontains $_.Name
  } | ForEach-Object {
    $target = Join-Path $Destination $_.Name
    Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
  }
}

function Remove-UpdateableContents {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string[]]$Preserve = @()
  )

  Get-ChildItem -LiteralPath $Path -Force | Where-Object {
    $Preserve -notcontains $_.Name
  } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
  }
}

$ToolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Split-Path -Parent $ToolsDir
$BackupRoot = Join-Path $AppDir "_backups"
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupDir = Join-Path $BackupRoot "AppCajaPana_$Stamp"
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("AppCajaPana_Update_" + [guid]::NewGuid().ToString("N"))
$ZipPath = Join-Path $TempRoot "repo.zip"
$ZipUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"

Write-Host "AppCajaPana employee updater" -ForegroundColor Green
Write-Host "App folder: $AppDir"
Write-Host "Repo:       $Repo"
Write-Host "Branch:     $Branch"
Write-Host "Backup:     $BackupDir"

if ($WhatIf) {
  Write-Host ""
  Write-Host "Dry run only. No files were downloaded or changed." -ForegroundColor Yellow
  exit 0
}

try {
  Write-Step "Preparing folders"
  New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null

  Write-Step "Backing up current app"
  Copy-DirectoryContents -Source $AppDir -Destination $BackupDir -Exclude @(".git", "_backups")

  Write-Step "Downloading latest files"
  Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing

  Write-Step "Extracting update"
  Expand-Archive -Path $ZipPath -DestinationPath $TempRoot -Force
  $ExtractedRoot = Get-ChildItem -LiteralPath $TempRoot -Directory | Where-Object {
    $_.Name -like "AppCajaPana-*"
  } | Select-Object -First 1

  if (-not $ExtractedRoot) {
    throw "Could not find extracted GitHub folder."
  }

  $SourceDir = $ExtractedRoot.FullName
  $NestedAppDir = Join-Path $SourceDir "AppCajaPana"
  if ((Test-Path -LiteralPath $NestedAppDir) -and (Test-Path -LiteralPath (Join-Path $NestedAppDir "index.html"))) {
    $SourceDir = $NestedAppDir
  } elseif (-not (Test-Path -LiteralPath (Join-Path $SourceDir "index.html"))) {
    throw "The downloaded update does not look like AppCajaPana. Missing index.html."
  }

  Write-Step "Removing old app files"
  Remove-UpdateableContents -Path $AppDir -Preserve @(".git", "_backups", "Update-AppCajaPana.bat", "tools")

  Write-Step "Installing update"
  Copy-DirectoryContents -Source $SourceDir -Destination $AppDir -Exclude @(".git", "_backups")

  Write-Step "Cleaning temporary files"
  Remove-Item -LiteralPath $TempRoot -Recurse -Force

  Write-Host ""
  Write-Host "Update installed successfully." -ForegroundColor Green
  Write-Host "Backup saved at: $BackupDir"
  Write-Host "If the app was open, reload the browser window."
} catch {
  Write-Host ""
  Write-Host "Update failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Backup, if created, is at: $BackupDir"
  Write-Host "Temporary files are at: $TempRoot"
  exit 1
}
