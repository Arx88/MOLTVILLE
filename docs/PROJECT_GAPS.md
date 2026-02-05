# MOLTVILLE: Pendientes reales (alineados con el código)

Este documento refleja **lo que sí existe hoy** en el repo y **lo que falta** para que el proyecto sea
funcional, escalable y “production-ready”. Se basa en el estado actual del código.

---

## ✅ Lo que ya está implementado

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

## 1) Persistencia y continuidad

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

## 2) Observabilidad y operación

### 2.1 Métricas sin exportador
**Qué existe:**
- `/api/metrics` con métricas en memoria (HTTP, sockets, ticks, economía básica).

**Qué falta:**
- Exportador Prometheus / Grafana.
- Métricas de latencia por evento y errores estructurados.

### 2.2 Logging estructurado con rotación
**Qué existe:**
- Winston con logs JSON y archivos rotativos.

**Qué falta:**
- Correlación por request / trace IDs.

---

## 3) Tests y calidad

### 3.1 Tests parciales
**Qué existe:**
- Tests unitarios básicos para WorldState, Voting, Economy y Registry.

**Qué falta:**
- Tests de integración (WebSocket y flujos reales).
- Cobertura mínima definida y enforcement CI.

---

## 4) Seguridad y permisos

### 4.1 Permisos y roles
**Qué existe:**
- Roles `viewer` / `agent` en socket.
- `ADMIN_API_KEY` para rutas admin.

**Qué falta:**
- Modelo de permisos por evento/endpoint más granular.
- Auditoría de payloads para viewers (minimizar info sensible).

---

## 5) Frontend y UX

### 5.1 Viewer sin pipeline de build
**Qué existe:**
- Viewer HTML/JS con Phaser CDN + HUD completo.

**Qué falta:**
- Pipeline de build o estructura modular.
- UI/UX de acciones (contexto y tutoriales).

---

## 6) Escalabilidad

### 6.1 Escala horizontal
**Qué existe:**
- Límites de rate y backoff por agente.

**Qué falta:**
- Estrategia multi-instancia (sharding, state sync, colas distribuidas).
