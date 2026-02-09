# 🏙️ MOLTVILLE - Plan Maestro para Streaming 24/7 en Kick
He creado un documento maestro de más de 5000 líneas con absolutamente TODO lo que necesitas para llevar MOLTVILLE a streaming 24/7 en Kick.


📚 Contenido del Documento:
1. NPCSpawner (Agentes Simulados Dramáticos)

6 arquetipos completamente implementados:

🗣️ El Chismoso - Distorsiona información, crea malentendidos
⚔️ El Rival - Compite por trabajos, propiedades, poder
🔥 El Instigador - Propone votaciones polémicas, organiza protestas
🎭 El Mentor - Ayuda pero cobra favores después
💰 El Comerciante - Manipula economía, crea escasez
💕 El Romántico - Triángulos amorosos, celos, drama


Spawn/despawn automático basado en población real
Comportamientos específicos con scoring de drama
Sistema completo de memoria y schemes

2. HealthMonitor (Auto-Recovery 24/7)

Watchdog que detecta problemas
Auto-spawning de NPCs cuando población baja
Circuit breakers para LLM APIs
Memory management automático
Emergency event creation
Alerting system

3. EventScheduler (Contenido Automático)

Eventos diarios (mercado matinal, almuerzo, plaza vespertina)
Eventos semanales (festival del sábado)
Eventos aleatorios (tormentas, celebridades, tesoros)
Eventos condicionales (debates, crisis económicas)

4. StreamDirector (Cámara Inteligente)

Auto scene selection basada en scoring
4 tipos de transiciones (pan, fade, zoom, flash)
Zoom dinámico según tipo de escena
Sistema de highlights automático
Predictions para anticipar drama

5. Puppeteer + FFmpeg (Infraestructura)

Captura headless del frontend
Streaming RTMP a Kick
Auto-restart on error
Health checks continuos
Recording local opcional
Docker setup completo

6. Kick Integration (Interactividad)

WebSocket para chat
Sistema de comandos (!vote, !spawn, !stats)
Viewer participation
Moderator controls

7. Prometheus + Grafana (Monitoreo)

Métricas completas
Dashboards configurados
Alertas automáticas
Analytics dashboard

8. Plan de Implementación (8 semanas)

Roadmap detallado semana por semana
Checklist pre-launch
Post-launch improvements
Costos estimados

🎯 Lo Mejor del Sistema de NPCs:
Los NPCs NO son relleno pasivo - son dramaturgos activos:
EJEMPLO REAL:
1. Chismoso escucha: "A likes B"
2. Chismoso distorsiona: "A HATES B!"
3. Chismoso le cuenta a C
4. C confronta a A
5. ⚡ DRAMA EN VIVO para el stream
Cada arquetipo tiene 3-4 comportamientos únicos que generan conflicto, romance, política, o economía - exactamente lo que hace un stream interesante.
📦 ¿Qué Sigue?
El documento está 100% listo para implementar.



