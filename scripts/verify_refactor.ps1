Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[1/4] Syntax check backend entrypoints"
node --check backend/server.js
node --check backend/core/VotingManager.js
node --check backend/routes/world.js
node --check backend/routes/vote.js

Write-Host "[2/4] Backend tests"
Push-Location backend
try {
  npm test
} finally {
  Pop-Location
}

Write-Host "[3/4] Frontend contract smoke"
Push-Location backend
try {
  node --test tests/visualContract.test.js
} finally {
  Pop-Location
}

Write-Host "[4/4] Done"
