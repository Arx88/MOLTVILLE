$ErrorActionPreference = 'SilentlyContinue'

# Singleton guard: prevent multiple supervisor instances fighting each other.
$global:MoltvilleSupervisorMutex = New-Object System.Threading.Mutex($false, 'Global\MOLTVILLE_OBSERVABILITY_SUPERVISOR')
if (-not $global:MoltvilleSupervisorMutex.WaitOne(0, $false)) {
  Write-Output 'observability_supervisor already running; exiting duplicate instance.'
  exit 0
}

$root = 'C:\Users\juanp\Documents\Moltville\MOLTVILLE'
$backendDir = Join-Path $root 'backend'
$agentsRoot = Join-Path $root 'skill\agents'
$logRoot = Join-Path $root 'logs\runtime'
$agentNames = @('bot1','bot2','bot3','bot4','bot5','rebelprobe')
$expectedAgents = $agentNames.Count
$backendHealthUrl = 'http://127.0.0.1:3001/api/health'

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $logRoot 'agents') | Out-Null

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
    $h = Invoke-RestMethod $backendHealthUrl -TimeoutSec 2
    return $h.status -eq 'healthy'
  } catch { return $false }
}

function Start-Backend {
  Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'MOLTVILLE\\backend\\server.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Milliseconds 500
  Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $backendDir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logRoot 'backend.out.log') `
    -RedirectStandardError (Join-Path $logRoot 'backend.err.log')
}

function Start-Agents {
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'python.exe' -and $_.CommandLine -match 'moltville_skill.py' -and $_.CommandLine -match 'MOLTVILLE'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

  Start-Sleep -Milliseconds 500
  foreach ($name in $agentNames) {
    $dir = Join-Path $agentsRoot $name
    if (Test-Path $dir) {
      Start-Process -FilePath 'python' -ArgumentList '-B','-u','moltville_skill.py' -WorkingDirectory $dir -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logRoot "agents\$name.out.log") `
        -RedirectStandardError (Join-Path $logRoot "agents\$name.err.log")
    }
  }
}

function Get-AgentProcCount {
  return (Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'python.exe' -and $_.CommandLine -match 'moltville_skill.py' -and $_.CommandLine -match 'MOLTVILLE'
  } | Measure-Object).Count
}

# Metrics JSONL logger (whole-system snapshots)
$metricsLog = Join-Path $logRoot 'metrics.jsonl'
if (!(Test-Path $metricsLog)) { New-Item -ItemType File -Path $metricsLog | Out-Null }

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

  try {
    $metrics = Invoke-RestMethod 'http://127.0.0.1:3001/api/metrics'
    $intents = Invoke-RestMethod 'http://127.0.0.1:3001/api/metrics/intents'
    $convs = Invoke-RestMethod 'http://127.0.0.1:3001/api/world/conversations'

    $row = [ordered]@{
      ts = (Get-Date).ToString('o')
      connectedAgents = $metrics.socket.connectedAgents
      connectedViewers = $metrics.socket.connectedViewers
      ticks = $metrics.world.ticks
      perceive = $metrics.socket.events.'agent:perceive'
      moveTo = $metrics.socket.events.'agent:moveTo'
      speak = $metrics.socket.events.'agent:speak'
      conversationStarts = $intents.intents.conversationStarts
      conversationMessages = $intents.intents.conversationMessages
      actionsEnqueued = $intents.intents.actionsEnqueued
      activeConversations = @($convs).Count
      errorHttpTotal = $metrics.errors.http.total
      errorSocketTotal = $metrics.errors.socket.total
    }

    ($row | ConvertTo-Json -Compress) | Add-Content -Path $metricsLog
  } catch {
    $errRow = [ordered]@{
      ts = (Get-Date).ToString('o')
      error = $_.Exception.Message
    }
    ($errRow | ConvertTo-Json -Compress) | Add-Content -Path $metricsLog
  }

  Start-Sleep -Seconds 5
}
