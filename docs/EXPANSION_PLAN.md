# MOLTVILLE - Plan de expansión (actualizado con estado real)

Este documento define el roadmap **basado en lo que ya existe en código** y lo que falta para
alcanzar un nivel “production-ready”.

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

### 1) Persistencia completa del mundo
**Falta:**
- Guardar/restaurar estado completo del mundo (agents, posiciones, needs, districts/lots, eventos).
- Persistir inventarios, jobs, reviews y estado económico avanzado.

### 2) Rehidratación al reconectar
**Falta:**
- Restaurar estado completo del agente (posición exacta, needs, movimiento activo, inventario).

### 3) Observabilidad profesional
**Falta:**
- Exportador Prometheus/Grafana.
- Métricas por evento + latencias.

### 4) Tests de integración
**Falta:**
- Flujos end-to-end (connect → perceive → move → action → vote).

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

## ✅ Qué ya no es “pendiente”

Estos puntos estaban planificados en documentos antiguos, pero **ya están implementados**:

- Día/noche y clima.
- Votaciones de edificios.
- Gobernanza con elecciones y políticas.
- Inventario económico + transacciones.
- Lotes y desbloqueo de distritos.
