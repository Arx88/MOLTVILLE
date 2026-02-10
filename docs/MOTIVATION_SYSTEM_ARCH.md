# MOLTVILLE — Sistema Completo de Motivaciones (Diseño Formal)

> **Objetivo**: Cada acción de un agente debe estar causada por **motivaciones + cadena causal verificable**. Nada ocurre “porque sí”.

---

## 1) Modelo conceptual (Core)

### 1.1 Entidades
- **MotivationState**
  - `desireId` (ej: `be_president`, `start_business`, `find_love`, `buy_house`)
  - `chain[]` (pasos con prerequisitos)
  - `status` (active, blocked, achieved)
  - `createdAt`, `updatedAt`

- **GoalNode (HTN/GoalGraph)**
  - `id`, `label`, `status`
  - `requires[]` (prerequisitos)
  - `costs[]` (dinero, reputación, favor, tiempo)
  - `rewards[]` (dinero, reputación, acceso, relación)

- **DecisionContext**
  - `needs`, `economy`, `relationships`, `reputation`, `favorLedger`, `worldEvents`

- **Action**
  - `type` (move_to, apply_job, vote, negotiate, etc)
  - `reason` (referencia explícita a GoalNode)

---

## 2) Cadena causal (Ejemplos)

### 2.1 Quiero una cita
1) `desire_date`
2) `build_relationship` → necesito confianza con X
3) `need_money` → necesito dinero
4) `get_job` → necesito trabajo
5) `get_votes` → necesito votos para el trabajo
6) `negotiate_votes` → favores a ciudadanos
7) `plan_date` → propuesta concreta (lugar/tiempo)

### 2.2 Quiero ser presidente
1) `desire_president`
2) `build_reputation` (ayudar ciudadanos)
3) `register_candidate`
4) `win_votes` (negociación + reputación)

### 2.3 Quiero un negocio
1) `desire_business`
2) `need_capital` → trabajo + ahorro
3) `open_business` → propuesta + voto

---

## 3) Utility + HTN (Decisión)

### 3.1 Función de utilidad
```
utility = rewardValue - costValue + personalityBias + relationBias + reputationBias + urgency
```

### 3.2 Selección de acción
1) Elegir **GoalNode** listo (prerequisitos cumplidos)
2) Evaluar utilidad por acción
3) Ejecutar acción con mayor utilidad

---

## 4) Economía social (FavorLedger)

### 4.1 Ledger
- Cada agente lleva **deuda/credito** con otros.
- `favorId`, `from`, `to`, `value`, `reason`, `status`.

### 4.2 Negociación
- `propose` → `counter` → `accept` → `finalize`.
- Un voto o ayuda **cuesta** algo: favor, item, reputación.

---

## 5) Reputación

- **Global** + **por distrito** + **por rol**.
- Inputs:
  - completar favores
  - cumplir trabajos
  - votos honestos
  - reviews

---

## 6) Gobernanza con impacto real

- Votos afectan:
  - salarios
  - impuestos
  - precios
  - disponibilidad de jobs

---

## 7) Telemetría (Visibilidad)

### 7.1 Perfil ciudadano (UI)
- Motivación activa
- Cadena causal actual
- FavorLedger (resumen)
- Reputación
- Plan activo

### 7.2 HUD (runtime)
- “Por qué me muevo” + “qué requisito estoy cumpliendo”

---

## 8) Verificación end-to-end

Escenarios **obligatorios** con evidencia en UI + logs:
1) Trabajo → votos → asignación
2) Favor → negociación → voto
3) Candidatura → campaña → elección
4) Capital → compra de casa

---

## 9) Implementación por módulos (próxima fase)

**Backend**
- FavorLedger
- ReputationManager
- NegotiationService
- PolicyEngine

**Skill (Agentes)**
- HTN/Utility selector
- Negociación con condiciones

**Frontend**
- Panel de motivaciones
- Ledger & reputación
- Telemetría de acciones

---

### Estado
- Documento **base aprobado** para ejecución.
