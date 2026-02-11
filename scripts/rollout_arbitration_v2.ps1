param(
  [string]$BaseUrl = "http://localhost:3001",
  [int]$CanaryMinutes = 3,
  [int]$HalfMinutes = 3,
  [int]$ValidationMinutes = 20
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$agentsRoot = Join-Path $root 'skill/agents'
$outDir = Join-Path $root 'docs/rollout'
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$runId = Get-Date -Format 'yyyyMMdd_HHmmss'
$outJson = Join-Path $outDir "rollout_${runId}.json"
$outMd = Join-Path $outDir "rollout_${runId}.md"

$agentDirs = Get-ChildItem $agentsRoot -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'config.json') } | Sort-Object Name
$agentIds = $agentDirs.Name
if ($agentIds.Count -lt 4) { throw "Se requieren al menos 4 agentes con config.json para canary/50/100" }
$canary = $agentIds | Select-Object -First 2
$halfCount = [Math]::Ceiling($agentIds.Count / 2)
$half = $agentIds | Select-Object -First $halfCount

function Set-ArbitrationFlag([string[]]$enabledIds) {
  foreach ($dir in $agentDirs) {
    $cfgPath = Join-Path $dir.FullName 'config.json'
    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
    if (-not $cfg.behavior) { $cfg | Add-Member -MemberType NoteProperty -Name behavior -Value (@{}) }
    if (-not $cfg.behavior.decisionLoop) { $cfg.behavior | Add-Member -MemberType NoteProperty -Name decisionLoop -Value (@{enabled=$true;intervalMs=20000;mode='llm'}) }
    $enabled = $enabledIds -contains $dir.Name
    $cfg.behavior | Add-Member -Force -MemberType NoteProperty -Name arbitrationV2 -Value @{ enabled = $enabled; queueTtlSec = 45 }
    ($cfg | ConvertTo-Json -Depth 10) | Set-Content $cfgPath -Encoding UTF8
  }
}

function Restart-AllAgents {
  $procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -like '*moltville_skill.py*' }
  foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  foreach ($dir in $agentDirs) {
    $stdout = Join-Path $dir.FullName 'agent_stdout.log'
    $stderr = Join-Path $dir.FullName 'agent_stderr.log'
    Start-Process -FilePath 'python' -ArgumentList '-B','-u','moltville_skill.py' -WorkingDirectory $dir.FullName -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  }
  Start-Sleep -Seconds 8
}

function Get-MetricsSnapshot {
  $metrics = Invoke-RestMethod -Uri "$BaseUrl/api/metrics" -Method Get -TimeoutSec 10
  $intents = Invoke-RestMethod -Uri "$BaseUrl/api/metrics/intents" -Method Get -TimeoutSec 10
  $summary = Invoke-RestMethod -Uri "$BaseUrl/api/metrics/summary" -Method Get -TimeoutSec 10
  $httpErrorsByRoute = $intents.httpErrors.byRoute
  $join404 = 0
  if ($httpErrorsByRoute) {
    foreach ($prop in $httpErrorsByRoute.PSObject.Properties) {
      if ($prop.Name -like '*/join*' -and [int]$prop.Value -gt 0) { $join404 += [int]$prop.Value }
    }
  }
  $uptimeMin = [Math]::Max(1, [Math]::Floor(($metrics.uptimeSec)/60))
  $errorTotal = [int]($intents.httpErrors.total)
  $errorRate = [Math]::Round($errorTotal / [Math]::Max(1, $metrics.http.total), 4)

  return [pscustomobject]@{
    timestamp = (Get-Date).ToString('o')
    connectedAgents = [int]$intents.connectedAgents
    conversationMessagesPerMin = [double]$summary.conversationMessagesPerMin
    actionsExecutedPerMin = [double]$summary.actionsExecutedPerMin
    actionsByType = ($intents.intents.actionTypes | ConvertTo-Json -Compress)
    jobsApplied = [int]$summary.jobsApplied
    jobsCompleted = [int]$summary.jobsCompleted
    paymentsCount = [int]$summary.paymentsCount
    treasuryNet = [double]$summary.treasuryNet
    commitmentsCreated = [int]$summary.commitments.created
    commitmentsCompleted = [int]$summary.commitments.completed
    commitmentsExpired = [int]$summary.commitments.expired
    join404 = [int]$join404
    errorRate = [double]$errorRate
    loopScore = [double]$summary.loopScore
    featureFlags = ($intents.featureFlags | ConvertTo-Json -Compress)
    uptimeMin = $uptimeMin
  }
}

function Run-Phase([string]$name, [string[]]$enabledIds, [int]$minutes, [int]$expectedMinAgents) {
  Set-ArbitrationFlag -enabledIds $enabledIds
  Restart-AllAgents
  Start-Sleep -Seconds 45
  $rows = @()
  for ($i=0; $i -lt $minutes; $i++) {
    $rows += Get-MetricsSnapshot
    Start-Sleep -Seconds 60
  }
  $steadyRows = if ($rows.Count -gt 1) { $rows | Select-Object -Skip 1 } else { $rows }
  $minAgents = ($steadyRows | Measure-Object -Property connectedAgents -Minimum).Minimum
  $avgAgents = [Math]::Round((($steadyRows | Measure-Object -Property connectedAgents -Average).Average), 2)
  $maxAgents = ($steadyRows | Measure-Object -Property connectedAgents -Maximum).Maximum
  $maxError = ($steadyRows | Measure-Object -Property errorRate -Maximum).Maximum
  $join404Delta = ($rows[-1].join404 - $rows[0].join404)
  $pass = ($avgAgents -ge ($expectedMinAgents - 0.5)) -and ($maxAgents -ge $expectedMinAgents) -and ($maxError -le 0.05) -and ($join404Delta -le 0)
  return [pscustomobject]@{
    phase = $name
    enabled = $enabledIds
    expectedMinAgents = $expectedMinAgents
    rows = $rows
    criteria = [pscustomobject]@{
      minConnectedAgents = $expectedMinAgents
      maxErrorRate = 0.05
      join404DeltaLTE = 0
    }
    observed = [pscustomobject]@{
      minConnectedAgents = $minAgents
      avgConnectedAgents = $avgAgents
      maxConnectedAgents = $maxAgents
      maxErrorRate = $maxError
      join404Delta = $join404Delta
    }
    passed = $pass
  }
}

