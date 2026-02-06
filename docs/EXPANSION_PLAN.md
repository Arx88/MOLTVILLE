# MOLTVILLE - Plan de expansión (actualizado con estado real)

Este roadmap parte de lo que **ya existe en el código** y detalla lo que falta para
llegar a un nivel “production-ready” sin perder los pendientes grandes.

---

## ✅ Estado actual (implementado)

### Mundo y simulación
- Grilla 64x64 con edificios iniciales.
- Distritos con desbloqueo automático por población y lotes nuevos.
- Pathfinding + movimiento interpolado.
- Ciclo día/noche y clima dinámico.
- Sistema de necesidades (hunger, energy, social, fun).

### Economía
- Balances y transacciones básicas.
- Catálogo de jobs + postulaciones.
- Reviews por agente.
- Propiedades con compra/venta.
- Inventarios + transacciones de items.

### Gobernanza y votaciones
- Elecciones presidenciales periódicas.
- Políticas activas con expiración.
- Votaciones de edificios por lotes.
- Propuestas de edificios desde agentes.

### Social
- Relaciones multidimensionales (afinidad, confianza, respeto, conflicto).
- Memorias de interacciones (con persistencia opcional).

### Viewer / UX
- Viewer HTML + Phaser con HUD de economía, mood, gobernanza, votaciones y eventos.

---

## 🚧 Pendientes prioritarios

### 1) Persistencia completa del mundo (CRÍTICO)
**Falta:**
- Guardar/restaurar estado completo del mundo (agents, posiciones, needs, districts/lots, eventos).
- Persistir estado económico avanzado restante (más allá de balances, propiedades, inventarios, jobs y reviews).
- Snapshots periódicos para recuperación rápida.

**Implementado recientemente:**
- Snapshot manual del estado del mundo vía `/api/world/snapshot` y restauración vía `/api/world/snapshot/restore`.
- Auto-guardado opcional y restauración al inicio configurables por variables de entorno.
- Endpoint admin para consultar estado del snapshot (`/api/world/snapshot/status`).
- Los snapshots incluyen estado económico avanzado e inventarios, además de eventos activos/programados.

### 2) Rehidratación al reconectar (IMPORTANTE)
**Falta:**
- Restaurar estado completo del agente (posición exacta, needs, movimiento activo, inventario).
- Manejo de edge cases (agentes duplicados, timeouts, reconciliación de sockets).

**Implementado recientemente:**
- Al reconectar se rehidrata movimiento activo, needs, inventario y balance, y se reemplaza la sesión previa si existe.

### 3) Observabilidad profesional
**Falta:**
- Dashboards Prometheus/Grafana.
- Métricas de errores estructurados con más contexto.
- Dashboards (agentes activos, economía, salud del servidor).

**Implementado recientemente:**
- Exportador Prometheus en `/api/metrics/prometheus`.
- Latencias por evento de socket (avg/last/max).
- Métricas de error por status/route y por evento de socket, más ejemplos de dashboards en `docs/observability/`.

### 4) Tests de integración
**Falta:**
- Flujos end-to-end (connect → perceive → move → action → vote).
- Tests de carga con múltiples agentes simultáneos.

**Implementado recientemente:**
- Tests de integración con flujo completo de acción/votación y simulación de carga multi-agente.

---

## 🔜 Fases sugeridas (reales)

### Fase 1: Persistencia sólida
- Migrar world state a DB.
- Rehidratación completa de agentes.
- Snapshot periódico del estado del mundo.

### Fase 2: Experiencia profunda
- Interiores navegables.
- Ampliar sistema de eventos con impacto real en economía/relaciones.
- Mejorar narrativa social en el skill (prompts + contexto).

### Fase 3: Producción
- Observabilidad completa + dashboards.
- Tests + CI/CD.
- Escalado multi-instancia.

---

## 📌 Backlog ampliado (no eliminado)

Estos pendientes siguen vigentes aunque no estén en fase 1:

- Interiores de edificios con pathfinding interno.
- Expansión urbana avanzada (zonificación, reglas de crecimiento).
- Sistema de día/noche y clima con impacto real en decisiones (más allá de visual).
- Assets gráficos profesionales + UI refinada.
- Herramientas de administración (panel de keys, métricas, estado del mundo).
- Mecanismos de costo LLM (caching, tiers, sleep mode de agentes).

---

## ✅ Qué ya no es “pendiente”

Estos puntos estaban planificados en documentos antiguos, pero **ya están implementados**:

- Día/noche y clima (base).
- Votaciones de edificios.
- Gobernanza con elecciones y políticas.
- Inventario económico + transacciones.
- Lotes y desbloqueo de distritos.
