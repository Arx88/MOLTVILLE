# TODO - Ejecución del PLAN_REFACTORIZACION_ARQUITECTURAL

> Fuente: `C:\Users\juanp\Downloads\PLAN_REFACTORIZACION_ARQUITECTURAL.md`
> Objetivo: llevar trazabilidad de todo lo tomado del plan y marcar lo completado.

## Estado General

- Inicio: 2026-02-13
- Modo: ejecución incremental en producción local (sin big-bang)

---

## 0) Estabilización previa (runtime)

- [x] Corregido serving de frontend desde backend root (`/`) para eliminar `Cannot GET /`.
- [x] Corregido problema de encoding visible en UI (texto roto/mojibake) restaurando versión frontend estable.
- [x] Reinicio full backend + skills con verificación post-fix.
- [x] Hotfix social en skills para destrabar loop:
  - [x] Fallback de inicio de conversación cuando LLM falla/timeout.
  - [x] Cooldown de iniciación social reducido.
  - [x] Fallback de respuesta dentro de conversación activa.
- [x] Commit y push de hotfixes aplicados.

### Evidencia rápida (runtime)
- `conversationMessagesPerMin` pasó de `0` a `0.333` tras hotfix social.
- Se observan `conversationStarts` y `conversation message` en métricas/intents.
- Frontend modular rápido activo:
  - `frontend/modules/socket-client.js` cargado en `index.html`.
  - `frontend/modules/ui-feedback.js` cargado y usado en `app.js` (`uiFeedback.toast`, `uiFeedback.setLoading`, `uiFeedback.setError`).
- Runtime validado post-refactor backend/socket:
  - `curl http://localhost:3001/api/health` => `{"status":"healthy", ... "agents":6, "worldTick":...}`.
  - `curl http://localhost:3001/api/metrics` validado (`world` y `socket` presentes).
  - `curl http://localhost:3001/api/world/conversations` => lista activa (len=5 en prueba).
  - `curl http://localhost:3001/api/events` => payload de eventos (11 en prueba).
- Suite backend ejecutada: `npm test` en `backend/` => `37/37` tests OK.
- UI snapshot funcional post quick-wins/frontend modular:
  - Captura real OpenClaw: `C:\Users\juanp\.openclaw\media\browser\e5505dce-4d88-491e-b982-f94f3ee87dcd.png`.
  - Evidencia visual: ciudad renderizando, telemetría, panel show-mode y conversaciones activas.

---

## 1) Backend Refactor - Fase 1 (Application Layer)

### Día 1-2: Application Services
- [x] Crear `backend/src/application/AgentService.js`
- [x] Crear `backend/src/application/WorldService.js`
- [x] Crear `backend/src/application/EconomyService.js`
- [x] Crear `backend/src/application/EventService.js`
- [x] Integrar services en controllers thin (socket handlers + tick payload + world state viewer)

### Día 3-4: Socket handlers modularizados
- [x] Crear `backend/src/infrastructure/websocket/SocketServer.js`
- [x] Crear handlers separados (`AgentSocketHandler`, `ChatSocketHandler`, `WorldSocketHandler`)
- [x] Extraer handlers desde `backend/server.js`
- [x] Validar parity funcional con tests/manual runtime

### Día 5-7: DI Container
- [x] Crear `backend/src/shared/container.js`
- [x] Registrar managers + services
- [x] Reemplazar inicialización acoplada en `server.js`

---

## 2) Frontend Modernización - Fase inicial (sin big-bang)

### Quick Wins (tomados del plan)
- [x] Extraer cliente socket a módulo (`frontend/modules/socket-client.js`)
- [x] Implementar sistema de toast reutilizable (`frontend/modules/ui-feedback.js`)
- [x] Implementar loading overlay reusable (`frontend/modules/ui-feedback.js`)
- [x] Implementar manejo de error visual consistente (banner + toast + error box)
- [x] Separar bloques UI críticos en módulos (sin migrar aún framework)

### Migración completa (React/Vite) - pendiente
- [ ] Bootstrap `frontend-new` con Vite
- [ ] Base de componentes
- [ ] Hooks (`useSocket`, `useRealtime`, etc.)
- [ ] Estado global
- [ ] Migración progresiva de canvas/world/agents

---

## 3) UX/Operación

- [ ] Definir SLO social mínimo (ej: `conversationMessagesPerMin > 0.5` sostenido)
- [ ] Guardrails automáticos para detectar “sim viva, social congelada”
- [ ] Alertas operativas mínimas en supervisor

---

## 4) Registro de commits relacionados

- [x] `1b65e3e` - fix(ui): serve frontend from backend root and restore proper UTF-8 text rendering
- [x] `195e001` - fix(agents): unblock social loop with conversation fallback and faster initiation
- [x] `2cbce4d` - docs(todo): actualizar avance del plan y evidencias de pruebas funcionales

---

## Notas de ejecución

- Se prioriza estabilidad + mejoras incrementales.
- No se hace reescritura total de una sola vez.
- Cada bloque cerrado debe quedar con evidencia + commit SHA.