$run = [ordered]@{
  startedAt = (Get-Date).ToString('o')
  agents = $agentIds
  canary = $canary
  half = $half
  baseline = Get-MetricsSnapshot
  phases = @()
}

$phase1 = Run-Phase -name 'canary_2' -enabledIds $canary -minutes $CanaryMinutes -expectedMinAgents ([Math]::Max(2,[Math]::Floor($agentIds.Count*0.7)))
$run.phases += $phase1
if (-not $phase1.passed) {
  Set-ArbitrationFlag -enabledIds @()
  Restart-AllAgents
  $run.rollback = 'canary_failed'
  $run.finishedAt = (Get-Date).ToString('o')
  ($run | ConvertTo-Json -Depth 10) | Set-Content $outJson -Encoding UTF8
  throw "Canary falló. Rollback aplicado."
}

$phase2 = Run-Phase -name 'rollout_50' -enabledIds $half -minutes $HalfMinutes -expectedMinAgents ([Math]::Max(3,[Math]::Floor($agentIds.Count*0.75)))
$run.phases += $phase2
if (-not $phase2.passed) {
  Set-ArbitrationFlag -enabledIds @()
  Restart-AllAgents
  $run.rollback = 'half_failed'
  $run.finishedAt = (Get-Date).ToString('o')
  ($run | ConvertTo-Json -Depth 10) | Set-Content $outJson -Encoding UTF8
  throw "50% falló. Rollback aplicado."
}

$phase3 = Run-Phase -name 'rollout_100' -enabledIds $agentIds -minutes 2 -expectedMinAgents ([Math]::Max(4,[Math]::Floor($agentIds.Count*0.8)))
$run.phases += $phase3
if (-not $phase3.passed) {
  Set-ArbitrationFlag -enabledIds @()
  Restart-AllAgents
  $run.rollback = 'full_failed'
  $run.finishedAt = (Get-Date).ToString('o')
  ($run | ConvertTo-Json -Depth 10) | Set-Content $outJson -Encoding UTF8
  throw "100% falló. Rollback aplicado."
}

$validationRows = @()
for ($i=0; $i -lt $ValidationMinutes; $i++) {
  $validationRows += Get-MetricsSnapshot
  Start-Sleep -Seconds 60
}
$run.validation = [pscustomobject]@{
  minutes = $ValidationMinutes
  rows = $validationRows
}
$run.after = Get-MetricsSnapshot
$run.finishedAt = (Get-Date).ToString('o')
($run | ConvertTo-Json -Depth 10) | Set-Content $outJson -Encoding UTF8

$before = $run.baseline
$after = $run.after
$md = @()
$md += "# Rollout Arbitration V2 - $runId"
$md += ""
$md += "## Antes vs Después"
$md += ""
$md += "| Métrica | Antes | Después |"
$md += "|---|---:|---:|"
$md += "| connectedAgents | $($before.connectedAgents) | $($after.connectedAgents) |"
$md += "| conversationMessages/min | $($before.conversationMessagesPerMin) | $($after.conversationMessagesPerMin) |"
$md += "| actionsExecuted/min | $($before.actionsExecutedPerMin) | $($after.actionsExecutedPerMin) |"
$md += "| jobsApplied | $($before.jobsApplied) | $($after.jobsApplied) |"
$md += "| jobsCompleted | $($before.jobsCompleted) | $($after.jobsCompleted) |"
$md += "| paymentsCount | $($before.paymentsCount) | $($after.paymentsCount) |"
$md += "| treasuryNet | $($before.treasuryNet) | $($after.treasuryNet) |"
$md += "| commitments created/completed/expired | $($before.commitmentsCreated)/$($before.commitmentsCompleted)/$($before.commitmentsExpired) | $($after.commitmentsCreated)/$($after.commitmentsCompleted)/$($after.commitmentsExpired) |"
$md += "| join404 | $($before.join404) | $($after.join404) |"
$md += "| errorRate | $($before.errorRate) | $($after.errorRate) |"
$md += "| loopScore | $($before.loopScore) | $($after.loopScore) |"
$md += ""
$md += "## Fases"
foreach ($ph in $run.phases) {
  $md += "- $($ph.phase): $([string]::new(@('F','A','I','L'),0,4) -replace 'FAIL','')$($ph.passed) | minAgents=$($ph.observed.minConnectedAgents), maxError=$($ph.observed.maxErrorRate), join404Delta=$($ph.observed.join404Delta)"
}
$md += ""
$md += "Evidencia minuto a minuto en: $outJson"
$md -join "`n" | Set-Content $outMd -Encoding UTF8

Write-Output "ROLLOUT_JSON=$outJson"
Write-Output "ROLLOUT_MD=$outMd"
