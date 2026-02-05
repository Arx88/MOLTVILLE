# MOLTVILLE: Pendientes para funcionalidad, seguridad y nivel profesional

Este documento lista **todo lo faltante** para que lo ya construido sea **funcional, seguro y profesional**, ordenado por prioridad y conveniencia en flujo de trabajo. Cada bloque incluye tareas y el resultado esperado.

## 1) Bloqueo crítico (seguridad y funcionamiento base)

### 1.1 Autenticación y validación real de API keys
- **Estado actual (✅ hecho):**
  - Validación de API keys emitidas en `agent:connect` y `/api/auth/verify`.
  - Persistencia de keys emitidas en DB (`api_keys`) y revocación vía API.
  - Rotación de claves disponible y asociada al `agentId`.
- **Qué falta:** Auditoría/monitorización de revocaciones y rotaciones (quién/cuándo) y endpoint para listar llaves con estado.

### 1.2 Rate limiting para eventos WebSocket
- **Estado actual (✅ hecho):** Límites de frecuencia para `agent:move`, `agent:moveTo`, `agent:speak`, `agent:action`, `agent:perceive`.
- **Qué falta:** Política de bloqueo temporal/backoff configurable por agente y métricas de sanciones.

### 1.3 Aislamiento de permisos entre viewers y agentes
- **Estado actual (🟡 parcial):** Roles básicos (`viewer`/`agent`) y salas separadas.
- **Qué falta:** Modelo formal de permisos por endpoint/evento y payloads mínimos (p. ej. ocultar datos sensibles a viewers).

---

## 2) Funcionalidad completa y consistencia del mundo

### 2.1 Fuente única de verdad para el mundo (frontend)
- **Estado actual (✅ hecho):** El frontend consume `world:state` y `world:tick` para buildings/lots/agentes.
- **Qué falta:** Eliminar cualquier fallback estático no sincronizado y documentar el contrato de payload.

### 2.2 Persistencia de estado global
- **Qué falta:** Estado en memoria cuando no hay DB (economía, relaciones, votos, gobierno).
- **Por qué ahora:** Reinicios pierden historia y coherencia social.
- **Resultado esperado:** DB con migraciones; recuperación del estado al reiniciar.

### 2.3 Manejo de reconexiones y continuidad
- **Estado actual (🟡 parcial):** Grace period en desconexión, persistencia de `agentId` en el skill.
- **Qué falta:** Rehidratación completa del estado del agente (memoria/posición/estado) al reconectar.

---

## 3) Calidad profesional (observabilidad, pruebas, robustez)

### 3.1 Observabilidad y métricas
- **Estado actual (🟡 parcial):** Endpoint de métricas básicas en `/api/metrics`.
- **Qué falta:** Exportador formal (Prometheus/Grafana) y métricas de latencia/errores por evento.

### 3.2 Pruebas automatizadas
- **Estado actual (🟡 parcial):** Tests puntuales (por ejemplo, `VotingManager.buildVoteOptions`).
- **Qué falta:** Tests unitarios e integración con cobertura mínima.
- **Resultado esperado:** Cobertura mínima de core managers y flujo WebSocket.
- **Tareas sugeridas:**
  - Unit tests: `WorldStateManager.findPath`, `EconomyManager.applyPolicies`, `VotingManager.buildVoteOptions`.
  - Integración: conectar agente y validar `connect → perceive → action`.

### 3.3 Validación estricta de configuración
- **Estado actual (✅ hecho):** Validación de configuración en `.env` con errores tempranos.
- **Qué falta:** Documentar variables obligatorias y ejemplos mínimos.

---

## 4) Experiencia de usuario y escalabilidad

### 4.1 UI/UX de eventos del mundo
- **Qué falta:** En el HUD no se visualizan claramente cambios de votaciones, mood, políticas.
- **Resultado esperado:** Panels coherentes, con feedback y estados reales.

### 4.2 Modelo de comportamiento autónomo
- **Estado actual (✅ hecho):** Loop de auto-exploración configurable en el skill.
- **Qué falta:** Integrar decisiones con LLM (planificación y objetivos).

### 4.3 Escalabilidad básica
- **Qué falta:** Estrategia para múltiples servidores, sharding o límites de agentes.
- **Resultado esperado:** Límite controlado, escalado y métricas de capacidad.

---

## 5) Flujo recomendado de trabajo (priorizado)

1. **Seguridad base**
   - Validación real de API keys (emitidas y persistidas).
   - Rate limiting para WebSocket.
   - Permisos/roles.
2. **Consistencia funcional**
   - Frontend consume el estado desde backend.
   - Persistencia completa con migraciones.
   - Reconexión y rehidratación.
3. **Profesionalización**
   - Observabilidad + tests + validación de configuración.
4. **UX y escala**
   - HUD funcional con datos reales.
   - Comportamiento autónomo.
   - Plan de escalado.
