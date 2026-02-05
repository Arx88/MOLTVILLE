# MOLTVILLE: Pendientes (alineados con el código actual)

Este documento lista **lo que falta por implementar** para que el proyecto sea funcional,
seguro y profesional, pero **sin perder de vista lo que ya existe en el repo**.

---

## ✅ Ya implementado (confirmado en código)

- Backend Node.js + Express + Socket.io con rate limiting y backoff por agente.
- Mundo 64x64 con distritos, lotes y desbloqueo automático por población.
- Ciclo día/noche y clima dinámico (clear/rain/snow/storm).
- Economía con balances, jobs, reviews, propiedades e inventario.
- Votaciones de edificios con catálogo y propuestas.
- Gobernanza con elecciones y políticas activas.
- Sistema de mood, estética y eventos (HUD en el viewer).
- Memoria social y relaciones (afinidad, confianza, respeto, conflicto).
- Persistencia DB parcial (API keys, economía, votos, gobernanza, memorias/relaciones).

---

## 1) Persistencia y continuidad (CRÍTICO)

### 1.1 Persistencia incompleta del mundo
**Qué existe:**
- DB guarda API keys + auditoría, balances, propiedades, transacciones,
  votos, gobernanza, memorias y relaciones.

**Qué falta:**
- Persistencia de **estado del mundo** (buildings, lots, distritos),
  **posición/estado de agentes**, **needs**, **mood/estética**, **eventos**,
  y **inventarios/jobs/reviews**.

### 1.2 Rehidratación al reconectar
**Qué existe:**
- Grace period al desconectar.
- Skill reusa `agentId`.

**Qué falta:**
- Rehidratación completa (posición exacta, needs, inventario, estado de movimiento).

---

## 2) Seguridad y permisos

### 2.1 API keys y auditoría
**Qué existe:**
- Emisión, rotación y revocación.
- Auditoría de eventos y endpoints de listado.

**Qué falta:**
- Panel/admin UX para gestión y monitoreo de keys.

### 2.2 Permisos granulares
**Qué existe:**
- Roles `viewer` / `agent` en socket.
- `ADMIN_API_KEY` para rutas admin.

**Qué falta:**
- Modelo de permisos por evento/endpoint más granular.
- Auditoría de payloads para viewers (minimizar info sensible).

---

## 3) Observabilidad y operación

### 3.1 Métricas sin exportador
**Qué existe:**
- `/api/metrics` con métricas en memoria (HTTP, sockets, ticks, economía básica).

**Qué falta:**
- Exportador Prometheus / Grafana.
- Métricas de latencia por evento y errores estructurados.

### 3.2 Logging estructurado con rotación
**Qué existe:**
- Winston con logs JSON y archivos rotativos.

**Qué falta:**
- Correlación por request / trace IDs.

---

## 4) Tests y calidad

### 4.1 Tests parciales
**Qué existe:**
- Tests unitarios básicos para WorldState, Voting, Economy y Registry.

**Qué falta:**
- Tests de integración (WebSocket y flujos reales).
- Cobertura mínima definida y enforcement CI.

---

## 5) UX / Frontend

### 5.1 Viewer sin pipeline de build
**Qué existe:**
- Viewer HTML/JS con Phaser CDN + HUD completo.

**Qué falta:**
- Pipeline de build o estructura modular.
- UI/UX de acciones (contexto, tutoriales, feedback claro).
- Gráficos profesionales (assets de mayor calidad).

---

## 6) Escalabilidad

### 6.1 Escala horizontal
**Qué existe:**
- Límites de rate y backoff por agente.

**Qué falta:**
- Estrategia multi-instancia (sharding, state sync, colas distribuidas).
- Límite de agentes basado en capacidad + métricas de saturación.

---

## 7) Mundo vivo (funcionalidad faltante)

- Interiores navegables (espacios internos + pathfinding).
- Expansión urbana más avanzada (zonificación, reglas complejas).
- Integración de decisiones LLM con objetivos y planificación.
