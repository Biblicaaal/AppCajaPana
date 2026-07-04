param(
  [switch]$WhatIf,
  [switch]$Auto,
  [switch]$Quiet,
  [string]$Repo = "Biblicaaal/AppCajaPana",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  if ($Quiet) { return }
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info {
  param([string]$Message, [string]$Color = "White")
  if ($Quiet) { return }
  Write-Host $Message -ForegroundColor $Color
}

function Get-LocalVersion {
  param([string]$AppDir)
  $manifestPath = Join-Path $AppDir "update.json"
  if (Test-Path -LiteralPath $manifestPath) {
    try {
      $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
      if ($manifest.version) { return [string]$manifest.version }
    } catch {}
  }
  $appJs = Join-Path $AppDir "app.js"
  if (Test-Path -LiteralPath $appJs) {
    $match = Select-String -Path $appJs -Pattern 'APP_VERSION\s*=\s*"([^"]+)"' | Select-Object -First 1
    if ($match -and $match.Matches.Count) { return [string]$match.Matches[0].Groups[1].Value }
  }
  return "0.0.0.0"
}

function Compare-AppVersion {
  param([string]$A, [string]$B)
  try {
    $va = [version]$A
    $vb = [version]$B
    return $va.CompareTo($vb)
  } catch {
    return [string]::Compare($A, $B, $true)
  }
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
$ManifestUrl = "https://raw.githubusercontent.com/$Repo/$Branch/update.json"
$LogPath = Join-Path $AppDir "_update_last.log"

if ($Quiet) {
  Start-Transcript -Path $LogPath -Force | Out-Null
}

Write-Info "AppCajaPana employee updater" "Green"
Write-Info "App folder: $AppDir"
Write-Info "Repo:       $Repo"
Write-Info "Branch:     $Branch"
Write-Info "Backup:     $BackupDir"

if ($WhatIf) {
  Write-Info ""
  Write-Info "Dry run only. No files were downloaded or changed." "Yellow"
  if ($Quiet) { Stop-Transcript | Out-Null }
  exit 0
}

try {
  if ($Auto) {
    Write-Step "Checking remote version"
    $localVersion = Get-LocalVersion -AppDir $AppDir
    $remoteManifest = Invoke-WebRequest -Uri ($ManifestUrl + "?t=" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json
    $remoteVersion = [string]$remoteManifest.version
    if (-not $remoteVersion) {
      throw "Remote update.json has no version."
    }
    if ((Compare-AppVersion -A $remoteVersion -B $localVersion) -le 0) {
      Write-Info "Already up to date. Local: $localVersion Remote: $remoteVersion" "Green"
      if ($Quiet) { Stop-Transcript | Out-Null }
      exit 0
    }
    if ($remoteManifest.downloadUrl) {
      $ZipUrl = [string]$remoteManifest.downloadUrl
    }
    Write-Info "Update available. Local: $localVersion Remote: $remoteVersion" "Yellow"
  }

  Write-Step "Preparing folders"
  New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null

  Write-Step "Backing up current app"
  Copy-DirectoryContents -Source $AppDir -Destination $BackupDir -Exclude @(".git", "_backups", "_perfil_caja", "Browser")

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
  Remove-UpdateableContents -Path $AppDir -Preserve @(".git", "_backups", "_perfil_caja", "Browser", "Update-AppCajaPana.bat", "Abrir-AppCajaPana.bat", "AppCajaPana.vbs", "Crear-Acceso-Directo.bat", "tools")

  Write-Step "Installing update"
  Copy-DirectoryContents -Source $SourceDir -Destination $AppDir -Exclude @(".git", "_backups")

  Write-Step "Cleaning temporary files"
  Remove-Item -LiteralPath $TempRoot -Recurse -Force

  Write-Info ""
  Write-Info "Update installed successfully." "Green"
  Write-Info "Backup saved at: $BackupDir"
  Write-Info "If the app was open, reload the browser window."
  if ($Quiet) { Stop-Transcript | Out-Null }
} catch {
  Write-Info ""
  Write-Info "Update failed: $($_.Exception.Message)" "Red"
  Write-Info "Backup, if created, is at: $BackupDir"
  Write-Info "Temporary files are at: $TempRoot"
  if ($Quiet) { Stop-Transcript | Out-Null }
  exit 1
}