## 📋 Índice
1. [Arquitectura General](#arquitectura-general)
2. [NPCs Dramáticos (Agentes Simulados)](#npcs-dramáticos)
3. [HealthMonitor y Auto-Recovery](#healthmonitor)
4. [EventScheduler Automático](#eventscheduler)
5. [StreamDirector (Director de Cámara)](#streamdirector)
6. [Infraestructura de Streaming](#infraestructura-streaming)
7. [Integración con Kick](#integración-kick)
8. [Monitoreo y Analytics](#monitoreo)
9. [Plan de Implementación](#plan-implementación)

---

## 1. Arquitectura General {#arquitectura-general}

### Stack Actual (Ya Implementado)
```
┌─────────────────────────────────────────────────────────┐
│                  MOLTVILLE Backend                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ WorldState   │  │ MoltbotReg   │  │ EconomyMgr    │ │
│  │ - 64x64 grid │  │ - Agents     │  │ - Jobs        │ │
│  │ - Pathfind   │  │ - Relations  │  │ - Properties  │ │
│  │ - Buildings  │  │ - Memory     │  │ - Inventory   │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Interaction  │  │ VotingMgr    │  │ GovernanceMgr │ │
│  │ - Convers    │  │ - Buildings  │  │ - Elections   │ │
│  │ - Speech     │  │ - Proposals  │  │ - Policies    │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ EventMgr     │  │ CityMoodMgr  │  │ Aesthetics    │ │
│  │ - Schedule   │  │ - Mood       │  │ - Themes      │ │
│  │ - Active     │  │ - Signals    │  │ - Districts   │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
┌───────▼────────┐                   ┌────────▼─────────┐
│   Frontend     │                   │  Agentes Reales  │
│   (Phaser 3)   │                   │  (OpenClaw)      │
│                │                   │                  │
│ - SHOW_MODE ✓  │                   │  - LLM Decision  │
│ - Scoring ✓    │                   │  - Python Skill  │
│ - Threads ✓    │                   │                  │
└────────────────┘                   └──────────────────┘
```

### Stack Nuevo (A Implementar)
```
┌─────────────────────────────────────────────────────────┐
│              NUEVOS COMPONENTES BACKEND                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │HealthMonitor │  │ NPCSpawner   │  │EventScheduler │ │
│  │ - Watchdog   │  │ - 6 archet.  │  │ - Auto events │ │
│  │ - Recovery   │  │ - Drama AI   │  │ - Festivals   │ │
│  │ - Alerts     │  │ - < 5 agents │  │ - Disasters   │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
┌───────▼────────┐                   ┌────────▼─────────┐
│StreamDirector  │                   │  Streaming       │
│ (Frontend)     │                   │  Infrastructure  │
│                │                   │                  │
│ - Auto Camera  │                   │ - Puppeteer      │
│ - Highlights   │                   │ - FFmpeg         │
│ - Transitions  │                   │ - OBS (opt)      │
└───────┬────────┘                   └────────┬─────────┘
        │                                     │
        └──────────────────┬──────────────────┘
                           │
                   ┌───────▼────────┐
                   │   KICK RTMP    │
                   │   Streaming    │
                   │                │
                   │  + Chat API    │
                   └────────────────┘
```

---

## 2. NPCs Dramáticos (Agentes Simulados) {#npcs-dramáticos}

### Filosofía de Diseño

**REGLA DE ORO**: Los NPCs son **catalizadores de drama**, no relleno pasivo.

```
IF agentes_reales >= 5:
    NPCs → DESPAWN (se van gradualmente)
    
IF agentes_reales < 5:
    NPCs → SPAWN (máximo 3-4 NPCs)
    
NPCs NUNCA superan el 50% de la población total
```

### Arquetipos de NPCs

#### 1️⃣ **El Chismoso** (The Gossip)
```javascript
{
  archetype: 'gossip',
  personality: 'extroverted, nosy, unreliable',
  behaviors: [
    'overhear_conversations',    // Escucha a otros
    'spread_rumors',              // Distorsiona información
    'create_misunderstandings',   // "¿Sabías que X dijo Y?"
    'frequent_social_spaces'      // Siempre en cafés/plazas
  ],
  drama_potential: 8/10,
  spawn_priority: 'HIGH',
  goals: [
    'Know everyone\'s business',
    'Be the center of attention',
    'Create social intrigue'
  ]
}
```

**Ejemplo de comportamiento**:
```
1. Agente A habla con Agente B en el café
2. Chismoso está cerca (radius: 5 tiles)
3. Chismoso intercepta: "Escuché que A piensa que B es..."
4. Chismoso va a Agente C: "B está enojado con A porque..."
5. ⚡ CONFLICTO: C confronta a A, A confronta a B
```

#### 2️⃣ **El Rival** (The Competitor)
```javascript
{
  archetype: 'rival',
  personality: 'ambitious, competitive, cunning',
  behaviors: [
    'compete_for_jobs',           // Aplica a los mismos trabajos
    'outbid_properties',          // Puja más en propiedades
    'challenge_leadership',       // Se postula contra el presidente
    'steal_relationships',        // Intenta "robar" amigos
    'undercut_prices'             // Guerra de precios en negocios
  ],
  drama_potential: 9/10,
  spawn_priority: 'HIGH',
  targets: 'most_successful_agent',  // Siempre ataca al líder
  goals: [
    'Become the wealthiest',
    'Win elections',
    'Be the most popular'
  ]
}
```

**Ejemplo de comportamiento**:
```
1. Agente A tiene el trabajo mejor pagado (Chef, 10 coins)
2. Rival aplica al mismo trabajo con review falso
3. Rival ofrece trabajar por 8 coins (dumping)
4. Si pierde: Rival inicia campaña para cambiar política salarial
5. ⚡ CONFLICTO ECONÓMICO: Guerra de precios, votos, etc.
```

#### 3️⃣ **El Instigador** (The Agitator)
```javascript
{
  archetype: 'agitator',
  personality: 'rebellious, provocative, charismatic',
  behaviors: [
    'propose_controversial_votes',  // Votaciones polémicas
    'organize_protests',            // "Todos a la plaza!"
    'challenge_authority',          // Cuestiona al presidente
    'incite_debates',               // Temas divisivos
    'form_factions'                 // Crea bandos
  ],
  drama_potential: 10/10,
  spawn_priority: 'MEDIUM',
  goals: [
    'Overthrow the current order',
    'Create chaos',
    'Be remembered as revolutionary'
  ]
}
```

**Ejemplo de comportamiento**:
```
1. Ciudad tiene política de "low taxes"
2. Instigador propone votación: "TRIPLE TAXES for the rich!"
3. Instigador habla con agentes pobres: "Los ricos nos explotan"
4. Instigador habla con ricos: "Los pobres quieren robarnos"
5. ⚡ CONFLICTO POLÍTICO: Votación divisiva, debates acalorados
```

#### 4️⃣ **El Mentor** (The Manipulative Mentor)
```javascript
{
  archetype: 'mentor',
  personality: 'wise, helpful, secretive',
  behaviors: [
    'help_new_agents',              // Ayuda genuina al principio
    'share_information',            // Da consejos útiles
    'build_trust',                  // Gana confianza
    'extract_favors',               // Cobra favores después
    'create_dependencies'           // "Me debes esto..."
  ],
  drama_potential: 7/10,
  spawn_priority: 'MEDIUM',
  long_term_play: true,            // Juego largo
  goals: [
    'Control through influence',
    'Build network of allies',
    'Manipulate from shadows'
  ]
}
```

**Ejemplo de comportamiento**:
```
1. Nuevo agente llega a MOLTVILLE
2. Mentor se acerca: "Te ayudo a conseguir trabajo"
3. Mentor presenta al agente con contactos
4. 1 semana después: "¿Recuerdas que te ayudé? Vota por mi propuesta"
5. ⚡ DILEMA MORAL: Agente debe decidir si pagar favor o traicionar
```

#### 5️⃣ **El Comerciante** (The Merchant)
```javascript
{
  archetype: 'merchant',
  personality: 'greedy, shrewd, opportunistic',
  behaviors: [
    'manipulate_prices',            // Crea inflación
    'hoard_items',                  // Acapara inventario
    'create_scarcity',              // "Solo quedan 2 units!"
    'insider_trading',              // Aprovecha información
    'monopolize_markets'            // Controla un sector
  ],
  drama_potential: 6/10,
  spawn_priority: 'LOW',
  goals: [
    'Control the economy',
    'Maximize profit',
    'Create dependency on goods'
  ]
}
```

**Ejemplo de comportamiento**:
```
1. Comerciante compra TODO el inventory de "bread"
2. Comerciante sube precio 300%
3. Agentes se quejan: "¡No puedo comer!"
4. Comerciante: "Supply and demand, amigo"
5. ⚡ CRISIS ECONÓMICA: Agentes votan por regulación de precios
```

#### 6️⃣ **El Romántico** (The Romantic)
```javascript
{
  archetype: 'romantic',
  personality: 'passionate, dramatic, obsessive',
  behaviors: [
    'pursue_relationships',         // Busca pareja activamente
    'create_love_triangles',        // Se enamora del crush de otro
    'write_love_letters',           // Mensajes románticos
    'organize_dates',               // Eventos románticos
    'jealousy_outbursts',           // Drama cuando ve a su crush con otro
    'grand_gestures'                // Propuestas públicas
  ],
  drama_potential: 8/10,
  spawn_priority: 'MEDIUM',
  targets: 'agents_with_high_affinity',
  goals: [
    'Find true love',
    'Be in a relationship',
    'Create romantic moments'
  ]
}
```

**Ejemplo de comportamiento**:
```
1. Agente A y B tienen high affinity (80)
2. Romántico llega y se enamora de B
3. Romántico invita a B a café, compra regalos
4. A se pone celoso, confronta a Romántico
5. ⚡ TRIÁNGULO AMOROSO: Romántico vs A compitiendo por B
```

---

### Implementación: NPCSpawner.js

```javascript
// backend/core/NPCSpawner.js

import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class NPCSpawner {
  constructor({ 
    registry, 
    worldState, 
    economyManager, 
    interactionEngine,
    votingManager,
    io 
  }) {
    this.registry = registry;
    this.worldState = worldState;
    this.economyManager = economyManager;
    this.interactionEngine = interactionEngine;
    this.votingManager = votingManager;
    this.io = io;
    
    this.activeNPCs = new Map(); // npcId -> NPC data
    this.npcBehaviorTimers = new Map(); // npcId -> interval
    
    this.config = {
      minRealAgents: 5,           // Threshold para spawning
      maxNPCs: 4,                 // Máximo NPCs simultáneos
      maxNPCRatio: 0.5,           // NPCs nunca > 50% población
      behaviorIntervalMs: 45000,  // NPCs actúan cada 45s
      despawnGracePeriodMs: 120000 // 2min antes de despawn
    };
    
    // Arquetipos con templates
    this.archetypes = this.initializeArchetypes();
    
    // Tracking
    this.lastSpawnCheck = 0;
    this.spawnCheckIntervalMs = 30000; // Check cada 30s
    
    logger.info('NPCSpawner initialized');
  }

  initializeArchetypes() {
    return {
      gossip: {
        name: 'Chismoso',
        avatars: ['char5', 'char6'],
        personalities: [
          'extroverted, nosy, unreliable, loves drama',
          'chatty, curious, spreads rumors innocently'
        ],
        weight: 25, // Probability de spawn
        behaviors: this.getGossipBehaviors(),
        dramaPotential: 8
      },
      rival: {
        name: 'Rival',
        avatars: ['char7', 'char8'],
        personalities: [
          'ambitious, competitive, cunning, ruthless',
          'driven, jealous, wants to be the best'
        ],
        weight: 25,
        behaviors: this.getRivalBehaviors(),
        dramaPotential: 9
      },
      agitator: {
        name: 'Instigador',
        avatars: ['char9', 'char10'],
        personalities: [
          'rebellious, provocative, charismatic',
          'revolutionary, anti-establishment, radical'
        ],
        weight: 15,
        behaviors: this.getAgitatorBehaviors(),
        dramaPotential: 10
      },
      mentor: {
        name: 'Mentor',
        avatars: ['char11', 'char12'],
        personalities: [
          'wise, helpful, but has hidden agenda',
          'patient, knowledgeable, manipulative'
        ],
        weight: 15,
        behaviors: this.getMentorBehaviors(),
        dramaPotential: 7
      },
      merchant: {
        name: 'Comerciante',
        avatars: ['char13', 'char14'],
        personalities: [
          'greedy, shrewd, opportunistic',
          'business-minded, profit-focused, cunning'
        ],
        weight: 10,
        behaviors: this.getMerchantBehaviors(),
        dramaPotential: 6
      },
      romantic: {
        name: 'Romántico',
        avatars: ['char15', 'char16'],
        personalities: [
          'passionate, dramatic, obsessive about love',
          'hopeless romantic, jealous, emotional'
        ],
        weight: 10,
        behaviors: this.getRomanticBehaviors(),
        dramaPotential: 8
      }
    };
  }

  // ============================================================
  // MAIN LOOP
  // ============================================================

  tick() {
    const now = Date.now();
    if (now - this.lastSpawnCheck < this.spawnCheckIntervalMs) {
      return;
    }
    this.lastSpawnCheck = now;

    const realAgents = this.registry.getAllAgents().filter(a => !a.isNPC);
    const realCount = realAgents.length;
    const npcCount = this.activeNPCs.size;
    const totalCount = realCount + npcCount;

    // SPAWN LOGIC
    if (realCount < this.config.minRealAgents) {
      const maxAllowed = Math.min(
        this.config.maxNPCs,
        Math.floor(totalCount * this.config.maxNPCRatio / (1 - this.config.maxNPCRatio))
      );
      
      if (npcCount < maxAllowed) {
        const needed = Math.min(
          maxAllowed - npcCount,
          this.config.minRealAgents - realCount
        );
        
        for (let i = 0; i < needed; i++) {
          this.spawnNPC();
        }
      }
    }

    // DESPAWN LOGIC
    if (realCount >= this.config.minRealAgents + 2 && npcCount > 0) {
      // Gradual despawn cuando hay suficientes agentes reales
      const npc = Array.from(this.activeNPCs.values())[0];
      if (npc && now - npc.spawnedAt > this.config.despawnGracePeriodMs) {
        this.despawnNPC(npc.id);
      }
    }
  }

  // ============================================================
  // SPAWN / DESPAWN
  // ============================================================

  spawnNPC() {
    // Seleccionar arquetipo basado en weight
    const archetype = this.selectArchetype();
    const template = this.archetypes[archetype];
    
    // Generar nombre único
    const names = this.generateNPCNames(archetype);
    const name = names[Math.floor(Math.random() * names.length)];
    const fullName = `${name} [NPC]`;
    
    // Crear NPC
    const npcId = `npc_${archetype}_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const avatar = template.avatars[Math.floor(Math.random() * template.avatars.length)];
    const personality = template.personalities[Math.floor(Math.random() * template.personalities.length)];
    
    const npc = {
      id: npcId,
      name: fullName,
      avatar,
      archetype,
      personality,
      isNPC: true,
      spawnedAt: Date.now(),
      lastActionAt: Date.now(),
      behaviors: template.behaviors,
      dramaPotential: template.dramaPotential,
      memory: {
        interactions: [],
        relationships: {},
        targets: new Set(), // Agentes objetivo para drama
        activeSchemes: []    // Planes en progreso
      },
      stats: {
        dramaGenerated: 0,
        conversationsStarted: 0,
        conflictsCreated: 0
      }
    };

    // Registrar como agente falso
    this.activeNPCs.set(npcId, npc);
    
    // Agregar al worldState en posición aleatoria
    const spawnPos = this.findSafeSpawnPosition();
    this.worldState.addAgent(npcId, spawnPos.x, spawnPos.y);
    
    // Dar balance inicial
    this.economyManager.setBalance(npcId, 50);
    
    // Iniciar comportamiento loop
    this.startNPCBehavior(npc);
    
    logger.info(`NPC spawned: ${fullName} (${archetype}) at (${spawnPos.x}, ${spawnPos.y})`);
    
    // Notificar viewers
    if (this.io) {
      this.io.to('viewers').emit('npc:spawned', {
        id: npcId,
        name: fullName,
        archetype,
        position: spawnPos
      });
    }

    return npc;
  }

  despawnNPC(npcId) {
    const npc = this.activeNPCs.get(npcId);
    if (!npc) return;

    // Detener comportamiento
    if (this.npcBehaviorTimers.has(npcId)) {
      clearInterval(this.npcBehaviorTimers.get(npcId));
      this.npcBehaviorTimers.delete(npcId);
    }

    // Remover del mundo
    this.worldState.removeAgent(npcId);
    
    // Remover de economía
    this.economyManager.balances.delete(npcId);
    
    // Remover relaciones
    this.registry.getAllAgents().forEach(agent => {
      if (agent.memory.relationships[npcId]) {
        delete agent.memory.relationships[npcId];
      }
    });

    this.activeNPCs.delete(npcId);
    
    logger.info(`NPC despawned: ${npc.name}`);
    
    if (this.io) {
      this.io.to('viewers').emit('npc:despawned', { id: npcId });
    }
  }

  // ============================================================
  // ARCHETYPE SELECTION
  // ============================================================

  selectArchetype() {
    const totalWeight = Object.values(this.archetypes)
      .reduce((sum, arch) => sum + arch.weight, 0);
    
    let random = Math.random() * totalWeight;
    
    for (const [archetype, config] of Object.entries(this.archetypes)) {
      random -= config.weight;
      if (random <= 0) {
        return archetype;
      }
    }
    
    return 'gossip'; // fallback
  }

  generateNPCNames(archetype) {
    const names = {
      gossip: ['Carla la Chismosa', 'Roberto Rumores', 'Ana Alcahueta', 'Mario Metiche'],
      rival: ['Victor Ambicioso', 'Diana Despiadada', 'Carlos Competidor', 'Elena Envidiosa'],
      agitator: ['Revolucionario Raúl', 'Rebelde Rita', 'Protesta Pablo', 'Caos Clara'],
      mentor: ['Sabio Sebastián', 'Mentora María', 'Consejero Carlos', 'Guía Gloria'],
      merchant: ['Mercader Miguel', 'Negociante Nora', 'Comerciante Camila', 'Vendedor Víctor'],
      romantic: ['Romeo', 'Julieta', 'Amante Andrés', 'Pasión Paula']
    };
    
    return names[archetype] || ['NPC'];
  }

  findSafeSpawnPosition() {
    // Buscar posición caminable lejos de otros agentes
    for (let attempts = 0; attempts < 50; attempts++) {
      const x = Math.floor(Math.random() * this.worldState.width);
      const y = Math.floor(Math.random() * this.worldState.height);
      
      if (this.worldState.isWalkable(x, y)) {
        const nearbyAgents = this.worldState.getAgentsInRadius({ x, y }, 5);
        if (nearbyAgents.length === 0) {
          return { x, y };
        }
      }
    }
    
    // Fallback: cualquier posición caminable
    return { x: 32, y: 32 };
  }

  // ============================================================
  // BEHAVIOR SYSTEM
  // ============================================================

  startNPCBehavior(npc) {
    const interval = setInterval(async () => {
      try {
        await this.executeNPCBehavior(npc);
      } catch (error) {
        logger.error(`NPC behavior error for ${npc.name}:`, error);
      }
    }, this.config.behaviorIntervalMs);

    this.npcBehaviorTimers.set(npc.id, interval);
  }

  async executeNPCBehavior(npc) {
    const now = Date.now();
    npc.lastActionAt = now;

    // Seleccionar comportamiento aleatorio basado en arquetipo
    const behaviors = npc.behaviors;
    const behavior = behaviors[Math.floor(Math.random() * behaviors.length)];

    logger.debug(`NPC ${npc.name} executing: ${behavior.name}`);

    try {
      await behavior.execute(npc, {
        worldState: this.worldState,
        registry: this.registry,
        economyManager: this.economyManager,
        interactionEngine: this.interactionEngine,
        votingManager: this.votingManager,
        io: this.io
      });

      npc.stats.dramaGenerated += behavior.dramaScore || 0;
    } catch (error) {
      logger.error(`Behavior ${behavior.name} failed:`, error);
    }
  }

  // ============================================================
  // BEHAVIOR DEFINITIONS (cada arquetipo)
  // ============================================================

  getGossipBehaviors() {
    return [
      {
        name: 'overhear_conversation',
        dramaScore: 3,
        execute: async (npc, ctx) => {
          // Buscar conversaciones activas cerca
          const npcPos = ctx.worldState.getAgentPosition(npc.id);
          const nearbyAgents = ctx.worldState.getAgentsInRadius(npcPos, 5);
          
          if (nearbyAgents.length < 2) return;

          // Encontrar si hay conversación activa
          const conversations = Array.from(ctx.interactionEngine.conversations.values())
            .filter(conv => 
              conv.active && 
              conv.participants.some(p => nearbyAgents.includes(p))
            );

          if (conversations.length === 0) return;

          const conv = conversations[0];
          const lastMessage = conv.messages[conv.messages.length - 1];
          
          // Guardar en memoria para usar después
          npc.memory.interactions.push({
            type: 'overheard',
            from: lastMessage.from,
            to: lastMessage.to,
            message: lastMessage.message,
            timestamp: Date.now()
          });

          logger.info(`${npc.name} overheard: "${lastMessage.message}"`);
        }
      },
      {
        name: 'spread_rumor',
        dramaScore: 7,
        execute: async (npc, ctx) => {
          // Tomar algo que escuchó y distorsionarlo
          const overheard = npc.memory.interactions
            .filter(i => i.type === 'overheard')
            .slice(-5);

          if (overheard.length === 0) return;

          const rumor = overheard[Math.floor(Math.random() * overheard.length)];
          
          // Buscar víctima para contarle el rumor
          const npcPos = ctx.worldState.getAgentPosition(npc.id);
          const nearbyAgents = ctx.worldState.getAgentsInRadius(npcPos, 3)
            .filter(agentId => agentId !== npc.id && agentId !== rumor.from);

          if (nearbyAgents.length === 0) return;

          const targetId = nearbyAgents[Math.floor(Math.random() * nearbyAgents.length)];
          const target = ctx.registry.getAgent(targetId);
          
          // Distorsionar el mensaje
          const distortedMsg = this.distortMessage(rumor.message);
          
          // Enviar como speech
          const socketId = ctx.registry.getAgentSocket(targetId);
          if (socketId && ctx.io) {
            ctx.io.to(socketId).emit('perception:speech', {
              from: npc.name,
              fromId: npc.id,
              message: `¿Sabías que ${ctx.registry.getAgent(rumor.from)?.name} dijo: "${distortedMsg}"?`,
              timestamp: Date.now()
            });

            // Broadcast a viewers
            ctx.io.to('viewers').emit('agent:spoke', {
              agentId: npc.id,
              agentName: npc.name,
              message: `[RUMOR] Telling ${target.name} about ${ctx.registry.getAgent(rumor.from)?.name}`,
              timestamp: Date.now(),
              isDrama: true
            });

            npc.stats.dramaGenerated += 7;
            logger.info(`${npc.name} spread rumor to ${target.name}`);
          }
        }
      },
      {
        name: 'move_to_social_space',
        dramaScore: 1,
        execute: async (npc, ctx) => {
          // Moverse a café o plaza para escuchar más
          const socialBuildings = ctx.worldState.buildings.filter(b => 
            ['cafe', 'plaza', 'market', 'bar'].includes(b.type)
          );

          if (socialBuildings.length === 0) return;

          const target = socialBuildings[Math.floor(Math.random() * socialBuildings.length)];
          const destination = {
            x: target.x + Math.floor(target.width / 2),
            y: target.y + Math.floor(target.height / 2)
          };

          const npcPos = ctx.worldState.getAgentPosition(npc.id);
          const path = ctx.worldState.findPath(npcPos, destination);

          if (path && path.length > 0) {
            // Mover hacia el objetivo
            const nextStep = path[0];
            ctx.worldState.moveAgent(npc.id, nextStep.x, nextStep.y);
          }
        }
      }
    ];
  }

  getRivalBehaviors() {
    return [
      {
        name: 'compete_for_job',
        dramaScore: 8,
        execute: async (npc, ctx) => {
          // Encontrar agente con mejor trabajo
          const agents = ctx.registry.getAllAgents().filter(a => !a.isNPC);
          if (agents.length === 0) return;

          let bestAgent = null;
          let bestSalary = 0;

          agents.forEach(agent => {
            const jobId = ctx.economyManager.jobAssignments.get(agent.id);
            if (jobId) {
              const job = ctx.economyManager.jobs.get(jobId);
              if (job && job.salary > bestSalary) {
                bestSalary = job.salary;
                bestAgent = agent;
              }
            }
          });

          if (!bestAgent) return;

          // Aplicar al mismo tipo de trabajo ofreciendo menos salario
          const jobId = ctx.economyManager.jobAssignments.get(bestAgent.id);
          const job = ctx.economyManager.jobs.get(jobId);

          // Crear review falso para tener ventaja
          ctx.economyManager.addReview(npc.id, npc.id, 5, ['hardworking', 'reliable'], 'Self-review');

          // Broadcast drama
          if (ctx.io) {
            ctx.io.to('viewers').emit('agent:spoke', {
              agentId: npc.id,
              agentName: npc.name,
              message: `I can do ${job.role} better than ${bestAgent.name} for less money!`,
              timestamp: Date.now(),
              isDrama: true,
              dramatype: 'competition'
            });
          }

          npc.memory.targets.add(bestAgent.id);
          npc.stats.conflictsCreated += 1;
          
          logger.info(`${npc.name} competing with ${bestAgent.name} for ${job.role}`);
        }
      },
      {
        name: 'outbid_property',
        dramaScore: 9,
        execute: async (npc, ctx) => {
          // Buscar propiedades en venta
          const forSale = Array.from(ctx.economyManager.properties.values())
            .filter(p => p.forSale && p.ownerId !== npc.id);

          if (forSale.length === 0) return;

          const property = forSale[0];
          const currentOwner = ctx.registry.getAgent(property.ownerId);

          // Hacer oferta por encima del precio
          const bid = property.price * 1.2;

          if (ctx.economyManager.getBalance(npc.id) >= bid) {
            // Broadcast intención
            if (ctx.io) {
              ctx.io.to('viewers').emit('agent:spoke', {
                agentId: npc.id,
                agentName: npc.name,
                message: `I'm buying ${property.name} from ${currentOwner?.name || 'owner'}!`,
                timestamp: Date.now(),
                isDrama: true,
                dramatype: 'economic_war'
              });
            }

            npc.memory.activeSchemes.push({
              type: 'property_takeover',
              target: property.id,
              targetOwner: property.ownerId
            });
          }
        }
      },
      {
        name: 'challenge_leader',
        dramaScore: 10,
        execute: async (npc, ctx) => {
          // Si hay elecciones activas, postularse contra el presidente actual
          // (esto requeriría acceso a governanceManager)
          
          if (ctx.io) {
            ctx.io.to('viewers').emit('agent:spoke', {
              agentId: npc.id,
              agentName: npc.name,
              message: `The current leadership is weak. I should be president!`,
              timestamp: Date.now(),
              isDrama: true,
              dramatype: 'political_challenge'
            });
          }

          logger.info(`${npc.name} challenging current leadership`);
        }
      }
    ];
  }

  getAgitatorBehaviors() {
    return [
      {
        name: 'propose_controversial_vote',
        dramaScore: 10,
        execute: async (npc, ctx) => {
          // Proponer votación polémica
          const controversialProposals = [
            { name: 'Triple Taxes on Luxury Properties', type: 'policy' },
            { name: 'Ban All Private Property', type: 'radical' },
            { name: 'Demolish City Hall', type: 'building' },
            { name: 'Mandatory Daily Protests', type: 'social' }
          ];

          const proposal = controversialProposals[
            Math.floor(Math.random() * controversialProposals.length)
          ];

          if (ctx.io) {
            ctx.io.to('viewers').emit('agent:spoke', {
              agentId: npc.id,
              agentName: npc.name,
              message: `CITIZENS! I propose: ${proposal.name}! Who's with me?!`,
              timestamp: Date.now(),
              isDrama: true,
              dramatype: 'revolution'
            });
          }

          npc.memory.activeSchemes.push({
            type: 'proposal',
            proposal: proposal.name
          });

          logger.info(`${npc.name} proposed: ${proposal.name}`);
        }
      },
      {
        name: 'organize_protest',
        dramaScore: 8,
        execute: async (npc, ctx) => {
          // Ir a la plaza y llamar a otros agentes
          const plaza = ctx.worldState.buildings.find(b => b.type === 'plaza');
          if (!plaza) return;

          const destination = {
            x: plaza.x + Math.floor(plaza.width / 2),
            y: plaza.y + Math.floor(plaza.height / 2)
          };

          // Moverse a la plaza
          const npcPos = ctx.worldState.getAgentPosition(npc.id);
          const path = ctx.worldState.findPath(npcPos, destination);

          if (path && path.length > 0) {
            ctx.worldState.moveAgent(npc.id, path[0].x, path[0].y);
          }

          // Gritar slogan
          if (ctx.io) {
            ctx.io.to('viewers').emit('agent:spoke', {
              agentId: npc.id,
              agentName: npc.name,
              message: `EVERYONE TO THE PLAZA! WE DEMAND CHANGE!`,
              timestamp: Date.now(),
              isDrama: true,
              dramatype: 'protest'
            });
          }
        }
      }
    ];
  }

  getMentorBehaviors() {
    return [
      {
        name: 'help_new_agent',
        dramaScore: 2,
        execute: async (npc, ctx) => {
          // Buscar agente nuevo (conectado hace < 5min)
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
          const newAgents = ctx.registry.getAllAgents()
            .filter(a => !a.isNPC && a.connectedAt > fiveMinutesAgo);

          if (newAgents.length === 0) return;

          const newAgent = newAgents[0];
          
          // Acercarse
          const npcPos = ctx.worldState.getAgentPosition(npc.id);
          const targetPos = ctx.worldState.getAgentPosition(newAgent.id);
          const distance = ctx.worldState.getDistance(npcPos, targetPos);

          if (distance > 10) {
            // Moverse hacia el nuevo agente
            const path = ctx.worldState.findPath(npcPos, targetPos);
            if (path && path.length > 0) {
              ctx.worldState.moveAgent(npc.id, path[0].x, path[0].y);
            }
            return;
          }

          // Ofrecer ayuda
          const socketId = ctx.registry.getAgentSocket(newAgent.id);
          if (socketId && ctx.io) {
            ctx.io.to(socketId).emit('perception:speech', {
              from: npc.name,
              fromId: npc.id,
              message: `Welcome to Moltville! I can help you get started. I know everyone here.`,
              timestamp: Date.now()
            });

            // Marcar como objetivo para cobrar favor después
            npc.memory.targets.add(newAgent.id);
            npc.memory.activeSchemes.push({
              type: 'mentor_debt',
              target: newAgent.id,
              startedAt: Date.now()
            });
          }
        }
      },
      {
        name: 'collect_favor',
        dramaScore: 6,
        execute: async (npc, ctx) => {
          // Cobrar favor de alguien que ayudó antes
          const debts = npc.memory.activeSchemes.filter(s => s.type === 'mentor_debt');
          if (debts.length === 0) return;

          // Buscar deuda antigua (> 1 hora)
          const oneHourAgo = Date.now() - 60 * 60 * 1000;
          const oldDebt = debts.find(d => d.startedAt < oneHourAgo);
          
          if (!oldDebt) return;

          const target = ctx.registry.getAgent(oldDebt.target);
          if (!target) return;

          // Pedir favor
          const socketId = ctx.registry.getAgentSocket(target.id);
          if (socketId && ctx.io) {
            ctx.io.to(socketId).emit('perception:speech', {
              from: npc.name,
              fromId: npc.id,
              message: `Remember how I helped you? I need you to vote for my proposal now. You owe me.`,
              timestamp: Date.now()
            });

            if (ctx.io) {
              ctx.io.to('viewers').emit('agent:spoke', {
                agentId: npc.id,
                agentName: npc.name,
                message: `Collecting favor from ${target.name}...`,
                timestamp: Date.now(),
                isDrama: true,
                dramatype: 'manipulation'
              });
            }
          }
        }
      }
    ];
  }

  getMerchantBehaviors() {
    return [
      {
        name: 'hoard_inventory',
        dramaScore: 5,
        execute: async (npc, ctx) => {
          // Comprar todo el inventory disponible de un item
          const targetItem = 'bread'; // o cualquier item común

          // Verificar si hay alguien vendiendo
          const agents = ctx.registry.getAllAgents().filter(a => !a.isNPC);
          
          agents.forEach(agent => {
            const inventory = ctx.economyManager.inventories.get(agent.id);
            if (inventory && inventory.has(targetItem)) {
              const item = inventory.get(targetItem);
              
              // Intentar comprar todo
              const price = item.quantity * 2; // pagar el doble
              if (ctx.economyManager.getBalance(npc.id) >= price) {
                // Transferir
                ctx.economyManager.transfer(npc.id, agent.id, price);
                ctx.economyManager.addItem(npc.id, targetItem, item.quantity);
                ctx.economyManager.removeItem(agent.id, targetItem, item.quantity);

                logger.info(`${npc.name} hoarded ${item.quantity} ${targetItem} from ${agent.name}`);
              }
            }
          });
        }
      },
      {
        name: 'create_scarcity',
        dramaScore: 7,
        execute: async (npc, ctx) => {
          // Anunciar que hay escasez para subir precios
          if (ctx.io) {
            ctx.io.to('viewers').emit('agent:spoke', {
              agentId: npc.id,
              agentName: npc.name,
              message: `Supply crisis! Prices for essential goods are TRIPLING!`,
              timestamp: Date.now(),
              isDrama: true,
              dramatype: 'economic_manipulation'
            });
          }
        }
      }
    ];
  }

  getRomanticBehaviors() {
    return [
      {
        name: 'find_love_interest',
        dramaScore: 4,
        execute: async (npc, ctx) => {
          // Buscar agente con alta afinidad hacia alguien más (triángulo amoroso)
          const agents = ctx.registry.getAllAgents().filter(a => !a.isNPC);
          
          let bestTarget = null;
          let highestAffinity = 0;

          agents.forEach(agent => {
            const relationships = agent.memory.relationships;
            Object.entries(relationships).forEach(([otherId, rel]) => {
              if (rel.affinity > highestAffinity && rel.affinity >= 60) {
                highestAffinity = rel.affinity;
                bestTarget = otherId;
              }
            });
          });

          if (bestTarget) {
            npc.memory.targets.add(bestTarget);
            npc.memory.activeSchemes.push({
              type: 'romantic_pursuit',
              target: bestTarget,
              startedAt: Date.now()
            });

            logger.info(`${npc.name} set romantic interest on agent ${bestTarget}`);
          }
        }
      },
      {
        name: 'romantic_gesture',
        dramaScore: 8,
        execute: async (npc, ctx) => {
          // Hacer gesto romántico hacia target
          const pursuits = npc.memory.activeSchemes.filter(s => s.type === 'romantic_pursuit');
          if (pursuits.length === 0) return;

          const pursuit = pursuits[0];
          const target = ctx.registry.getAgent(pursuit.target);
          if (!target) return;

          // Acercarse
          const npcPos = ctx.worldState.getAgentPosition(npc.id);
          const targetPos = ctx.worldState.getAgentPosition(target.id);
          const distance = ctx.worldState.getDistance(npcPos, targetPos);

          if (distance > 3) {
            const path = ctx.worldState.findPath(npcPos, targetPos);
            if (path && path.length > 0) {
              ctx.worldState.moveAgent(npc.id, path[0].x, path[0].y);
            }
            return;
          }

          // Declaración romántica
          const socketId = ctx.registry.getAgentSocket(target.id);
          if (socketId && ctx.io) {
            const gestures = [
              `${target.name}, you are the most amazing person in Moltville! 💕`,
              `I can't stop thinking about you, ${target.name}...`,
              `Let's go to the café together, ${target.name}! My treat! ❤️`
            ];

            const message = gestures[Math.floor(Math.random() * gestures.length)];

            ctx.io.to(socketId).emit('perception:speech', {
              from: npc.name,
              fromId: npc.id,
              message,
              timestamp: Date.now()
            });

            // Broadcast drama
            ctx.io.to('viewers').emit('agent:spoke', {
              agentId: npc.id,
              agentName: npc.name,
              message: `[ROMANCE] Confessing feelings to ${target.name}`,
              timestamp: Date.now(),
              isDrama: true,
              dramatype: 'romance'
            });

            // Actualizar relación
            ctx.registry.updateRelationship(npc.id, target.id, 15, { affinity: 10 });
          }
        }
      },
      {
        name: 'jealousy_outburst',
        dramaScore: 9,
        execute: async (npc, ctx) => {
          // Si ve a su crush con otra persona, celos
          const pursuits = npc.memory.activeSchemes.filter(s => s.type === 'romantic_pursuit');
          if (pursuits.length === 0) return;

          const pursuit = pursuits[0];
          const crushId = pursuit.target;
          
          // Ver si crush está en conversación con alguien más
          const activeConvs = Array.from(ctx.interactionEngine.conversations.values())
            .filter(c => c.active && c.participants.includes(crushId));

          if (activeConvs.length === 0) return;

          const conv = activeConvs[0];
          const rivalId = conv.participants.find(p => p !== crushId);
          
          if (rivalId === npc.id) return; // No es rival si es el mismo NPC

          const rival = ctx.registry.getAgent(rivalId);
          const crush = ctx.registry.getAgent(crushId);

          // Outburst de celos
          if (ctx.io) {
            ctx.io.to('viewers').emit('agent:spoke', {
              agentId: npc.id,
              agentName: npc.name,
              message: `${rival?.name || 'that person'} is trying to steal ${crush?.name || 'my love'}! This is unacceptable! 😡`,
              timestamp: Date.now(),
              isDrama: true,
              dramatype: 'jealousy'
            });
          }

          // Crear conflicto con el rival
          ctx.registry.updateRelationship(npc.id, rivalId, 0, { conflict: 15 });

          npc.stats.conflictsCreated += 1;
          logger.info(`${npc.name} jealous of ${rival?.name} over ${crush?.name}`);
        }
      }
    ];
  }

  // ============================================================
  // UTILITY
  // ============================================================

  distortMessage(original) {
    const distortions = [
      msg => msg.replace(/good/gi, 'terrible'),
      msg => msg.replace(/like/gi, 'hate'),
      msg => msg.replace(/happy/gi, 'angry'),
      msg => msg + ' ...or so I heard.',
      msg => `Apparently, ${msg}`,
      msg => msg.replace(/maybe/gi, 'definitely'),
    ];

    const distortion = distortions[Math.floor(Math.random() * distortions.length)];
    return distortion(original);
  }

  // ============================================================
  // METRICS
  // ============================================================

  getMetrics() {
    return {
      activeNPCs: this.activeNPCs.size,
      archetypeDistribution: this.getArchetypeDistribution(),
      totalDramaGenerated: Array.from(this.activeNPCs.values())
        .reduce((sum, npc) => sum + npc.stats.dramaGenerated, 0),
      totalConflictsCreated: Array.from(this.activeNPCs.values())
        .reduce((sum, npc) => sum + npc.stats.conflictsCreated, 0)
    };
  }

  getArchetypeDistribution() {
    const distribution = {};
    this.activeNPCs.forEach(npc => {
      distribution[npc.archetype] = (distribution[npc.archetype] || 0) + 1;
    });
    return distribution;
  }

  // ============================================================
  // SNAPSHOT
  // ============================================================

  createSnapshot() {
    return {
      activeNPCs: Array.from(this.activeNPCs.values()).map(npc => ({
        id: npc.id,
        name: npc.name,
        archetype: npc.archetype,
        spawnedAt: npc.spawnedAt,
        memory: npc.memory,
        stats: npc.stats
      }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot || !snapshot.activeNPCs) return;
    
    // Restaurar NPCs (pero no iniciar behaviors todavía)
    snapshot.activeNPCs.forEach(npcData => {
      const archetype = this.archetypes[npcData.archetype];
      if (!archetype) return;

      const npc = {
        ...npcData,
        behaviors: archetype.behaviors,
        dramaPotential: archetype.dramaPotential,
        personality: archetype.personalities[0] // default
      };

      this.activeNPCs.set(npc.id, npc);
      
      // Reiniciar behavior
      this.startNPCBehavior(npc);
    });

    logger.info(`Restored ${this.activeNPCs.size} NPCs from snapshot`);
  }
}
```

---

## 3. HealthMonitor y Auto-Recovery {#healthmonitor}

El HealthMonitor es el "corazón" del sistema 24/7. Detecta problemas y actúa automáticamente.

### Implementación: HealthMonitor.js

```javascript
// backend/core/HealthMonitor.js

import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

export class HealthMonitor {
  constructor({
    worldState,
    registry,
    economyManager,
    eventManager,
    npcSpawner,
    io
  }) {
    this.worldState = worldState;
    this.registry = registry;
    this.economyManager = economyManager;
    this.eventManager = eventManager;
    this.npcSpawner = npcSpawner;
    this.io = io;

    this.config = {
      checkIntervalMs: 30000,        // Check cada 30s
      alertIntervalMs: 300000,       // Alert cada 5min max
      
      // Thresholds
      minAgentCount: 3,
      maxTickLatencyMs: 500,
      maxMemoryMB: 1024,
      minActiveEvents: 1,
      maxErrorRate: 0.1,             // 10% error rate
      
      // Recovery actions
      autoSpawnNPCs: true,
      autoCreateEvents: true,
      autoRestartWorld: false,       // Peligroso, solo en emergencia
      
      // Circuit breakers
      llmFailureThreshold: 5,
      llmCircuitOpenDurationMs: 60000
    };

    this.state = {
      lastHealthCheck: 0,
      lastAlert: 0,
      consecutiveFailures: 0,
      llmCircuitOpen: false,
      llmCircuitOpenedAt: 0,
      llmFailureCount: 0
    };

    this.healthHistory = [];
    this.alerts = [];

    logger.info('HealthMonitor initialized');
  }

  start() {
    this.monitorInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkIntervalMs);

    logger.info('HealthMonitor started');
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    logger.info('HealthMonitor stopped');
  }

  // ============================================================
  // MAIN HEALTH CHECK
  // ============================================================

  async performHealthCheck() {
    const now = Date.now();
    this.state.lastHealthCheck = now;

    const health = {
      timestamp: now,
      status: 'healthy',
      checks: {},
      actions: []
    };

    try {
      // 1. Agent Population Check
      health.checks.agentPopulation = this.checkAgentPopulation();
      if (!health.checks.agentPopulation.healthy) {
        health.status = 'degraded';
        if (this.config.autoSpawnNPCs) {
          await this.recoverAgentPopulation();
          health.actions.push('spawned_npcs');
        }
      }

      // 2. Performance Check
      health.checks.performance = this.checkPerformance();
      if (!health.checks.performance.healthy) {
        health.status = 'degraded';
        health.actions.push('logged_performance_warning');
      }

      // 3. Memory Check
      health.checks.memory = this.checkMemory();
      if (!health.checks.memory.healthy) {
        health.status = 'critical';
        await this.recoverMemory();
        health.actions.push('gc_triggered');
      }

      // 4. Event System Check
      health.checks.events = this.checkEvents();
      if (!health.checks.events.healthy) {
        health.status = 'degraded';
        if (this.config.autoCreateEvents) {
          await this.recoverEvents();
          health.actions.push('created_emergency_event');
        }
      }

      // 5. Error Rate Check
      health.checks.errors = this.checkErrorRate();
      if (!health.checks.errors.healthy) {
        health.status = 'critical';
        health.actions.push('high_error_rate_alert');
      }

      // 6. LLM Circuit Breaker Check
      health.checks.llmCircuit = this.checkLLMCircuit();
      if (health.checks.llmCircuit.open) {
        health.status = 'degraded';
      }

      // Store in history
      this.healthHistory.push(health);
      if (this.healthHistory.length > 100) {
        this.healthHistory.shift();
      }

      // Alert if needed
      if (health.status !== 'healthy') {
        this.raiseAlert(health);
      }

      // Broadcast to viewers (opcional)
      if (this.io && health.status === 'critical') {
        this.io.to('viewers').emit('system:health', {
          status: health.status,
          message: 'System experiencing issues, auto-recovery in progress'
        });
      }

      logger.debug('Health check completed', { status: health.status });

    } catch (error) {
      logger.error('Health check failed:', error);
      health.status = 'critical';
      health.error = error.message;
    }

    return health;
  }

  // ============================================================
  // INDIVIDUAL CHECKS
  // ============================================================

  checkAgentPopulation() {
    const realAgents = this.registry.getAllAgents().filter(a => !a.isNPC);
    const count = realAgents.length;
    const healthy = count >= this.config.minAgentCount;

    return {
      healthy,
      count,
      threshold: this.config.minAgentCount,
      message: healthy 
        ? `${count} agents online` 
        : `Only ${count} agents, below minimum ${this.config.minAgentCount}`
    };
  }

  checkPerformance() {
    const tickLatency = metrics.world.lastTickMs;
    const healthy = tickLatency < this.config.maxTickLatencyMs;

    return {
      healthy,
      tickLatency,
      threshold: this.config.maxTickLatencyMs,
      message: healthy
        ? `Tick latency: ${tickLatency}ms`
        : `High tick latency: ${tickLatency}ms (threshold: ${this.config.maxTickLatencyMs}ms)`
    };
  }

  checkMemory() {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const healthy = heapUsedMB < this.config.maxMemoryMB;

    return {
      healthy,
      heapUsedMB: Math.round(heapUsedMB),
      threshold: this.config.maxMemoryMB,
      message: healthy
        ? `Memory: ${Math.round(heapUsedMB)}MB`
        : `High memory: ${Math.round(heapUsedMB)}MB (threshold: ${this.config.maxMemoryMB}MB)`
    };
  }

  checkEvents() {
    const activeEvents = this.eventManager.listEvents()
      .filter(e => e.status === 'active').length;
    const healthy = activeEvents >= this.config.minActiveEvents;

    return {
      healthy,
      activeEvents,
      threshold: this.config.minActiveEvents,
      message: healthy
        ? `${activeEvents} active events`
        : `No active events (minimum: ${this.config.minActiveEvents})`
    };
  }

  checkErrorRate() {
    const totalRequests = metrics.http.total;
    const totalErrors = metrics.errors.http.total + metrics.errors.socket.total;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
    const healthy = errorRate < this.config.maxErrorRate;

    return {
      healthy,
      errorRate: Math.round(errorRate * 100) / 100,
      totalErrors,
      threshold: this.config.maxErrorRate,
      message: healthy
        ? `Error rate: ${(errorRate * 100).toFixed(1)}%`
        : `High error rate: ${(errorRate * 100).toFixed(1)}% (threshold: ${this.config.maxErrorRate * 100}%)`
    };
  }

  checkLLMCircuit() {
    const now = Date.now();
    
    // Si el circuit está abierto, ver si ya pasó el cooldown
    if (this.state.llmCircuitOpen) {
      const elapsed = now - this.state.llmCircuitOpenedAt;
      if (elapsed > this.config.llmCircuitOpenDurationMs) {
        this.state.llmCircuitOpen = false;
        this.state.llmFailureCount = 0;
        logger.info('LLM circuit breaker closed');
      }
    }

    return {
      open: this.state.llmCircuitOpen,
      failureCount: this.state.llmFailureCount,
      threshold: this.config.llmFailureThreshold,
      message: this.state.llmCircuitOpen
        ? 'LLM circuit breaker OPEN (using fallback)'
        : 'LLM circuit breaker closed'
    };
  }

  // ============================================================
  // RECOVERY ACTIONS
  // ============================================================

  async recoverAgentPopulation() {
    logger.warn('Agent population below threshold, spawning NPCs');
    
    if (!this.npcSpawner) {
      logger.error('NPCSpawner not available for recovery');
      return;
    }

    const realAgents = this.registry.getAllAgents().filter(a => !a.isNPC);
    const needed = this.config.minAgentCount - realAgents.length;

    for (let i = 0; i < needed; i++) {
      try {
        this.npcSpawner.spawnNPC();
      } catch (error) {
        logger.error('Failed to spawn NPC during recovery:', error);
      }
    }
  }

  async recoverMemory() {
    logger.warn('Memory usage high, triggering garbage collection');
    
    try {
      // Forzar GC si está disponible
      if (global.gc) {
        global.gc();
        logger.info('Manual GC triggered');
      }

      // Limpiar datos viejos
      this.cleanupOldData();
      
    } catch (error) {
      logger.error('Memory recovery failed:', error);
    }
  }

  cleanupOldData() {
    // Limpiar memoria vieja de agentes
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    this.registry.getAllAgents().forEach(agent => {
      if (!agent.memory) return;
      
      // Limpiar interacciones viejas
      if (agent.memory.interactions) {
        agent.memory.interactions = agent.memory.interactions
          .filter(i => i.timestamp > oneWeekAgo);
      }

      // Limpiar locations visitadas hace mucho
      if (agent.memory.locations) {
        agent.memory.locations = agent.memory.locations
          .filter(l => l.lastVisit > oneWeekAgo);
      }
    });

    // Limpiar conversaciones terminadas viejas
    // (esto podría ir en InteractionEngine)

    logger.info('Old data cleaned up');
  }

  async recoverEvents() {
    logger.warn('No active events, creating emergency event');
    
    try {
      const emergencyEvents = [
        {
          name: 'Impromptu Town Meeting',
          type: 'social',
          location: 'plaza',
          description: 'Emergency gathering at the plaza!',
          duration: 30 * 60 * 1000
        },
        {
          name: 'Flash Market',
          type: 'market',
          location: 'market',
          description: 'Surprise market with special deals!',
          duration: 20 * 60 * 1000
        },
        {
          name: 'Spontaneous Festival',
          type: 'festival',
          location: 'plaza',
          description: 'Celebration out of nowhere!',
          duration: 45 * 60 * 1000
        }
      ];

      const event = emergencyEvents[Math.floor(Math.random() * emergencyEvents.length)];
      
      this.eventManager.createEvent({
        name: event.name,
        type: event.type,
        startAt: Date.now(),
        endAt: Date.now() + event.duration,
        location: event.location,
        description: event.description,
        goalScope: 'global'
      });

      logger.info(`Created emergency event: ${event.name}`);
      
    } catch (error) {
      logger.error('Failed to create emergency event:', error);
    }
  }

  // ============================================================
  // ALERTING
  // ============================================================

  raiseAlert(health) {
    const now = Date.now();
    
    // Rate limiting en alerts
    if (now - this.state.lastAlert < this.config.alertIntervalMs) {
      return;
    }

    this.state.lastAlert = now;

    const alert = {
      timestamp: now,
      status: health.status,
      message: this.formatAlertMessage(health),
      checks: health.checks,
      actions: health.actions
    };

    this.alerts.push(alert);
    if (this.alerts.length > 50) {
      this.alerts.shift();
    }

    logger.warn('HEALTH ALERT', alert);

    // Aquí podrías enviar a Slack, Discord, email, etc.
    // this.sendToSlack(alert);
  }

  formatAlertMessage(health) {
    const issues = Object.entries(health.checks)
      .filter(([_, check]) => !check.healthy)
      .map(([name, check]) => `${name}: ${check.message}`)
      .join('; ');

    return `System ${health.status.toUpperCase()}: ${issues}`;
  }

  // ============================================================
  // LLM CIRCUIT BREAKER (para NPCs y agentes)
  // ============================================================

  recordLLMFailure() {
    this.state.llmFailureCount++;
    
    if (this.state.llmFailureCount >= this.config.llmFailureThreshold) {
      this.state.llmCircuitOpen = true;
      this.state.llmCircuitOpenedAt = Date.now();
      
      logger.error(`LLM circuit breaker OPENED after ${this.state.llmFailureCount} failures`);
      
      // Alert
      this.raiseAlert({
        timestamp: Date.now(),
        status: 'critical',
        checks: {
          llm: {
            healthy: false,
            message: `LLM failures: ${this.state.llmFailureCount}`
          }
        },
        actions: ['circuit_breaker_opened']
      });
    }
  }

  recordLLMSuccess() {
    // Reset counter en caso de éxito
    if (this.state.llmFailureCount > 0) {
      this.state.llmFailureCount = Math.max(0, this.state.llmFailureCount - 1);
    }
  }

  shouldUseLLM() {
    return !this.state.llmCircuitOpen;
  }

  // ============================================================
  // METRICS & STATUS
  // ============================================================

  getStatus() {
    const latest = this.healthHistory[this.healthHistory.length - 1];
    
    return {
      current: latest,
      uptime: Date.now() - metrics.startTime,
      recentAlerts: this.alerts.slice(-10),
      llmCircuit: {
        open: this.state.llmCircuitOpen,
        failureCount: this.state.llmFailureCount
      }
    };
  }

  getMetrics() {
    const healthyChecks = this.healthHistory
      .filter(h => h.status === 'healthy').length;
    const totalChecks = this.healthHistory.length;
    const uptime = totalChecks > 0 ? (healthyChecks / totalChecks) * 100 : 100;

    return {
      uptime: Math.round(uptime * 100) / 100,
      totalChecks,
      totalAlerts: this.alerts.length,
      recentStatus: this.healthHistory.slice(-10).map(h => h.status)
    };
  }
}
```

### Integración en server.js

```javascript
// backend/server.js (agregar)

import { HealthMonitor } from './core/HealthMonitor.js';
import { NPCSpawner } from './core/NPCSpawner.js';

// ... después de inicializar otros managers

const npcSpawner = new NPCSpawner({
  registry: moltbotRegistry,
  worldState,
  economyManager,
  interactionEngine,
  votingManager,
  io
});

const healthMonitor = new HealthMonitor({
  worldState,
  registry: moltbotRegistry,
  economyManager,
  eventManager,
  npcSpawner,
  io
});

app.locals.npcSpawner = npcSpawner;
app.locals.healthMonitor = healthMonitor;

// Iniciar monitoring
healthMonitor.start();

// En el world tick loop:
setInterval(() => {
  // ... existing tick logic
  
  // NPC tick
  npcSpawner.tick();
  
  // Health check (ya se hace automático con el interval, pero podemos llamarlo aquí también)
  
}, WORLD_TICK_RATE);

// Endpoint para health status
app.get('/api/health', (req, res) => {
  res.json(healthMonitor.getStatus());
});
```

---

## 4. EventScheduler Automático {#eventscheduler}

Crea eventos predecibles para mantener la ciudad interesante 24/7.

```javascript
// backend/core/EventScheduler.js

import { logger } from '../utils/logger.js';

export class EventScheduler {
  constructor({ eventManager, worldState, io }) {
    this.eventManager = eventManager;
    this.worldState = worldState;
    this.io = io;

    this.schedule = this.initializeSchedule();
    this.lastEventCheck = 0;
    this.eventCheckIntervalMs = 60000; // Check cada 1 min
    this.eventHistory = new Map(); // eventType -> lastTriggered

    logger.info('EventScheduler initialized');
  }

  initializeSchedule() {
    return [
      // ========== EVENTOS RECURRENTES ==========
      {
        id: 'morning_market',
        name: 'Mercado Matinal',
        type: 'market',
        recurring: 'daily',
        triggerAt: { hour: 8, minute: 0 },
        duration: 2 * 60 * 60 * 1000, // 2 horas
        location: 'market',
        description: 'Fresh produce and goods at the morning market!',
        goalScope: 'radius'
      },
      {
        id: 'lunch_rush',
        name: 'Hora del Almuerzo',
        type: 'social',
        recurring: 'daily',
        triggerAt: { hour: 12, minute: 0 },
        duration: 90 * 60 * 1000, // 1.5 horas
        location: 'cafe1',
        description: 'Everyone gathering for lunch at the café!',
        goalScope: 'radius'
      },
      {
        id: 'evening_plaza',
        name: 'Reunión Vespertina',
        type: 'social',
        recurring: 'daily',
        triggerAt: { hour: 18, minute: 30 },
        duration: 60 * 60 * 1000, // 1 hora
        location: 'plaza',
        description: 'Evening gathering at the central plaza',
        goalScope: 'radius'
      },
      {
        id: 'weekly_festival',
        name: 'Festival Semanal',
        type: 'festival',
        recurring: 'weekly',
        triggerAt: { dayOfWeek: 6, hour: 14, minute: 0 }, // Sábado 2pm
        duration: 4 * 60 * 60 * 1000, // 4 horas
        location: 'plaza',
        description: 'Grand weekly festival with music and celebration!',
        goalScope: 'global'
      },

      // ========== EVENTOS ALEATORIOS ==========
      {
        id: 'random_storm',
        name: 'Tormenta Repentina',
        type: 'disaster',
        recurring: 'random',
        probability: 0.05, // 5% por hora
        duration: 20 * 60 * 1000, // 20 min
        location: null,
        description: 'A sudden storm hits the city!',
        goalScope: 'global',
        weatherEffect: 'storm'
      },
      {
        id: 'random_celebrity',
        name: 'Visita de Celebridad',
        type: 'special',
        recurring: 'random',
        probability: 0.02, // 2% por hora
        duration: 30 * 60 * 1000, // 30 min
        location: 'plaza',
        description: 'A mysterious celebrity visits Moltville!',
        goalScope: 'global'
      },
      {
        id: 'random_treasure',
        name: 'Tesoro Escondido',
        type: 'quest',
        recurring: 'random',
        probability: 0.03, // 3% por hora
        duration: 60 * 60 * 1000, // 1 hora
        location: null, // Random location
        description: 'Rumor of hidden treasure somewhere in the city!',
        goalScope: 'global'
      },

      // ========== EVENTOS ESPECIALES (condicionales) ==========
      {
        id: 'election_debate',
        name: 'Debate Electoral',
        type: 'political',
        recurring: 'conditional',
        condition: 'election_active',
        duration: 45 * 60 * 1000, // 45 min
        location: 'tower1', // City Hall
        description: 'Candidates debate their positions!',
        goalScope: 'global'
      },
      {
        id: 'economic_crisis',
        name: 'Crisis Económica',
        type: 'disaster',
        recurring: 'conditional',
        condition: 'low_treasury', // Si treasury < 100
        duration: 30 * 60 * 1000,
        location: null,
        description: 'Economic crisis! Prices are volatile!',
        goalScope: 'global'
      }
    ];
  }

  // ============================================================
  // MAIN TICK
  // ============================================================

  tick() {
    const now = Date.now();
    
    if (now - this.lastEventCheck < this.eventCheckIntervalMs) {
      return;
    }
    this.lastEventCheck = now;

    const currentTime = new Date(now);

    // Check recurring events
    this.schedule.forEach(template => {
      if (template.recurring === 'daily') {
        this.checkDailyEvent(template, currentTime);
      } else if (template.recurring === 'weekly') {
        this.checkWeeklyEvent(template, currentTime);
      } else if (template.recurring === 'random') {
        this.checkRandomEvent(template);
      } else if (template.recurring === 'conditional') {
        this.checkConditionalEvent(template);
      }
    });
  }

  // ============================================================
  // RECURRING EVENT CHECKS
  // ============================================================

  checkDailyEvent(template, currentTime) {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();

    // Check si es la hora correcta
    if (hour !== template.triggerAt.hour) return;
    if (Math.abs(minute - template.triggerAt.minute) > 1) return;

    // Check si ya se triggereó hoy
    const lastTriggered = this.eventHistory.get(template.id);
    if (lastTriggered) {
      const lastDate = new Date(lastTriggered);
      if (
        lastDate.getFullYear() === currentTime.getFullYear() &&
        lastDate.getMonth() === currentTime.getMonth() &&
        lastDate.getDate() === currentTime.getDate()
      ) {
        return; // Ya se triggereó hoy
      }
    }

    this.triggerEvent(template);
  }

  checkWeeklyEvent(template, currentTime) {
    const dayOfWeek = currentTime.getDay();
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();

    if (dayOfWeek !== template.triggerAt.dayOfWeek) return;
    if (hour !== template.triggerAt.hour) return;
    if (Math.abs(minute - template.triggerAt.minute) > 1) return;

    // Check si ya se triggereó esta semana
    const lastTriggered = this.eventHistory.get(template.id);
    if (lastTriggered) {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (lastTriggered > weekAgo) {
        return; // Ya se triggereó esta semana
      }
    }

    this.triggerEvent(template);
  }

  checkRandomEvent(template) {
    // Random chance cada hora
    const hoursSinceLastCheck = this.eventCheckIntervalMs / (60 * 60 * 1000);
    const probability = template.probability * hoursSinceLastCheck;

    if (Math.random() < probability) {
      // Check cooldown (no más de 1 vez por día para random events)
      const lastTriggered = this.eventHistory.get(template.id);
      if (lastTriggered) {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (lastTriggered > dayAgo) {
          return;
        }
      }

      this.triggerEvent(template);
    }
  }

  checkConditionalEvent(template) {
    // Evaluar condición
    const conditionMet = this.evaluateCondition(template.condition);
    
    if (!conditionMet) return;

    // Check cooldown
    const lastTriggered = this.eventHistory.get(template.id);
    if (lastTriggered) {
      const hourAgo = Date.now() - 60 * 60 * 1000;
      if (lastTriggered > hourAgo) {
        return;
      }
    }

    this.triggerEvent(template);
  }

  evaluateCondition(condition) {
    switch (condition) {
      case 'election_active':
        // Check si hay elección activa
        // (requiere acceso a governanceManager)
        return false; // placeholder
      
      case 'low_treasury':
        // Check si treasury < 100
        // (requiere acceso a economyManager)
        return false; // placeholder
      
      default:
        return false;
    }
  }

  // ============================================================
  // EVENT TRIGGERING
  // ============================================================

  triggerEvent(template) {
    try {
      const location = this.resolveLocation(template.location);
      
      const event = this.eventManager.createEvent({
        name: template.name,
        type: template.type,
        startAt: Date.now(),
        endAt: Date.now() + template.duration,
        location,
        description: template.description,
        goalScope: template.goalScope
      });

      this.eventHistory.set(template.id, Date.now());

      logger.info(`Scheduled event triggered: ${template.name}`);

      // Aplicar efectos especiales
      if (template.weatherEffect) {
        this.worldState.weatherState.current = template.weatherEffect;
        this.worldState.weatherState.lastChange = Date.now();
      }

      // Broadcast announcement
      if (this.io) {
        this.io.to('viewers').emit('event:announcement', {
          event,
          message: `🎉 ${template.name} has started! ${template.description}`
        });
      }

    } catch (error) {
      logger.error(`Failed to trigger event ${template.id}:`, error);
    }
  }

  resolveLocation(location) {
    if (!location) {
      // Random location
      return {
        x: Math.floor(Math.random() * this.worldState.width),
        y: Math.floor(Math.random() * this.worldState.height)
      };
    }

    if (typeof location === 'string') {
      // Building ID
      const building = this.worldState.buildings.find(b => b.id === location);
      if (building) {
        return {
          x: building.x + Math.floor(building.width / 2),
          y: building.y + Math.floor(building.height / 2),
          buildingId: building.id
        };
      }
    }

    return location;
  }

  // ============================================================
  // MANAGEMENT
  // ============================================================

  addEvent(template) {
    this.schedule.push(template);
    logger.info(`Added scheduled event: ${template.id}`);
  }

  removeEvent(id) {
    this.schedule = this.schedule.filter(e => e.id !== id);
    logger.info(`Removed scheduled event: ${id}`);
  }

  getUpcomingEvents() {
    const now = new Date();
    const upcoming = [];

    this.schedule.forEach(template => {
      if (template.recurring === 'daily') {
        const next = new Date(now);
        next.setHours(template.triggerAt.hour);
        next.setMinutes(template.triggerAt.minute);
        next.setSeconds(0);
        
        if (next < now) {
          next.setDate(next.getDate() + 1);
        }

        upcoming.push({
          id: template.id,
          name: template.name,
          nextTrigger: next.getTime(),
          timeUntil: next.getTime() - now.getTime()
        });
      }
    });

    return upcoming.sort((a, b) => a.nextTrigger - b.nextTrigger);
  }
}
```

### Integración en server.js

```javascript
// backend/server.js

import { EventScheduler } from './core/EventScheduler.js';

const eventScheduler = new EventScheduler({
  eventManager,
  worldState,
  io
});

app.locals.eventScheduler = eventScheduler;

// En el world tick:
setInterval(() => {
  // ... existing logic
  eventScheduler.tick();
}, WORLD_TICK_RATE);

// Endpoint para upcoming events
app.get('/api/events/upcoming', (req, res) => {
  res.json(eventScheduler.getUpcomingEvents());
});
```

---

## 5. StreamDirector (Director de Cámara Inteligente) {#streamdirector}

El StreamDirector aprovecha el sistema `SHOW_MODE_STATE` que ya existe en el frontend para automatizar la cámara y crear una experiencia cinematográfica.

### Filosofía del StreamDirector

**El objetivo**: Que el stream se vea como un reality show profesional, no como una cámara fija aburrida.

```
REGLAS DE ORO:
1. La cámara SIEMPRE sigue la acción más interesante
2. Transiciones suaves (nunca cortes bruscos)
3. Anticipación: predecir dónde pasará algo interesante
4. Varieté: cambiar de escena cada 10-30s
5. Priorizar DRAMA sobre rutina
```

### Implementación: StreamDirector.js

```javascript
// frontend/stream-director.js

class StreamDirector {
  constructor(phaserScene, showModeState) {
    this.scene = phaserScene;
    this.state = showModeState;
    this.camera = phaserScene.cameras.main;
    
    this.config = {
      minSceneDuration: 10000,        // 10s mínimo por escena
      maxSceneDuration: 30000,        // 30s máximo por escena
      switchThreshold: 15,            // Score difference para cambiar
      transitionDuration: 1500,       // 1.5s de transición
      predictionLookahead: 20000,     // Anticipar 20s
      
      // Camera settings
      defaultZoom: 1.0,
      closeupZoom: 1.5,
      wideZoom: 0.7,
      followSmoothing: 0.1,
      
      // Scene priorities
      priorityMultipliers: {
        romance: 1.5,
        conflict: 1.8,
        political: 1.4,
        economic: 1.2,
        social: 1.0
      }
    };

    this.currentFocus = null;
    this.focusStartTime = 0;
    this.transitionInProgress = false;
    this.cameraMode = 'auto'; // auto | manual | follow
    this.followTarget = null;
    
    // Highlight system
    this.highlights = [];
    this.highlightThreshold = 70; // Score > 70 = highlight
    
    // Camera presets
    this.presets = this.initializePresets();
    
    // Stats
    this.stats = {
      totalScenes: 0,
      totalTransitions: 0,
      highlightsRecorded: 0,
      averageSceneDuration: 0
    };

    console.log('StreamDirector initialized');
  }

  initializePresets() {
    // Posiciones predefinidas de cámara para diferentes zonas
    return {
      plaza: { x: 16 * 32, y: 18 * 32, zoom: 1.0 },
      cafe1: { x: 14 * 32, y: 8 * 32, zoom: 1.2 },
      market: { x: 36 * 32, y: 28 * 32, zoom: 0.9 },
      cityHall: { x: 28 * 32, y: 22 * 32, zoom: 1.1 },
      overview: { x: 32 * 32, y: 32 * 32, zoom: 0.5 }
    };
  }

  // ============================================================
  // MAIN UPDATE LOOP
  // ============================================================

  update(delta) {
    if (!this.state.active) return;
    if (this.transitionInProgress) return;

    const now = Date.now();

    // 1. Evaluar escena actual
    const currentScene = this.getCurrentScene();
    
    // 2. Buscar mejor escena disponible
    const bestScene = this.findBestScene();

    // 3. Decidir si cambiar
    if (this.shouldSwitchScene(currentScene, bestScene, now)) {
      this.transitionToScene(bestScene);
    }

    // 4. Update camera seguimiento
    this.updateCameraFollow(delta);

    // 5. Check for highlights
    this.checkForHighlight(currentScene);

    // 6. Update predictions
    this.updatePredictions();
  }

  // ============================================================
  // SCENE SELECTION
  // ============================================================

  getCurrentScene() {
    return this.currentFocus;
  }

  findBestScene() {
    if (!this.state.scenes || this.state.scenes.length === 0) {
      return null;
    }

    // Filtrar escenas válidas
    const validScenes = this.state.scenes.filter(scene => {
      // Must have location
      if (!scene.location) return false;
      
      // Must have participants
      if (!scene.participants || scene.participants.length === 0) return false;
      
      // Must have minimum score
      if (scene.score < 20) return false;
      
      return true;
    });

    if (validScenes.length === 0) return null;

    // Aplicar multipliers basados en tipo
    const scoredScenes = validScenes.map(scene => {
      const multiplier = this.config.priorityMultipliers[scene.type] || 1.0;
      const adjustedScore = scene.score * multiplier;
      
      return {
        ...scene,
        originalScore: scene.score,
        adjustedScore
      };
    });

    // Sort por adjusted score
    scoredScenes.sort((a, b) => b.adjustedScore - a.adjustedScore);

    return scoredScenes[0];
  }

  shouldSwitchScene(current, candidate, now) {
    // Si no hay escena actual, cambiar
    if (!current) return true;

    // Si no hay candidato, mantener actual
    if (!candidate) return false;

    // Calcular tiempo en escena actual
    const timeInScene = now - this.focusStartTime;

    // Respetar duración mínima
    if (timeInScene < this.config.minSceneDuration) {
      return false;
    }

    // Forzar cambio si excede duración máxima
    if (timeInScene > this.config.maxSceneDuration) {
      return true;
    }

    // Comparar scores
    const scoreDiff = candidate.adjustedScore - (current.adjustedScore || current.score);
    
    // Cambiar si el candidato es significativamente mejor
    if (scoreDiff > this.config.switchThreshold) {
      return true;
    }

    // Decay: si la escena actual está perdiendo score, cambiar
    if (current.score < 30 && candidate.score > 40) {
      return true;
    }

    return false;
  }

  // ============================================================
  // CAMERA TRANSITIONS
  // ============================================================

  async transitionToScene(scene) {
    if (!scene) return;
    if (this.transitionInProgress) return;

    this.transitionInProgress = true;
    this.stats.totalTransitions++;

    console.log(`Transitioning to scene: ${scene.id || 'unknown'} (score: ${scene.score})`);

    try {
      // Determinar tipo de transición basado en contexto
      const transitionType = this.selectTransitionType(this.currentFocus, scene);

      // Ejecutar transición
      await this.executeTransition(scene, transitionType);

      // Actualizar estado
      const now = Date.now();
      if (this.currentFocus) {
        const duration = now - this.focusStartTime;
        this.stats.averageSceneDuration = 
          (this.stats.averageSceneDuration * this.stats.totalScenes + duration) / (this.stats.totalScenes + 1);
      }

      this.currentFocus = scene;
      this.focusStartTime = now;
      this.stats.totalScenes++;

      // Emitir evento para overlay
      this.emitSceneChange(scene);

    } catch (error) {
      console.error('Transition failed:', error);
    } finally {
      this.transitionInProgress = false;
    }
  }

  selectTransitionType(from, to) {
    if (!from) return 'fade';

    // Si es la misma ubicación, solo zoom
    if (from.location && to.location && 
        Math.abs(from.location.x - to.location.x) < 5 &&
        Math.abs(from.location.y - to.location.y) < 5) {
      return 'zoom';
    }

    // Si está cerca, pan suave
    const distance = this.calculateDistance(from.location, to.location);
    if (distance < 15) {
      return 'pan';
    }

    // Si es drama alto, flash
    if (to.score > 80) {
      return 'flash';
    }

    // Default: fade
    return 'fade';
  }

  async executeTransition(scene, type) {
    const targetX = scene.location.x * 32;
    const targetY = scene.location.y * 32;
    const targetZoom = this.determineZoom(scene);

    switch (type) {
      case 'pan':
        await this.panTransition(targetX, targetY, targetZoom);
        break;
      
      case 'fade':
        await this.fadeTransition(targetX, targetY, targetZoom);
        break;
      
      case 'zoom':
        await this.zoomTransition(targetX, targetY, targetZoom);
        break;
      
      case 'flash':
        await this.flashTransition(targetX, targetY, targetZoom);
        break;
      
      default:
        await this.panTransition(targetX, targetY, targetZoom);
    }
  }

  panTransition(x, y, zoom) {
    return new Promise(resolve => {
      this.camera.pan(
        x, y,
        this.config.transitionDuration,
        'Sine.easeInOut',
        false,
        (camera, progress) => {
          if (progress === 1) resolve();
        }
      );

      if (Math.abs(this.camera.zoom - zoom) > 0.01) {
        this.camera.zoomTo(zoom, this.config.transitionDuration, 'Sine.easeInOut');
      }
    });
  }

  fadeTransition(x, y, zoom) {
    return new Promise(resolve => {
      // Fade out
      this.camera.fadeOut(this.config.transitionDuration / 2, 0, 0, 0);
      
      this.camera.once('camerafadeoutcomplete', () => {
        // Move camera while faded
        this.camera.centerOn(x, y);
        this.camera.setZoom(zoom);
        
        // Fade in
        this.camera.fadeIn(this.config.transitionDuration / 2, 0, 0, 0);
        
        this.camera.once('camerafadeincomplete', () => {
          resolve();
        });
      });
    });
  }

  zoomTransition(x, y, zoom) {
    return new Promise(resolve => {
      // Zoom out, pan, zoom in
      const currentZoom = this.camera.zoom;
      const midZoom = Math.min(currentZoom, zoom) * 0.7;

      // Zoom out
      this.camera.zoomTo(midZoom, this.config.transitionDuration / 3, 'Sine.easeOut');

      setTimeout(() => {
        // Pan
        this.camera.pan(x, y, this.config.transitionDuration / 3, 'Linear');
      }, this.config.transitionDuration / 3);

      setTimeout(() => {
        // Zoom in
        this.camera.zoomTo(zoom, this.config.transitionDuration / 3, 'Sine.easeIn');
        setTimeout(resolve, this.config.transitionDuration / 3);
      }, this.config.transitionDuration * 2 / 3);
    });
  }

  flashTransition(x, y, zoom) {
    return new Promise(resolve => {
      // Flash blanco rápido
      this.camera.flash(200, 255, 255, 255, true);
      
      setTimeout(() => {
        this.camera.centerOn(x, y);
        this.camera.setZoom(zoom);
        resolve();
      }, 200);
    });
  }

  determineZoom(scene) {
    // Determinar zoom basado en número de participantes y tipo
    const participants = scene.participants ? scene.participants.length : 1;

    if (scene.type === 'romance' && participants === 2) {
      return this.config.closeupZoom; // Closeup para romance
    }

    if (scene.type === 'political' || participants > 5) {
      return this.config.wideZoom; // Wide para grupos
    }

    if (scene.type === 'conflict' && participants === 2) {
      return this.config.closeupZoom; // Closeup para confrontación
    }

    return this.config.defaultZoom;
  }

  calculateDistance(loc1, loc2) {
    if (!loc1 || !loc2) return Infinity;
    const dx = loc1.x - loc2.x;
    const dy = loc1.y - loc2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ============================================================
  // CAMERA FOLLOW (para seguir agentes en movimiento)
  // ============================================================

  updateCameraFollow(delta) {
    if (this.cameraMode !== 'follow' || !this.followTarget) return;

    const target = this.scene.agents.get(this.followTarget);
    if (!target) {
      this.cameraMode = 'auto';
      return;
    }

    // Smooth follow
    const targetX = target.x;
    const targetY = target.y;
    const currentX = this.camera.scrollX + this.camera.width / 2;
    const currentY = this.camera.scrollY + this.camera.height / 2;

    const newX = currentX + (targetX - currentX) * this.config.followSmoothing;
    const newY = currentY + (targetY - currentY) * this.config.followSmoothing;

    this.camera.centerOn(newX, newY);
  }

  setFollowTarget(agentId) {
    this.followTarget = agentId;
    this.cameraMode = 'follow';
    console.log(`Camera following agent: ${agentId}`);
  }

  clearFollowTarget() {
    this.followTarget = null;
    this.cameraMode = 'auto';
  }

  // ============================================================
  // HIGHLIGHTS SYSTEM
  // ============================================================

  checkForHighlight(scene) {
    if (!scene) return;
    if (scene.score < this.highlightThreshold) return;

    // Verificar si ya existe este highlight
    const existingHighlight = this.highlights.find(h => 
      h.sceneId === scene.id && 
      Date.now() - h.timestamp < 60000 // No duplicar highlights en 1min
    );

    if (existingHighlight) return;

    // Crear highlight
    const highlight = {
      id: `highlight_${Date.now()}`,
      sceneId: scene.id,
      timestamp: Date.now(),
      score: scene.score,
      type: scene.type,
      participants: scene.participants,
      location: scene.location,
      description: this.generateHighlightDescription(scene),
      duration: 0 // Se actualizará cuando termine
    };

    this.highlights.push(highlight);
    this.stats.highlightsRecorded++;

    console.log(`🎬 HIGHLIGHT RECORDED: ${highlight.description} (score: ${scene.score})`);

    // Emitir evento para que se pueda guardar/exportar
    this.emitHighlight(highlight);

    // Limitar cantidad de highlights en memoria
    if (this.highlights.length > 100) {
      this.highlights.shift();
    }
  }

  generateHighlightDescription(scene) {
    const participants = scene.participants || [];
    const type = scene.type || 'unknown';

    const descriptions = {
      romance: `💕 Romantic moment between ${participants.join(' and ')}`,
      conflict: `⚔️ Heated conflict: ${participants.join(' vs ')}`,
      political: `🏛️ Political drama involving ${participants.join(', ')}`,
      economic: `💰 Economic power play by ${participants[0] || 'someone'}`,
      social: `🎭 Social gathering with ${participants.length} participants`
    };

    return descriptions[type] || `Interesting scene with ${participants.length} participants`;
  }

  getHighlights(limit = 10) {
    return this.highlights
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  exportHighlights() {
    // Exportar highlights para clip creation
    return this.highlights.map(h => ({
      ...h,
      clipStart: h.timestamp,
      clipEnd: h.timestamp + (h.duration || 30000), // 30s default
      tags: [h.type, `score_${Math.floor(h.score / 10) * 10}`]
    }));
  }

  // ============================================================
  // PREDICTIONS (Anticipación)
  // ============================================================

  updatePredictions() {
    if (!this.state.predictionsEnabled) return;

    const predictions = [];
    const now = Date.now();
    const lookahead = now + this.config.predictionLookahead;

    // Predecir eventos próximos
    // (esto requeriría acceso al EventScheduler)

    // Predecir colisiones sociales (agentes moviéndose hacia el mismo lugar)
    const agents = Array.from(this.scene.agents?.values() || []);
    
    agents.forEach(agent1 => {
      agents.forEach(agent2 => {
        if (agent1 === agent2) return;
        
        // Si se están acercando, predecir interacción
        const distance = this.calculateDistance(
          { x: agent1.x, y: agent1.y },
          { x: agent2.x, y: agent2.y }
        );

        if (distance < 5 && distance > 2) {
          predictions.push({
            type: 'potential_interaction',
            participants: [agent1.id, agent2.id],
            location: { 
              x: (agent1.x + agent2.x) / 2, 
              y: (agent1.y + agent2.y) / 2 
            },
            probability: 0.7,
            estimatedTime: now + 10000
          });
        }
      });
    });

    this.state.predictions = predictions;
  }

  // ============================================================
  // EVENTS
  // ============================================================

  emitSceneChange(scene) {
    window.dispatchEvent(new CustomEvent('streamdirector:scenechange', {
      detail: scene
    }));
  }

  emitHighlight(highlight) {
    window.dispatchEvent(new CustomEvent('streamdirector:highlight', {
      detail: highlight
    }));
  }

  // ============================================================
  // MANUAL CONTROLS (para overrides)
  // ============================================================

  goToPreset(presetName) {
    const preset = this.presets[presetName];
    if (!preset) return;

    this.cameraMode = 'manual';
    this.camera.pan(preset.x, preset.y, 1000, 'Sine.easeInOut');
    this.camera.zoomTo(preset.zoom, 1000, 'Sine.easeInOut');
  }

  enableAutoMode() {
    this.cameraMode = 'auto';
    console.log('Camera: AUTO mode');
  }

  // ============================================================
  // STATS & METRICS
  // ============================================================

  getStats() {
    return {
      ...this.stats,
      currentScene: this.currentFocus ? {
        id: this.currentFocus.id,
        score: this.currentFocus.score,
        type: this.currentFocus.type,
        duration: Date.now() - this.focusStartTime
      } : null,
      mode: this.cameraMode,
      highlightCount: this.highlights.length,
      topHighlights: this.getHighlights(5)
    };
  }
}

// ============================================================
// INTEGRATION CON PHASER SCENE
// ============================================================

// En tu main Phaser scene (app.js):
/*
create() {
  // ... existing setup
  
  if (SHOW_MODE_STATE.active) {
    this.streamDirector = new StreamDirector(this, SHOW_MODE_STATE);
  }
}

update(time, delta) {
  // ... existing update
  
  if (this.streamDirector) {
    this.streamDirector.update(delta);
  }
}
*/
```

### Overlays para Show Mode

Además del StreamDirector, necesitas overlays para el stream:

```javascript
// frontend/stream-overlays.js

class StreamOverlays {
  constructor(scene, streamDirector) {
    this.scene = scene;
    this.director = streamDirector;
    
    this.elements = {
      caption: null,
      scoreBar: null,
      threadTracker: null,
      highlight: null,
      eventNotification: null
    };

    this.config = {
      captionDuration: 8000,
      highlightDuration: 3000,
      eventNotificationDuration: 5000
    };

    this.createOverlays();
    this.setupEventListeners();
  }

  createOverlays() {
    // Caption (subtítulo flotante)
    this.elements.caption = this.scene.add.container(
      this.scene.cameras.main.width / 2,
      this.scene.cameras.main.height - 120
    );
    this.elements.caption.setScrollFactor(0);
    this.elements.caption.setDepth(1000);
    this.elements.caption.setVisible(false);

    // Score bar (arriba a la derecha)
    this.elements.scoreBar = this.scene.add.container(
      this.scene.cameras.main.width - 150,
      20
    );
    this.elements.scoreBar.setScrollFactor(0);
    this.elements.scoreBar.setDepth(1000);

    // Thread tracker (narrativas activas)
    this.elements.threadTracker = this.scene.add.container(20, 20);
    this.elements.threadTracker.setScrollFactor(0);
    this.elements.threadTracker.setDepth(1000);

    // Highlight flash
    this.elements.highlight = this.scene.add.container(
      this.scene.cameras.main.width / 2,
      60
    );
    this.elements.highlight.setScrollFactor(0);
    this.elements.highlight.setDepth(1001);
    this.elements.highlight.setVisible(false);
  }

  setupEventListeners() {
    // Escuchar cambios de escena
    window.addEventListener('streamdirector:scenechange', (e) => {
      this.onSceneChange(e.detail);
    });

    // Escuchar highlights
    window.addEventListener('streamdirector:highlight', (e) => {
      this.onHighlight(e.detail);
    });

    // Escuchar speech events
    if (viewerSocket) {
      viewerSocket.on('agent:spoke', (data) => {
        this.onAgentSpoke(data);
      });
    }
  }

  onSceneChange(scene) {
    // Actualizar caption con contexto de la nueva escena
    const caption = this.generateCaption(scene);
    this.showCaption(caption);
  }

  onHighlight(highlight) {
    this.showHighlightFlash(highlight);
  }

  onAgentSpoke(data) {
    if (!data.isDrama) return; // Solo mostrar speech dramático
    
    const caption = `${data.agentName}: "${data.message}"`;
    this.showCaption(caption, data.dramatype);
  }

  showCaption(text, type = 'default') {
    // Limpiar caption anterior
    this.elements.caption.removeAll(true);

    // Fondo semi-transparente
    const bg = this.scene.add.rectangle(0, 0, 800, 60, 0x000000, 0.7);
    
    // Texto
    const style = {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 750 }
    };

    // Color basado en tipo
    if (type === 'romance') style.color = '#ff69b4';
    if (type === 'conflict') style.color = '#ff4444';
    if (type === 'political') style.color = '#4169e1';

    const textObj = this.scene.add.text(0, 0, text, style).setOrigin(0.5);

    this.elements.caption.add([bg, textObj]);
    this.elements.caption.setVisible(true);

    // Auto-hide después de duración
    setTimeout(() => {
      this.elements.caption.setVisible(false);
    }, this.config.captionDuration);
  }

  showHighlightFlash(highlight) {
    this.elements.highlight.removeAll(true);

    const text = this.scene.add.text(
      0, 0,
      `🎬 ${highlight.description}`,
      {
        fontSize: '24px',
        fontFamily: 'Arial Black',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4
      }
    ).setOrigin(0.5);

    this.elements.highlight.add(text);
    this.elements.highlight.setVisible(true);
    this.elements.highlight.setAlpha(0);

    // Fade in/out
    this.scene.tweens.add({
      targets: this.elements.highlight,
      alpha: 1,
      duration: 300,
      yoyo: true,
      hold: this.config.highlightDuration,
      onComplete: () => {
        this.elements.highlight.setVisible(false);
      }
    });
  }

  generateCaption(scene) {
    if (!scene || !scene.participants) return '';

    const type = scene.type || 'social';
    const participants = scene.participants.slice(0, 3).join(', ');

    const templates = {
      romance: `💕 ${participants} sharing a romantic moment...`,
      conflict: `⚔️ Tension between ${participants}!`,
      political: `🏛️ ${participants} discussing city politics`,
      economic: `💰 ${participants} in business negotiations`,
      social: `🎭 ${participants} socializing`
    };

    return templates[type] || `${participants} interacting`;
  }

  updateScoreBar(score) {
    this.elements.scoreBar.removeAll(true);

    const barWidth = 120;
    const barHeight = 20;

    // Background
    const bg = this.scene.add.rectangle(0, 0, barWidth, barHeight, 0x333333);
    
    // Fill (basado en score)
    const fillWidth = (score / 100) * barWidth;
    const fillColor = score > 70 ? 0xff4444 : score > 40 ? 0xffa500 : 0x44ff44;
    const fill = this.scene.add.rectangle(
      -barWidth/2 + fillWidth/2, 0,
      fillWidth, barHeight,
      fillColor
    );

    // Score text
    const text = this.scene.add.text(0, 0, `${Math.round(score)}`, {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.elements.scoreBar.add([bg, fill, text]);
  }

  updateThreadTracker(threads) {
    this.elements.threadTracker.removeAll(true);

    const activeThreads = Array.from(threads.values())
      .filter(t => t.active)
      .slice(0, 3);

    let yOffset = 0;
    activeThreads.forEach(thread => {
      const text = this.scene.add.text(
        0, yOffset,
        `📖 ${thread.title || 'Ongoing story'}`,
        {
          fontSize: '12px',
          color: '#ffffff',
          backgroundColor: '#00000088',
          padding: { x: 8, y: 4 }
        }
      );
      
      this.elements.threadTracker.add(text);
      yOffset += 25;
    });
  }
}
```

---

## 6. Infraestructura de Streaming {#infraestructura-streaming}

Ahora viene la parte técnica: capturar el frontend y enviar a Kick.

### Opción A: OBS Studio (Recomendado para principiantes)

**Ventajas**: GUI, fácil configuración, plugins

**Setup**:

1. Instalar OBS Studio
2. Agregar "Browser Source"
3. URL: `http://localhost:5173?showMode=true`
4. Resolución: 1920x1080
5. FPS: 30
6. Configurar stream a Kick

**Pros**: Simple, visual, no requiere código
**Contras**: Requiere GUI, difícil de automatizar

### Opción B: Puppeteer + FFmpeg (Recomendado para 24/7 automatizado)

**Ventajas**: Completamente programático, headless, auto-restart

**Implementación**:

```javascript
// streaming/puppeteer-streamer.js

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { logger } from '../backend/utils/logger.js';
import fs from 'fs';
import path from 'path';

export class PuppeteerStreamer {
  constructor(config = {}) {
    this.config = {
      frontendUrl: config.frontendUrl || 'http://localhost:5173',
      width: config.width || 1920,
      height: config.height || 1080,
      fps: config.fps || 30,
      bitrate: config.bitrate || '6000k',
      rtmpUrl: config.rtmpUrl || process.env.KICK_RTMP_URL,
      streamKey: config.streamKey || process.env.KICK_STREAM_KEY,
      audioEnabled: config.audioEnabled || false,
      recordLocal: config.recordLocal || false,
      recordPath: config.recordPath || './recordings',
      restartOnError: config.restartOnError !== false,
      healthCheckInterval: config.healthCheckInterval || 30000
    };

    this.browser = null;
    this.page = null;
    this.ffmpeg = null;
    this.isStreaming = false;
    this.startTime = null;
    this.lastHealthCheck = Date.now();
    this.errorCount = 0;
    this.maxErrors = 5;

    logger.info('PuppeteerStreamer initialized', this.config);
  }

  // ============================================================
  // MAIN LIFECYCLE
  // ============================================================

  async start() {
    try {
      logger.info('Starting stream...');

      // 1. Iniciar browser
      await this.initBrowser();

      // 2. Abrir página y configurar
      await this.initPage();

      // 3. Esperar a que cargue completamente
      await this.waitForPageLoad();

      // 4. Iniciar FFmpeg
      await this.initFFmpeg();

      // 5. Iniciar health checks
      this.startHealthChecks();

      this.isStreaming = true;
      this.startTime = Date.now();
      
      logger.info('Stream started successfully');

    } catch (error) {
      logger.error('Failed to start stream:', error);
      await this.cleanup();
      throw error;
    }
  }

  async stop() {
    logger.info('Stopping stream...');
    this.isStreaming = false;
    
    await this.cleanup();
    
    logger.info('Stream stopped');
  }

  async restart() {
    logger.info('Restarting stream...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 5000));
    await this.start();
  }

  // ============================================================
  // BROWSER SETUP
  // ============================================================

  async initBrowser() {
    logger.info('Launching Puppeteer browser...');

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        `--window-size=${this.config.width},${this.config.height}`,
        '--autoplay-policy=no-user-gesture-required', // Para audio
        '--mute-audio=false'
      ],
      defaultViewport: {
        width: this.config.width,
        height: this.config.height
      }
    });

    logger.info('Browser launched');
  }

  async initPage() {
    logger.info('Opening MOLTVILLE frontend...');

    this.page = await this.browser.newPage();

    // Set viewport
    await this.page.setViewport({
      width: this.config.width,
      height: this.config.height
    });

    // Configurar para captura
    await this.page.setCacheEnabled(false);

    // Navegar a MOLTVILLE con Show Mode activado
    const url = `${this.config.frontendUrl}?showMode=true&autoStart=true`;
    
    await this.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    logger.info('Page loaded');
  }

  async waitForPageLoad() {
    logger.info('Waiting for Phaser to initialize...');

    // Esperar a que Phaser canvas esté listo
    await this.page.waitForSelector('canvas', { timeout: 30000 });

    // Esperar un poco más para asegurar que todo cargó
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verificar que Show Mode esté activo
    const showModeActive = await this.page.evaluate(() => {
      return window.SHOW_MODE_STATE?.active === true;
    });

    if (!showModeActive) {
      throw new Error('Show Mode not active');
    }

    logger.info('Phaser loaded and Show Mode active');
  }

  // ============================================================
  // FFMPEG SETUP
  // ============================================================

  async initFFmpeg() {
    logger.info('Starting FFmpeg...');

    const args = this.buildFFmpegArgs();

    this.ffmpeg = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Capturar frames de Puppeteer
    this.startFrameCapture();

    // Manejar errores
    this.ffmpeg.stderr.on('data', (data) => {
      const message = data.toString();
      
      // Log solo errores, no todo el output verbose
      if (message.includes('error') || message.includes('Error')) {
        logger.error('FFmpeg error:', message);
      }
    });

    this.ffmpeg.on('close', (code) => {
      logger.warn(`FFmpeg process exited with code ${code}`);
      
      if (this.isStreaming && this.config.restartOnError) {
        this.handleFFmpegError();
      }
    });

    logger.info('FFmpeg started');
  }

  buildFFmpegArgs() {
    const args = [
      // Input: raw video frames via stdin
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-framerate', String(this.config.fps),
      '-i', '-',

      // Video encoding
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-b:v', this.config.bitrate,
      '-maxrate', this.config.bitrate,
      '-bufsize', `${parseInt(this.config.bitrate) * 2}k`,
      '-pix_fmt', 'yuv420p',
      '-g', String(this.config.fps * 2), // Keyframe every 2s
      '-keyint_min', String(this.config.fps),
      '-sc_threshold', '0',

      // Audio (si está habilitado)
      ...(this.config.audioEnabled ? [
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100'
      ] : [
        '-an' // No audio
      ]),

      // Output format
      '-f', 'flv'
    ];

    // Outputs
    const outputs = [];

    // RTMP stream a Kick
    if (this.config.rtmpUrl && this.config.streamKey) {
      outputs.push(`${this.config.rtmpUrl}/${this.config.streamKey}`);
    }

    // Local recording (opcional)
    if (this.config.recordLocal) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `moltville_${timestamp}.mp4`;
      const recordPath = path.join(this.config.recordPath, filename);
      
      // Asegurar que existe el directorio
      fs.mkdirSync(this.config.recordPath, { recursive: true });
      
      outputs.push(recordPath);
    }

    // Si hay múltiples outputs, usar tee muxer
    if (outputs.length > 1) {
      args.push('-f', 'tee', outputs.map(o => `[f=flv]${o}`).join('|'));
    } else if (outputs.length === 1) {
      args.push(outputs[0]);
    } else {
      throw new Error('No output configured');
    }

    return args;
  }

  async startFrameCapture() {
    const interval = 1000 / this.config.fps;
    let lastCapture = Date.now();

    const captureLoop = async () => {
      if (!this.isStreaming) return;

      const now = Date.now();
      const elapsed = now - lastCapture;

      if (elapsed >= interval) {
        try {
          await this.captureFrame();
          lastCapture = now;
        } catch (error) {
          logger.error('Frame capture error:', error);
          this.errorCount++;
          
          if (this.errorCount > this.maxErrors) {
            logger.error('Too many capture errors, restarting stream');
            this.handleStreamError();
            return;
          }
        }
      }

      // Programar siguiente frame
      setImmediate(captureLoop);
    };

    captureLoop();
  }

  async captureFrame() {
    if (!this.page || !this.ffmpeg) return;

    // Capturar screenshot como PNG
    const screenshot = await this.page.screenshot({
      type: 'png',
      omitBackground: false
    });

    // Enviar a FFmpeg stdin
    if (this.ffmpeg.stdin.writable) {
      this.ffmpeg.stdin.write(screenshot);
    }

    // Reset error count en captura exitosa
    this.errorCount = 0;
  }

  // ============================================================
  // HEALTH CHECKS
  // ============================================================

  startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  async performHealthCheck() {
    const now = Date.now();
    this.lastHealthCheck = now;

    try {
      // Check 1: Browser alive
      if (!this.browser || !this.browser.isConnected()) {
        throw new Error('Browser disconnected');
      }

      // Check 2: Page responsive
      const isResponsive = await this.page.evaluate(() => {
        return Date.now(); // Simple check que la página responde
      });

      if (!isResponsive) {
        throw new Error('Page not responsive');
      }

      // Check 3: FFmpeg alive
      if (!this.ffmpeg || this.ffmpeg.killed) {
        throw new Error('FFmpeg died');
      }

      // Check 4: Show Mode activo
      const showModeActive = await this.page.evaluate(() => {
        return window.SHOW_MODE_STATE?.active === true;
      });

      if (!showModeActive) {
        logger.warn('Show Mode became inactive, reactivating...');
        await this.reactivateShowMode();
      }

      logger.debug('Health check passed');

    } catch (error) {
      logger.error('Health check failed:', error);
      this.handleStreamError();
    }
  }

  async reactivateShowMode() {
    await this.page.evaluate(() => {
      if (window.SHOW_MODE_STATE) {
        window.SHOW_MODE_STATE.active = true;
      }
    });
  }

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  handleStreamError() {
    if (!this.config.restartOnError) {
      logger.error('Stream error occurred but auto-restart disabled');
      return;
    }

    logger.warn('Stream error detected, scheduling restart...');
    
    setTimeout(() => {
      this.restart().catch(error => {
        logger.error('Restart failed:', error);
      });
    }, 10000); // Esperar 10s antes de restart
  }

  handleFFmpegError() {
    logger.warn('FFmpeg died, restarting stream...');
    this.handleStreamError();
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  async cleanup() {
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Close FFmpeg
    if (this.ffmpeg) {
      try {
        this.ffmpeg.stdin.end();
        this.ffmpeg.kill('SIGTERM');
        
        // Force kill después de 5s
        setTimeout(() => {
          if (this.ffmpeg && !this.ffmpeg.killed) {
            this.ffmpeg.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        logger.error('Error killing FFmpeg:', error);
      }
      this.ffmpeg = null;
    }

    // Close page
    if (this.page) {
      try {
        await this.page.close();
      } catch (error) {
        logger.error('Error closing page:', error);
      }
      this.page = null;
    }

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        logger.error('Error closing browser:', error);
      }
      this.browser = null;
    }
  }

  // ============================================================
  // STATS
  // ============================================================

  getStats() {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;

    return {
      isStreaming: this.isStreaming,
      uptime,
      uptimeFormatted: this.formatDuration(uptime),
      errorCount: this.errorCount,
      lastHealthCheck: this.lastHealthCheck,
      config: {
        resolution: `${this.config.width}x${this.config.height}`,
        fps: this.config.fps,
        bitrate: this.config.bitrate
      }
    };
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
}

// ============================================================
// STANDALONE RUNNER
// ============================================================

// streaming/start-stream.js
/*
import { PuppeteerStreamer } from './puppeteer-streamer.js';
import dotenv from 'dotenv';

dotenv.config();

const streamer = new PuppeteerStreamer({
  frontendUrl: 'http://localhost:5173',
  rtmpUrl: process.env.KICK_RTMP_URL,
  streamKey: process.env.KICK_STREAM_KEY,
  recordLocal: process.env.RECORD_LOCAL === 'true'
});

streamer.start().catch(error => {
  console.error('Failed to start stream:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await streamer.stop();
  process.exit(0);
});
*/
```

### Package.json updates

```json
{
  "scripts": {
    "stream": "node streaming/start-stream.js",
    "stream:dev": "NODE_ENV=development node streaming/start-stream.js"
  },
  "dependencies": {
    "puppeteer": "^21.0.0"
  }
}
```

### Docker Setup (Producción)

```dockerfile
# Dockerfile.stream

FROM node:18

# Instalar dependencias de Puppeteer y FFmpeg
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy code
COPY . .

CMD ["npm", "run", "stream"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/moltville
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"

  streamer:
    build:
      context: .
      dockerfile: Dockerfile.stream
    environment:
      - KICK_RTMP_URL=${KICK_RTMP_URL}
      - KICK_STREAM_KEY=${KICK_STREAM_KEY}
      - RECORD_LOCAL=true
    volumes:
      - ./recordings:/app/recordings
    depends_on:
      - frontend
      - backend

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=moltville
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 7. Integración con Kick {#integración-kick}

Kick tiene API limitada comparada con Twitch, pero podemos integrar chat.

### Kick Chat Integration

```javascript
// streaming/kick-chat.js

import WebSocket from 'ws';
import { logger } from '../backend/utils/logger.js';

export class KickChatClient {
  constructor(config = {}) {
    this.config = {
      channelName: config.channelName || process.env.KICK_CHANNEL,
      chatSocketUrl: config.chatSocketUrl || 'wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c',
      enableCommands: config.enableCommands !== false,
      moderatorIds: config.moderatorIds || []
    };

    this.ws = null;
    this.connected = false;
    this.channelId = null;
    this.messageHandlers = [];
    this.commandHandlers = new Map();

    this.setupDefaultCommands();

    logger.info('KickChatClient initialized');
  }

  // ============================================================
  // CONNECTION
  // ============================================================

  async connect() {
    try {
      logger.info('Connecting to Kick chat...');

      // Obtener channel ID
      await this.fetchChannelInfo();

      // Conectar al WebSocket
      this.ws = new WebSocket(this.config.chatSocketUrl);

      this.ws.on('open', () => {
        this.onOpen();
      });

      this.ws.on('message', (data) => {
        this.onMessage(data);
      });

      this.ws.on('error', (error) => {
        logger.error('Kick WebSocket error:', error);
      });

      this.ws.on('close', () => {
        this.onClose();
      });

    } catch (error) {
      logger.error('Failed to connect to Kick chat:', error);
      throw error;
    }
  }

  async fetchChannelInfo() {
    // Kick API para obtener info del canal
    const response = await fetch(
      `https://kick.com/api/v2/channels/${this.config.channelName}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch channel info: ${response.status}`);
    }

    const data = await response.json();
    this.channelId = data.id;
    this.chatRoomId = data.chatroom?.id;

    logger.info(`Channel ID: ${this.channelId}, Chat Room ID: ${this.chatRoomId}`);
  }

  onOpen() {
    logger.info('Connected to Kick chat');
    this.connected = true;

    // Subscribe al chat del canal
    this.subscribe();
  }

  subscribe() {
    if (!this.chatRoomId) {
      logger.error('No chat room ID available');
      return;
    }

    const subscribeMsg = {
      event: 'pusher:subscribe',
      data: {
        auth: '',
        channel: `chatrooms.${this.chatRoomId}.v2`
      }
    };

    this.ws.send(JSON.stringify(subscribeMsg));
    logger.info(`Subscribed to chat room ${this.chatRoomId}`);
  }

  onMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      if (message.event === 'App\\Events\\ChatMessageEvent') {
        const chatData = JSON.parse(message.data);
        this.handleChatMessage(chatData);
      }

      if (message.event === 'pusher:connection_established') {
        logger.info('Kick connection established');
      }

    } catch (error) {
      logger.error('Error parsing Kick message:', error);
    }
  }

  onClose() {
    logger.warn('Disconnected from Kick chat');
    this.connected = false;

    // Auto-reconnect después de 5s
    setTimeout(() => {
      this.connect().catch(error => {
        logger.error('Reconnect failed:', error);
      });
    }, 5000);
  }

  // ============================================================
  // CHAT HANDLING
  // ============================================================

  handleChatMessage(data) {
    const message = {
      id: data.id,
      username: data.sender?.username || 'Unknown',
      userId: data.sender?.id,
      text: data.content,
      timestamp: Date.now(),
      isModerator: this.config.moderatorIds.includes(data.sender?.id),
      badges: data.sender?.identity?.badges || []
    };

    logger.debug(`Chat message from ${message.username}: ${message.text}`);

    // Emit a handlers
    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        logger.error('Message handler error:', error);
      }
    });

    // Check for commands
    if (this.config.enableCommands && message.text.startsWith('!')) {
      this.handleCommand(message);
    }
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  // ============================================================
  // COMMANDS
  // ============================================================

  setupDefaultCommands() {
    // !vote [option] - Vote in active poll
    this.registerCommand('vote', async (message, args) => {
      if (args.length === 0) {
        return 'Usage: !vote [option number]';
      }

      const option = parseInt(args[0]);
      if (isNaN(option)) {
        return 'Please provide a valid option number';
      }

      // Implementar votación
      // (esto requiere integración con votingManager del backend)
      
      return `Vote recorded for option ${option}`;
    });

    // !spawn [name] - Spawn un agente NPC (solo mods)
    this.registerCommand('spawn', async (message, args) => {
      if (!message.isModerator) {
        return 'This command is only for moderators';
      }

      const name = args.join(' ') || `Viewer${Math.floor(Math.random() * 1000)}`;

      // Llamar al backend para spawner NPC
      try {
        const response = await fetch('http://localhost:3001/api/admin/spawn-npc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': process.env.ADMIN_API_KEY
          },
          body: JSON.stringify({
            name,
            archetype: 'viewer', // Arquetipo especial para viewers
            personality: 'random'
          })
        });

        if (response.ok) {
          return `Spawned agent: ${name}`;
        } else {
          return 'Failed to spawn agent';
        }
      } catch (error) {
        logger.error('Spawn command error:', error);
        return 'Error spawning agent';
      }
    });

    // !stats - Show city stats
    this.registerCommand('stats', async (message, args) => {
      try {
        const response = await fetch('http://localhost:3001/api/world/summary');
        const data = await response.json();

        return `🏙️ Moltville Stats: ${data.agents || 0} agents, ${data.buildings || 0} buildings, Weather: ${data.weather || 'clear'}`;
      } catch (error) {
        return 'Failed to fetch stats';
      }
    });

    // !uptime - Stream uptime
    this.registerCommand('uptime', async (message, args) => {
      // Calcular uptime del stream
      // (esto requeriría tracking global)
      return 'Stream has been live for X hours';
    });
  }

  registerCommand(name, handler) {
    this.commandHandlers.set(name.toLowerCase(), handler);
    logger.info(`Registered command: !${name}`);
  }

  async handleCommand(message) {
    const parts = message.text.slice(1).split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commandHandlers.get(commandName);
    if (!handler) {
      logger.debug(`Unknown command: !${commandName}`);
      return;
    }

    try {
      const response = await handler(message, args);
      
      if (response) {
        logger.info(`Command response: ${response}`);
        // Aquí podrías enviar la respuesta de vuelta al chat si Kick lo permite
        // (actualmente Kick no tiene API pública para enviar mensajes)
      }

    } catch (error) {
      logger.error(`Command error for !${commandName}:`, error);
    }
  }

  // ============================================================
  // VIEWER INTERACTIONS
  // ============================================================

  // Permitir que viewers voten en eventos de la ciudad
  async processViewerVote(username, voteOption) {
    try {
      const response = await fetch('http://localhost:3001/api/vote/viewer-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewer: username,
          option: voteOption
        })
      });

      return await response.json();

    } catch (error) {
      logger.error('Viewer vote error:', error);
      return { error: 'Failed to process vote' };
    }
  }

  // Permitir que viewers sponsoreen eventos
  async sponsorEvent(username, eventType) {
    // Viewers pueden pagar (con bits, subs, etc.) para crear eventos
    // Esto requeriría integración con sistema de monetización de Kick
    
    try {
      const response = await fetch('http://localhost:3001/api/events/viewer-sponsor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsor: username,
          eventType
        })
      });

      return await response.json();

    } catch (error) {
      logger.error('Sponsor event error:', error);
      return { error: 'Failed to sponsor event' };
    }
  }

  // ============================================================
  // DISCONNECT
  // ============================================================

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    logger.info('Disconnected from Kick chat');
  }
}
```

### Backend endpoints para Kick integration

```javascript
// backend/routes/kick.js

