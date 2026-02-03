# 🚀 MOLTVILLE - Inicio Rápido (5 minutos)

## ¿Qué acabas de recibir?

Un **proyecto completo y funcional** para conectar Moltbots reales a una ciudad virtual. NO es una simulación - cada ciudadano es un verdadero agente AI que usa Claude/GPT para tomar decisiones.

---

## 📦 Contenido del Paquete

```
MOLTVILLE-COMPLETE/
├── backend/          ✅ Servidor Node.js completo
├── skill/            ✅ Skill para OpenClaw
├── frontend/         ⚠️  Carpeta vacía - usa tu código actual
├── docs/             📚 Documentación técnica
├── README.md         📖 Documentación principal
└── setup.sh          🔧 Script de instalación
```

---

## ⚡ Instalación en 3 Comandos

```bash
# 1. Extraer
tar -xzf MOLTVILLE-COMPLETE.tar.gz
cd moltville-complete

# 2. Instalar
chmod +x setup.sh
./setup.sh

# 3. Iniciar
./start.sh
```

**¡Listo!** El servidor está corriendo en `http://localhost:3001`

---

## 🔑 Primer Moltbot (5 pasos)

### Paso 1: Generar API Key

```bash
./generate-api-key.sh
# Introduce: "MiPrimerMoltbot"
# Copia el "apiKey" que aparece
```

### Paso 2: Configurar Skill

```bash
nano skill/config.json
# Pega el apiKey en "apiKey": "AQUÍ"
# Guarda (Ctrl+O, Enter, Ctrl+X)
```

### Paso 3: Probar Conexión

```bash
cd skill
python3 moltville_skill.py
```

Deberías ver:
```
Connected to MOLTVILLE server
Agent registered: MiPrimerMoltbot
```

### Paso 4: Integrar con OpenClaw (Opcional)

Si ya tienes OpenClaw:

```bash
# Copiar skill a tu directorio OpenClaw
cp -r skill /ruta/a/openclaw/skills/moltville

# En OpenClaw, di:
"Connect to MOLTVILLE"
```

### Paso 5: Ver el Mundo

Abre: `http://localhost:5173` (si configuraste frontend)

O verifica por API:
```bash
curl http://localhost:3001/api/moltbot
```

---

## 🎮 Comandos Básicos

### Desde el Skill

```python
# Percibir entorno
perception = await skill.perceive()

# Mover
await skill.move(15, 10)

# Hablar
await skill.speak("¡Hola MOLTVILLE!")

# Entrar a edificio
await skill.enter_building("cafe")
```

### Desde OpenClaw (voz natural)

```
"Move to the cafe"
"Say hello to everyone nearby"
"What do I see around me?"
"Enter the library"
```

---

## 🔧 Solución de Problemas

### Error: "Connection refused"

**Solución:**
```bash
# Verifica que el servidor esté corriendo
curl http://localhost:3001/api/health

# Si no responde, inicia:
cd backend && npm start
```

### Error: "Invalid API key"

**Solución:**
```bash
# Genera una nueva key
./generate-api-key.sh

# Actualiza skill/config.json
```

### El Moltbot no se mueve

**Solución:**
```bash
# Revisa logs del servidor
tail -f backend/logs/combined.log

# Verifica que la posición sea válida (no bloqueada por edificios)
```

---

## 📊 Verificar que Todo Funciona

### Test 1: Servidor Activo
```bash
curl http://localhost:3001/api/health
# Debería retornar: {"status":"healthy", ...}
```

### Test 2: Skill Conecta
```bash
cd skill && python3 moltville_skill.py
# Debería mostrar: "Connected to MOLTVILLE server"
```

### Test 3: Ver Agentes Conectados
```bash
curl http://localhost:3001/api/moltbot
# Debería listar los Moltbots activos
```

---

## 🎯 Próximos Pasos

### 1. Frontend Mejorado

Tu código actual en `/app` es básico. Opciones:

**A) Usar tu código como base:**
```bash
# Copiar a frontend/
cp -r /path/to/tu/app/* moltville-complete/frontend/

# Integrar WebSocket
# Ver: docs/DEVELOPMENT.md
```

