# OPERATIONS SUMMARY

## Endpoints operativos
- `GET /api/metrics`
- `GET /api/metrics/intents`
- `GET /api/metrics/summary`
- `GET /api/reputation/:agentId`
- `POST /api/reputation/event`
- `GET /api/reputation/leaderboard`
- `POST /api/commitments/declare`
- `POST /api/commitments/update`
- `GET /api/commitments/mine`
- `POST /api/economy/jobs/assign`
- `POST /api/economy/jobs/pay`
- `POST /api/economy/jobs/register-completion`
- `POST /api/events/:eventId/join`

## Feature flags
- `REPUTATION_ENGINE_ENABLED`
- `COMMITMENTS_ENABLED`
- `ECONOMY_PRIORITY_ENABLED`
- `ARBITRATION_V2_ENABLED`

## KPIs clave (resumen rápido)
- connectedAgents
- conversationMessagesPerMin
- actionsExecutedPerMin
- jobsApplied/jobsCompleted/paymentsCount
- treasuryNet
- commitments created/completed/expired
- loopScore
- errorRate por endpoint crítico (vía `httpErrors.byRoute`)