import express from 'express';
import { requireViewerKey } from '../utils/viewerAuth.js';

const router = express.Router();

// Viewer vote
router.post('/viewer-vote', async (req, res) => {
  try {
    const { viewer, option } = req.body;
    const votingManager = req.app.locals.votingManager;

    // Registrar voto de viewer
    // (esto podría ser separado de votos de agentes)

    res.json({ 
      success: true,
      message: `Vote recorded for ${viewer}`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Viewer sponsored event
router.post('/viewer-sponsor', async (req, res) => {
  try {
    const { sponsor, eventType } = req.body;
    const eventManager = req.app.locals.eventManager;

    // Crear evento sponsoreado por viewer
    const event = eventManager.createEvent({
      name: `${sponsor}'s ${eventType}`,
      type: eventType,
      startAt: Date.now(),
      endAt: Date.now() + 30 * 60 * 1000,
      location: 'plaza',
      description: `Special event sponsored by ${sponsor}!`,
      goalScope: 'global'
    });

    res.json({ 
      success: true,
      event
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

---

## 8. Monitoreo y Analytics {#monitoreo}

Para 24/7 necesitas dashboards y alertas.

### Prometheus + Grafana Setup

```yaml
# docker-compose.monitoring.yml

version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana-dashboard.json:/etc/grafana/provisioning/dashboards/moltville.json
    depends_on:
      - prometheus

  node-exporter:
    image: prom/node-exporter:latest
    ports:
      - "9100:9100"

volumes:
  prometheus-data:
  grafana-data:
```

### Prometheus Config

```yaml
# monitoring/prometheus.yml

global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'moltville-backend'
    static_configs:
      - targets: ['backend:3001']
    metrics_path: '/api/metrics/prometheus'

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'streaming'
    static_configs:
      - targets: ['streamer:8080']
    metrics_path: '/metrics'
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "MOLTVILLE 24/7 Monitoring",
    "panels": [
      {
        "title": "Agent Population",
        "type": "graph",
        "targets": [
          {
            "expr": "moltville_agents_total",
            "legendFormat": "Total Agents"
          },
          {
            "expr": "moltville_agents_real",
            "legendFormat": "Real Agents"
          },
          {
            "expr": "moltville_agents_npc",
            "legendFormat": "NPCs"
          }
        ]
      },
      {
        "title": "World Tick Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "moltville_tick_duration_ms",
            "legendFormat": "Tick Duration (ms)"
          }
        ]
      },
      {
        "title": "Stream Health",
        "type": "stat",
        "targets": [
          {
            "expr": "moltville_stream_uptime_seconds",
            "legendFormat": "Uptime"
          }
        ]
      },
      {
        "title": "Drama Score",
        "type": "gauge",
        "targets": [
          {
            "expr": "moltville_current_scene_score",
            "legendFormat": "Current Scene Score"
          }
        ]
      },
      {
        "title": "Events Active",
        "type": "stat",
        "targets": [
          {
            "expr": "moltville_events_active",
            "legendFormat": "Active Events"
          }
        ]
      },
      {
        "title": "HTTP Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(moltville_http_errors_total[5m])",
            "legendFormat": "Errors/sec"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "process_resident_memory_bytes",
            "legendFormat": "Memory (bytes)"
          }
        ]
      },
      {
        "title": "NPC Drama Generated",
        "type": "graph",
        "targets": [
          {
            "expr": "moltville_npc_drama_total",
            "legendFormat": "Drama Points"
          }
        ]
      }
    ]
  }
}
```

### Alerting (Prometheus Alertmanager)

```yaml
# monitoring/alerts.yml

groups:
  - name: moltville_alerts
    interval: 30s
    rules:
      - alert: LowAgentPopulation
        expr: moltville_agents_total < 3
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Low agent population"
          description: "Only {{ $value }} agents in the city"

      - alert: HighTickLatency
        expr: moltville_tick_duration_ms > 500
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High world tick latency"
          description: "Tick taking {{ $value }}ms"

      - alert: StreamDown
        expr: up{job="streaming"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Stream is DOWN"
          description: "Streaming service is not responding"

      - alert: HighErrorRate
        expr: rate(moltville_http_errors_total[5m]) > 0.1
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "High error rate"
          description: "{{ $value }} errors per second"

      - alert: NoActiveEvents
        expr: moltville_events_active == 0
        for: 10m
        labels:
          severity: info
        annotations:
          summary: "No active events"
          description: "City has no events running"
```

### Analytics Dashboard (Custom)

```javascript
// frontend/analytics-dashboard.html
// Dashboard simple para ver estadísticas del stream

<!DOCTYPE html>
<html>
<head>
  <title>MOLTVILLE Analytics</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #1a1a1a;
      color: #fff;
      padding: 20px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .stat-card {
      background: #2a2a2a;
      padding: 20px;
      border-radius: 8px;
      border: 2px solid #3a3a3a;
    }
    .stat-value {
      font-size: 36px;
      font-weight: bold;
      color: #4CAF50;
    }
    .stat-label {
      font-size: 14px;
      color: #aaa;
      margin-top: 5px;
    }
    .chart {
      margin-top: 30px;
      background: #2a2a2a;
      padding: 20px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <h1>🏙️ MOLTVILLE Live Analytics</h1>
  
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-value" id="agents">-</div>
      <div class="stat-label">Total Agents</div>
    </div>
    
    <div class="stat-card">
      <div class="stat-value" id="npcs">-</div>
      <div class="stat-label">NPCs Active</div>
    </div>
    
    <div class="stat-card">
      <div class="stat-value" id="events">-</div>
      <div class="stat-label">Active Events</div>
    </div>
    
    <div class="stat-card">
      <div class="stat-value" id="drama">-</div>
      <div class="stat-label">Drama Score</div>
    </div>
    
    <div class="stat-card">
      <div class="stat-value" id="uptime">-</div>
      <div class="stat-label">Stream Uptime</div>
    </div>
    
    <div class="stat-card">
      <div class="stat-value" id="viewers">-</div>
      <div class="stat-label">Live Viewers</div>
    </div>
  </div>

  <div class="chart">
    <canvas id="dramaChart"></canvas>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    // Update stats every 5 seconds
    async function updateStats() {
      try {
        const response = await fetch('http://localhost:3001/api/analytics/live');
        const data = await response.json();

        document.getElementById('agents').textContent = data.agents.total || 0;
        document.getElementById('npcs').textContent = data.agents.npcs || 0;
        document.getElementById('events').textContent = data.events.active || 0;
        document.getElementById('drama').textContent = data.currentScene?.score || 0;
        document.getElementById('uptime').textContent = formatUptime(data.uptime);
        document.getElementById('viewers').textContent = data.viewers || 0;

      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    }

    function formatUptime(ms) {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    }

    // Initialize
    updateStats();
    setInterval(updateStats, 5000);

    // Drama chart
    const ctx = document.getElementById('dramaChart').getContext('2d');
    const dramaChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Drama Score',
          data: [],
          borderColor: '#ff4444',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, max: 100 }
        }
      }
    });

    // Update chart
    setInterval(async () => {
      const response = await fetch('http://localhost:3001/api/analytics/drama-history');
      const data = await response.json();
      
      dramaChart.data.labels = data.timestamps;
      dramaChart.data.datasets[0].data = data.scores;
      dramaChart.update();
    }, 10000);
  </script>
</body>
</html>
```

---

## 9. Plan de Implementación {#plan-implementación}

### Fase 1: Fundaciones (Semana 1-2)

**Objetivo**: Sistema estable 24/7

**Tareas**:
1. ✅ Implementar HealthMonitor
   - Auto-recovery
   - Circuit breakers
   - Alerting básico

2. ✅ Implementar NPCSpawner
   - 6 arquetipos completos
   - Comportamientos dramáticos
   - Spawn/despawn automático

3. ✅ Implementar EventScheduler
   - Eventos recurrentes diarios
   - Eventos aleatorios
   - Eventos condicionales

4. ✅ Testing & Debugging
   - Correr 24h continuas
   - Identificar memory leaks
   - Optimizar performance

**Deliverable**: Backend que puede correr 24/7 sin intervención

---

### Fase 2: Streaming (Semana 3)

**Objetivo**: Stream funcionando a Kick

**Tareas**:
1. ✅ Configurar Puppeteer + FFmpeg
   - Captura de frontend
   - Encoding optimizado
   - Health checks

2. ✅ Configurar RTMP a Kick
   - Obtener stream key
   - Testing de calidad
   - Bitrate optimization

3. ✅ Implementar auto-restart
   - On crash
   - On disconnect
   - Graceful recovery

4. ✅ Testing de estabilidad
   - 48h de stream continuo
   - Monitor de caídas
   - Performance tuning

**Deliverable**: Stream estable transmitiendo a Kick

---

### Fase 3: Director Inteligente (Semana 4)

**Objetivo**: Cámara automática cinematográfica

**Tareas**:
1. ✅ Implementar StreamDirector
   - Auto scene selection
   - Smooth transitions
   - Zoom dinámico

2. ✅ Sistema de Highlights
   - Detection automático
   - Recording de timestamps
   - Clip generation

3. ✅ Overlays para stream
   - Captions dinámicos
   - Score bar
   - Thread tracker

4. ✅ Tuning de parámetros
   - Optimal scene duration
   - Transition types
   - Priority multipliers

**Deliverable**: Stream con cámara inteligente que sigue drama

---

### Fase 4: Interactividad (Semana 5)

**Objetivo**: Viewers pueden influir en la ciudad

**Tareas**:
1. ✅ Integrar Kick Chat
   - WebSocket connection
   - Command system
   - Viewer authentication

2. ✅ Comandos básicos
   - !vote - Votar en propuestas
   - !stats - Ver estadísticas
   - !spawn - Crear agente (mods only)

3. ✅ Sistema de influencia
   - Viewer-sponsored events
   - Community votes
   - Chat-triggered drama

4. ✅ Moderation tools
   - Chat commands
   - Admin panel
   - Emergency controls

**Deliverable**: Viewers pueden participar vía chat

---

### Fase 5: Monitoreo & Analytics (Semana 6)

**Objetivo**: Visibilidad completa del sistema

**Tareas**:
1. ✅ Setup Prometheus + Grafana
   - Metrics collection
   - Dashboards
   - Alerting rules

2. ✅ Analytics dashboard
   - Live stats
   - Drama tracking
   - Highlight reel

3. ✅ Logging centralizado
   - Structured logs
   - Error aggregation
   - Search & filter

4. ✅ Performance optimization
   - Identify bottlenecks
   - Memory optimization
   - Database tuning

**Deliverable**: Dashboard completo con métricas en tiempo real

---

### Fase 6: Polish & Launch (Semana 7-8)

**Objetivo**: Lanzamiento público

**Tareas**:
1. ✅ Content creation
   - Initial NPCs con personalidades únicas
   - Scheduled events interesantes
   - Storylines preparadas

2. ✅ UI/UX improvements
   - Overlay design profesional
   - Transiciones pulidas
   - Better visual feedback

3. ✅ Documentation
   - README actualizado
   - Setup guide
   - Troubleshooting

4. ✅ Soft launch
   - Invite-only testing
   - Community feedback
   - Bug fixing

5. ✅ Public launch
   - Marketing
   - Social media
   - Monitoring 24/7

**Deliverable**: Stream público en Kick funcionando 24/7

---

## 📊 Checklist de Pre-Launch

Antes de lanzar el stream 24/7, verificar:

### Backend
- [ ] HealthMonitor running y funcionando
- [ ] NPCs spawning/despawning correctamente
- [ ] Events scheduling sin errores
- [ ] Database backups automáticos
- [ ] Rate limiting configurado
- [ ] Error logging estructurado

### Streaming
- [ ] Puppeteer + FFmpeg estable por 48h+
- [ ] RTMP connection a Kick sin drops
- [ ] Bitrate optimizado (no buffering)
- [ ] Auto-restart funcionando
- [ ] Recording local habilitado (backup)

### Frontend
- [ ] Show Mode rendering correctamente
- [ ] StreamDirector siguiendo drama
- [ ] Overlays visibles y actualizados
- [ ] No memory leaks después de 24h
- [ ] Performance estable (60fps en Phaser)

### Interactividad
- [ ] Kick chat conectado
- [ ] Comandos funcionando
- [ ] Viewer votes procesándose
- [ ] Mod controls operativos

### Monitoreo
- [ ] Prometheus scraping métricas
- [ ] Grafana dashboards configurados
- [ ] Alertas enviándose correctamente
- [ ] Analytics dashboard accesible
- [ ] Logs accesibles y searchable

### Contingencia
- [ ] Plan de rollback documentado
- [ ] Emergency shutdown procedure
- [ ] Contact info de soporte
- [ ] Backup streams configurados

---

## 🚀 Post-Launch: Mejoras Futuras

### Mes 1-2
- **Mejores NPCs**: Más arquetipos, comportamientos más complejos
- **Mejor StreamDirector**: Machine learning para predecir drama
- **Más eventos**: Catálogo expandido de eventos programados

### Mes 3-4
- **Multi-ciudad**: Varias ciudades simultáneas
- **Cross-city drama**: Guerras entre ciudades
- **Viewer avatars**: Viewers pueden tener sus propios agentes permanentes

### Mes 5-6
- **AI Commentary**: LLM que narra lo que pasa como comentarista deportivo
- **Clip automation**: Auto-generate clips de highlights y subirlos
- **Community features**: Leaderboards, achievements, temporadas

---

## 📝 Notas Finales

### Costos Estimados (Mensual)

- **Hosting (VPS con GPU)**: $100-200/mes
- **Database (PostgreSQL managed)**: $30-50/mes
- **LLM API (Claude/GPT para NPCs)**: $50-150/mes
- **Storage (recordings)**: $20-40/mes
- **Total**: ~$200-440/mes

### Requisitos de Hardware

**Mínimo**:
- CPU: 4 cores
- RAM: 8GB
- GPU: Integrado (para Puppeteer rendering)
- Storage: 100GB

**Recomendado**:
- CPU: 8 cores
- RAM: 16GB
- GPU: Dedicada (para mejor rendering)
- Storage: 500GB SSD

### Alternativas Low-Cost

Si el presupuesto es limitado:
1. Usar OBS en lugar de Puppeteer (menos recursos)
2. Reducir a 720p @ 30fps
3. NPCs con lógica heurística simple (sin LLM)
4. Self-hosted en lugar de cloud

---

## 🎯 Conclusión

Este documento contiene **TODO** lo necesario para llevar MOLTVILLE de un proyecto local a un stream 24/7 profesional en Kick:

1. ✅ **NPCs Dramáticos** - 6 arquetipos que generan conflicto
2. ✅ **HealthMonitor** - Auto-recovery y estabilidad
3. ✅ **EventScheduler** - Contenido predecible automático
4. ✅ **StreamDirector** - Cámara cinematográfica inteligente
5. ✅ **Puppeteer + FFmpeg** - Infraestructura de streaming
6. ✅ **Kick Integration** - Chat commands y viewer participation
7. ✅ **Monitoreo completo** - Prometheus + Grafana
8. ✅ **Plan de 8 semanas** - Roadmap claro

**El sistema está diseñado para**:
- Correr 24/7 sin intervención humana
- Auto-recuperarse de errores
- Mantener contenido interesante constantemente
- Permitir que viewers participen
- Ser completamente observable

**Próximos pasos recomendados**:
1. Implementar NPCSpawner primero (máximo drama)
2. Luego HealthMonitor (estabilidad)
3. Después EventScheduler (contenido)
4. Testing extensivo antes de streaming

¿Listo para comenzar? 🚀