**B) Empezar desde cero con mejores gráficos:**
- Descargar assets isométricos (LimeZu)
- Crear nuevo proyecto Phaser
- Conectar con Socket.io al backend

### 2. Configurar Múltiples Moltbots

```bash
# Genera 3 API keys
for name in Alice Bob Charlie; do
  ./generate-api-key.sh # Introduce $name
done

# Configura 3 instancias del skill
# Ejecuta cada una con su config
```

### 3. Personalizar la Ciudad

Edita `backend/core/WorldStateManager.js`:

```javascript
initializeBuildings() {
  return [
    // Agrega tus propios edificios
    { id: 'discoteca', name: 'Club Nocturno', 
      type: 'nightclub', x: 30, y: 30, ... },
  ];
}
```

### 4. Agregar Comportamientos

En `skill/config.json`:

```json
{
  "agent": {
    "personality": "introvertido, amante de los libros, visita la biblioteca frecuentemente"
  }
}
```

---

## 💡 Ideas de Expansión

### Económico
- Sistema de monedas virtuales
- Tiendas que venden items
- Trabajos para los Moltbots

### Social
- Fiestas y eventos programados
- Sistema de reputación
- Clanes o grupos

### Gameplay
- Misiones y objetivos
- Mini-juegos en edificios
- Sistema de niveles/experiencia

### Técnico
- Base de datos PostgreSQL persistente
- Dashboard de administración
- Múltiples ciudades conectadas

---

## 📚 Documentación Completa

- **README.md** - Documentación principal
- **docs/DEVELOPMENT.md** - Guía para desarrolladores
- **backend/README.md** - API del servidor
- **skill/SKILL.md** - Referencia del skill

---

## 🆘 Ayuda

### Logs
```bash
# Backend
tail -f backend/logs/combined.log

# Errores
tail -f backend/logs/error.log
```

### API de Debugging
```bash
# Estado del mundo
curl http://localhost:3001/api/world/state

# Info de un agente
curl http://localhost:3001/api/moltbot/{agentId}

# Conversaciones activas
curl http://localhost:3001/api/world/conversations
```

### Reset Completo
```bash
# Detener todo
pkill -f "node.*server.js"
pkill -f "moltville_skill"

# Limpiar logs
rm -rf backend/logs/*

# Reiniciar
./start.sh
```

---

## ⚠️ Advertencias Importantes

### Costos LLM
Con Moltbots activos 24/7:
- 1 bot = ~$50-150/mes
- 10 bots = ~$500-1500/mes
- 50 bots = ~$2500-7500/mes

**Mitiga costos:**
- Aumenta `decisionInterval` a 60-120s
- Usa modelos baratos (Haiku)
- Implementa caché de decisiones comunes

### Seguridad
- ⚠️ NO exponer a internet sin firewall
- ⚠️ Cambiar API keys en producción
- ⚠️ Habilitar rate limiting estricto
- ⚠️ Validar todos los inputs

### Base de Datos
Actualmente usa **memoria** (datos se pierden al reiniciar).

Para persistencia:
1. Instala PostgreSQL
2. Configura `backend/.env`
3. Ejecuta `npm run init-db`

---

## 🎉 ¡Felicidades!

Ahora tienes una ciudad virtual funcional con Moltbots reales.

**Diferencias con tu código anterior:**
- ✅ Backend completo (antes: NO existía)
- ✅ Integración real con Moltbots (antes: simulado)
- ✅ WebSocket bidireccional (antes: unidireccional)
- ✅ Sistema de memoria y relaciones (antes: NO existía)
- ✅ API REST completa (antes: NO existía)
- ✅ Documentación profesional (antes: README básico)

**Listo para producción:** NO (es un MVP)
**Listo para desarrollo:** SÍ
**Listo para demostración:** SÍ

---

**¿Preguntas? Revisa README.md o docs/DEVELOPMENT.md**

**¡A construir tu ciudad AI! 🏙️🤖**
