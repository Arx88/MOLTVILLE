$ErrorActionPreference = 'SilentlyContinue'

$root = 'C:\Users\juanp\Documents\Moltville\MOLTVILLE'
$backendDir = Join-Path $root 'backend'
$agentsRoot = Join-Path $root 'skill\agents'
$agentNames = @('bot1','bot2','bot3','bot4','bot5','rebelprobe')
$expectedAgents = $agentNames.Count
$backendUrl = 'http://127.0.0.1:3001/api/health'

function Strip-BomIfNeeded([string]$path) {
  if (!(Test-Path $path)) { return }
  $bytes = [System.IO.File]::ReadAllBytes($path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
    [System.IO.File]::WriteAllBytes($path, $bytes[3..($bytes.Length-1)])
  }
}

function Normalize-Configs {
  Strip-BomIfNeeded (Join-Path $root 'skill\config.json')
  Get-ChildItem $agentsRoot -Directory | ForEach-Object {
    Strip-BomIfNeeded (Join-Path $_.FullName 'config.json')
  }
}

function Is-BackendUp {
  try {
    $h = Invoke-RestMethod $backendUrl -TimeoutSec 2
    return $h.status -eq 'healthy'
  } catch { return $false }
}

function Get-AgentProcCount {
  return (Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'python.exe' -and $_.CommandLine -match 'moltville_skill.py' -and $_.CommandLine -match 'MOLTVILLE'
  } | Measure-Object).Count
}

function Start-Backend {
  Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'MOLTVILLE\\backend\\server.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Milliseconds 500
  Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $backendDir -WindowStyle Hidden
}

function Start-Agents {
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'python.exe' -and $_.CommandLine -match 'moltville_skill.py' -and $_.CommandLine -match 'MOLTVILLE'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Milliseconds 500

  foreach ($name in $agentNames) {
    $dir = Join-Path $agentsRoot $name
    if (Test-Path $dir) {
      Start-Process -FilePath 'python' -ArgumentList '-B','-u','moltville_skill.py' -WorkingDirectory $dir -WindowStyle Hidden
    }
  }
}

Normalize-Configs
if (!(Is-BackendUp)) { Start-Backend; Start-Sleep -Seconds 2 }
Start-Agents

while ($true) {
  Normalize-Configs

  if (!(Is-BackendUp)) {
    Start-Backend
    Start-Sleep -Seconds 2
    Start-Agents
    Start-Sleep -Seconds 2
  }

  $agentCount = Get-AgentProcCount
  if ($agentCount -lt $expectedAgents) {
    Start-Agents
    Start-Sleep -Seconds 2
  }

  Start-Sleep -Seconds 10
}
