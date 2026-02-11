param(
  [int]$Minutes = 30,
  [string]$BaseUrl = "http://localhost:3001"
)
$ErrorActionPreference = 'Stop'
$outDir = "docs"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$date = Get-Date -Format 'yyyy-MM-dd'
$jsonPath = Join-Path $outDir "baseline_$date.json"
$rows = @()
for ($i=0; $i -lt $Minutes; $i++) {
  $ts = Get-Date
  try {
    $metrics = Invoke-RestMethod -Uri "$BaseUrl/api/metrics" -Method Get -TimeoutSec 10
    $intents = Invoke-RestMethod -Uri "$BaseUrl/api/metrics/intents" -Method Get -TimeoutSec 10
    $rows += [pscustomobject]@{
      timestamp = $ts.ToString('o')
      connectedAgents = $intents.connectedAgents
      worldTicks = $metrics.world.ticks
      actionsByType = ($intents.intents.actionTypes | ConvertTo-Json -Compress)
      conversationStarts = $intents.intents.conversationStarts
      conversationMessages = $intents.intents.conversationMessages
      conversationEnds = $intents.intents.conversationEnds
      jobsApplied = $metrics.economy.jobsApplied
      jobsCompleted = $metrics.economy.jobsCompleted
      paymentsCount = $metrics.economy.paymentsCount
      treasury = $metrics.economy.treasury.balance
      treasuryNet = $metrics.economy.treasuryNet
      error4xx5xxByRoute = ($intents.httpErrors.byRoute | ConvertTo-Json -Compress)
      intentsPayload = ($intents.intents | ConvertTo-Json -Compress)
    }
  } catch {
    $rows += [pscustomobject]@{
      timestamp = $ts.ToString('o')
      error = $_.Exception.Message
    }
  }
  Start-Sleep -Seconds 60
}
$rows | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding UTF8
Write-Output "Saved $jsonPath"
