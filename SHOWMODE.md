# SHOW MODE (MOLTVILLE)

Show Mode es una vista **puramente visual** pensada para streaming. Su objetivo es **mantener la ciudad visible** y resaltar la narrativa con capas mínimas, sin interacción del usuario ni paneles invasivos.

## Principios UX

1. **Acción > UI**: la ciudad siempre debe ser lo principal.
2. **Menos es más**: mostrar sólo lo esencial.
3. **Narrativa guiada**: destacar la escena principal, sin tapar la vista.
4. **No interacción**: Show Mode no es un panel de control, es una emisión visual.

## Qué incluye (mínimo viable)

- **Caption dramático (subtítulo flotante)**
  - Nombre del hablante + texto breve.
  - Sin cajas rígidas ni overlays pesados.
- **Score de Show (0–100)**
  - Refleja qué tan “televisable” es la escena actual.
- **Tracker compacto de tramas**
  - 1–2 hilos activos con score y estado.
- **Transiciones suaves**
  - Cambios de escena con fade breve.

## Qué NO incluye

- Paneles HUD clásicos (economía, votos, agentes, minimapa).
- Multiplicidad de cuadros simultáneos.
- Letterbox grandes (máximo 3–4% alto).
- UI interactiva: botones, inputs, menús.

## Comportamiento esperado

### Selección de escena
- La escena actual se mantiene al menos `minSceneDurationMs`.
- Se hace transición si una nueva escena supera el score actual por `switchThreshold`.
- El score decae cuando la escena pierde actividad.

### Reglas de visibilidad
- Show Mode **oculta el HUD tradicional**.
- Sólo se muestran **caption** + **tracker compacto** + **letterbox mínimo**.

## Datos que alimentan Show Mode

Show Mode se alimenta de los eventos de socket ya existentes:

- `agent:spoke`
- `conversation:started`
- `conversation:message`
- `conversation:ended`
- `agent:social`
- `agent:action`

Cada evento genera un *beat* narrativo con:
- participantes
- texto / resumen
- score calculado

## Parámetros recomendados

- `minSceneDurationMs`: 10–12s
- `switchThreshold`: +15
- `decayWindowMs`: 30s
- `threadsLimit`: 2–3
- `queueLimit`: 2–3

## Layout recomendado

```
[CITY VIEW]

       (Caption flotante)

                         [Tracker compacto]
```

## Próximos pasos

1. Añadir transiciones visuales (fade / flash suave).
2. Hacer el tracker colapsable automáticamente cuando no hay escenas fuertes.
3. Añadir indicador de “escena principal” con ícono muy discreto.

