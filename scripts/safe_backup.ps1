param(
  [Parameter(Mandatory = $true)]
  [string[]]$Files,
  [string]$Label = "manual",
  [string]$Root = "."
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-VersionedName {
  param(
    [string]$Directory,
    [string]$BaseName
  )

  $existing = Get-ChildItem -Path $Directory -File -Filter "$BaseName.bak.v*" -ErrorAction SilentlyContinue
  if (-not $existing) {
    return "$BaseName.bak.v1"
  }

  $max = 0
  foreach ($item in $existing) {
    if ($item.Name -match "\.bak\.v(\d+)$") {
      $num = [int]$Matches[1]
      if ($num -gt $max) { $max = $num }
    }
  }
  return "$BaseName.bak.v$($max + 1)"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $Root ("backend\backup_versions\" + $Label + "_" + $timestamp)
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$manifest = @()
foreach ($file in $Files) {
  if (-not (Test-Path $file)) {
    throw "File not found: $file"
  }

  $fileName = [IO.Path]::GetFileName($file)
  $versionedName = Resolve-VersionedName -Directory $backupDir -BaseName $fileName
  $target = Join-Path $backupDir $versionedName
  Copy-Item -Path $file -Destination $target -Force

  $info = Get-Item $target
  $manifest += [pscustomobject]@{
    source = (Resolve-Path $file).Path
    backup = (Resolve-Path $target).Path
    bytes = $info.Length
    copiedAt = (Get-Date).ToString("o")
  }
}

$manifestPath = Join-Path $backupDir "manifest.json"
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Output "Backup directory: $backupDir"
Get-ChildItem $backupDir -File | Select-Object Name, Length
