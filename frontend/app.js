// ============================================================
// MOLTVILLE - WORLD DATA
// ============================================================
const TILE = 32;
const WORLD_W = 64;
const WORLD_H = 64;
const ISO_W = TILE;
const ISO_H = TILE / 2;

// Tile types
const T = { GRASS:0, ROAD:1, WATER:2, SAND:3, STONE:4, DIRT:5, PATH:6, FLOWER:7 };

// Building definitions - richer and more varied
let BUILDINGS = [
  // ── Cafés & Social ──
  { id:'cafe1', name:'Hobbs Café', type:'cafe', x:14, y:8,  w:5, h:4, color:'#c0392b', roof:'#e74c3c', accent:'#f39c12', stories:1 },
  { id:'cafe2', name:'Corner Bistro', type:'cafe', x:42, y:18, w:4, h:3, color:'#8e6b3e', roof:'#a67c52', accent:'#e67e22', stories:1 },

  // ── Library & Culture ──
  { id:'library', name:'City Library', type:'library', x:24, y:6,  w:6, h:5, color:'#5b4a8a', roof:'#7d6ba0', accent:'#9b8ec4', stories:2 },
  { id:'gallery', name:'Art Gallery', type:'gallery', x:50, y:8,  w:4, h:4, color:'#6c5b73', roof:'#8a7490', accent:'#d4a84b', stories:2 },

  // ── Shops & Commerce ──
  { id:'shop1', name:'General Store', type:'shop', x:30, y:14, w:4, h:3, color:'#2980b9', roof:'#3498db', accent:'#f1c40f', stories:1 },
  { id:'shop2', name:'Bookshop', type:'shop', x:8,  y:22, w:3, h:3, color:'#27ae60', roof:'#2ecc71', accent:'#e74c3c', stories:1 },
  { id:'market', name:'Market Square', type:'market', x:36, y:28, w:6, h:5, color:'#16a085', roof:'#1abc9c', accent:'#f39c12', stories:1 },

  // ── Residences (varied) ──
  { id:'house1', name:'Maple House', type:'house', x:6,  y:6,  w:3, h:2, color:'#e67e22', roof:'#d35400', accent:'#f39c12', stories:1 },
  { id:'house2', name:'Oak Cottage', type:'house', x:10, y:14, w:2, h:2, color:'#9b59b6', roof:'#8e44ad', accent:'#f39c12', stories:1 },
  { id:'house3', name:'Pine Villa', type:'house', x:4,  y:28, w:3, h:3, color:'#3498db', roof:'#2980b9', accent:'#ecf0f1', stories:1 },
  { id:'house4', name:'Cedar Home', type:'house', x:48, y:24, w:3, h:2, color:'#e74c3c', roof:'#c0392b', accent:'#f1c40f', stories:1 },
  { id:'house5', name:'Birch Flat', type:'house', x:54, y:32, w:2, h:3, color:'#1abc9c', roof:'#16a085', accent:'#e67e22', stories:1 },
  { id:'house6', name:'Elm Residence', type:'house', x:18, y:36, w:3, h:2, color:'#e67e22', roof:'#d35400', accent:'#ecf0f1', stories:1 },

  // ── Tall Buildings (city feel) ──
  { id:'tower1', name:'City Hall', type:'civic', x:28, y:22, w:4, h:4, color:'#34495e', roof:'#2c3e50', accent:'#3498db', stories:3 },
  { id:'tower2', name:'Bell Tower', type:'tower', x:20, y:24, w:3, h:3, color:'#95a5a6', roof:'#7f8c8d', accent:'#f39c12', stories:4 },
  { id:'apts', name:'Sunrise Apartments', type:'apartment', x:44, y:34, w:5, h:4, color:'#2c3e50', roof:'#34495e', accent:'#3498db', stories:3 },

  // ── Parks & Public ──
  { id:'fountain', name:'Central Plaza', type:'plaza', x:16, y:18, w:6, h:6, color:'#95a5a6', roof:'#bdc3c7', accent:'#3498db', stories:0 },
  { id:'park2', name:'Sunset Garden', type:'garden', x:40, y:42, w:7, h:6, color:'#27ae60', roof:'#2ecc71', accent:'#f39c12', stories:0 },

  // ── Special ──
  { id:'inn', name:'Travelers Inn', type:'inn', x:52, y:42, w:4, h:3, color:'#a04000', roof:'#c0392b', accent:'#f39c12', stories:2 },
  { id:'church', name:'Chapel', type:'chapel', x:8,  y:42, w:3, h:4, color:'#ecf0f1', roof:'#bdc3c7', accent:'#f39c12', stories:2 },
];

let LOTS = [];
let WORLD_INTERVAL_ID = null;

const API_BASE = window.location.hostname
  ? `http://${window.location.hostname}:3001`
  : 'http://localhost:3001';

const WORLD_CONTEXT = {
  worldTime: null,
  weather: null,
  vote: null,
  voteCatalog: [],
  voteCatalogLoaded: false,
  voteHistory: [],
  governance: null,
  socialNetwork: null,
  mood: null,
  districts: null,
  agentCount: 0,
  aestheticsVote: null,
  aestheticsHistory: [],
  aestheticsMeta: null,
  districtThemeHash: '',
  lastRefreshSuccessAt: null,
  refreshFailureCount: 0,
  lastErrorMessage: '',
  lastFailedSection: '',
  lastRefreshDurationMs: null,
  lastModalAutoOpenAt: null,
  useLiveData: false,
  activeConversations: [],
  telemetryFeed: [],
  economy: {
    jobs: [],
    balance: null,
    properties: []
  }
};
const AGENT_DIRECTORY = new Map();
const LIVE_AGENT_COLORS = new Map();
let viewerSocket = null;
const REFRESH_PERSIST_MS = 15000;
const REFRESH_MODAL_AUTO_OPEN_MS = 60000;
const REFRESH_MODAL_FAILURE_THRESHOLD = 3;
const STORAGE_KEYS = {
  agentId: 'moltville_agent_id',
  uiState: 'moltville_ui_state',
  viewerKey: 'moltville_viewer_key'
};
const DEFAULT_UI_STATE = {
  voteActionsOpen: false,
  voteProposalOpen: false,
  voteProposalMode: 'catalog',
  governanceActionsOpen: false,
  governanceMode: 'vote',
  economyActionsOpen: false,
  economyMode: 'jobs',
  aestheticsActionsOpen: false,
  showModeActive: true,
  showAllLabels: false
};
const SHOW_MODE_DEFAULTS = {
  minSceneDurationMs: 10000,
  decayWindowMs: 30000,
  switchThreshold: 15,
  queueLimit: 3,
  threadsLimit: 6,
  predictionsEnabled: true,
  arcsEnabled: true,
  statsEnabled: true,
  heatmapEnabled: true,
  relationshipAffinityDelta: 10,
  relationshipConflictDelta: 8,
  relationshipAffinityScore: 18,
  relationshipConflictScore: 22,
  affinityMultiplier: 1.4,
  conflictMultiplier: 1.5,
  climaxMultiplier: 1.8,
  noveltyBonus: 12,
  witnessRadius: 6,
  witnessScorePer: 3,
  witnessScoreMax: 20,
  keywordMultiplier: 1.3,
  politicaBonus: 18,
  negocioBonus: 10,
  predictionsLimit: 4,
  heatmapRetentionMinutes: 5
};
const SHOW_MODE_SETTINGS = { ...SHOW_MODE_DEFAULTS };
const SHOW_MODE_STATE = {
  active: false,
  currentScene: null,
  scenes: [],
  threads: new Map(),
  queue: [],
  relationshipCache: new Map(),
  predictions: [],
  heatmapPoints: [],
  metrics: {
    totalShowScore: 0,
    peakMoments: [],
    narrativeArcsCompleted: 0,
    eventDistribution: {
      romance: 0,
      conflicto: 0,
      politica: 0,
      negocio: 0,
      interaccion: 0
    }
  }
};
const SHOW_MODE_LAST_CONV_TS = new Map();
let liveAgentPositions = {};

function getAgentColor(agentId) {
  if (LIVE_AGENT_COLORS.has(agentId)) {
    return LIVE_AGENT_COLORS.get(agentId);
  }
  let hash = 0;
  for (let i = 0; i < agentId.length; i += 1) {
    hash = (hash * 31 + agentId.charCodeAt(i)) % 997;
  }
  const color = AGENT_COLORS[hash % AGENT_COLORS.length];
  LIVE_AGENT_COLORS.set(agentId, color);
  return color;
}

function syncLiveAgents(scene, agentsPayload) {
  if (!scene || !agentsPayload) return;
  const existing = new Map(scene.agents.map(agent => [agent.id, agent]));
  const nextAgents = [];
  Object.entries(agentsPayload).forEach(([id, payload]) => {
    const existingAgent = existing.get(id);
    const directoryProfile = AGENT_DIRECTORY.get(id) || {};
    const name = directoryProfile?.name || `Agent ${id.slice(0, 4)}`;
    const agent = existingAgent || {
      id,
      name,
      color: getAgentColor(id),
      x: payload.x,
      y: payload.y,
      tx: payload.x,
      ty: payload.y,
      facing: payload.facing || 'down',
      progress: 1,
      walkCycle: 0,
      state: payload.state || 'idle',
      talkTimer: 0,
      idleTimer: 0
    };
    agent.name = name;
    agent.facing = payload.facing || agent.facing;
    agent.state = payload.state || agent.state;
    agent.progress = 1;
    agent.x = payload.x;
    agent.y = payload.y;
    agent.tx = payload.x;
    agent.ty = payload.y;
    agent.currentBuilding = payload.currentBuilding || null;

    // Merge richer profile data for agent panel.
    agent.isNPC = Boolean(directoryProfile.isNPC);
    agent.profile = directoryProfile.profile || null;
    agent.traits = directoryProfile.traits || null;
    agent.motivation = directoryProfile.motivation || null;
    agent.plan = directoryProfile.plan || null;
    agent.reputation = directoryProfile.reputation || null;
    agent.favors = directoryProfile.favors || null;
    agent.cognition = directoryProfile.cognition || null;
    const relCount = directoryProfile.relationshipCount
      ?? (directoryProfile.relationships && typeof directoryProfile.relationships === 'object'
        ? Object.keys(directoryProfile.relationships).length
        : 0);
    agent.relationshipCount = relCount;

    nextAgents.push(agent);
  });
  scene.agents = nextAgents;
}

function handleWorldState(scene, state) {
  if (!state) return;
  WORLD_CONTEXT.useLiveData = true;
  WORLD_CONTEXT.worldTime = state.worldTime || null;
  WORLD_CONTEXT.weather = state.weather || null;
  WORLD_CONTEXT.mood = state.mood || null;
  WORLD_CONTEXT.districts = state.districts || null;
  WORLD_CONTEXT.activeConversations = state.conversations || WORLD_CONTEXT.activeConversations || [];
  WORLD_CONTEXT.events = state.events || WORLD_CONTEXT.events || [];
  WORLD_CONTEXT.agentCount = state.agents ? Object.keys(state.agents).length : 0;
  liveAgentPositions = state.agents || {};
  const themeHash = (state.districts || []).map(d => `${d.id}:${d.theme || 'classic'}`).join('|');
  if (scene && themeHash !== WORLD_CONTEXT.districtThemeHash) {
    WORLD_CONTEXT.districtThemeHash = themeHash;
    scene.drawTiles();
  }
  LOTS = state.lots || [];
  const newBuildings = mergeBuildingVisuals(state.buildings || []);
  if (scene && newBuildings.length) {
    scene.renderNewBuildings(newBuildings);
  }
  if (scene && scene.drawLots) {
    scene.drawLots();
  }
  syncLiveAgents(scene, liveAgentPositions);
}

function handleWorldTick(scene, payload) {
  if (!payload) return;
  WORLD_CONTEXT.useLiveData = true;
  WORLD_CONTEXT.worldTime = payload.worldTime || WORLD_CONTEXT.worldTime;
  WORLD_CONTEXT.weather = payload.weather || WORLD_CONTEXT.weather;
  WORLD_CONTEXT.vote = payload.vote || WORLD_CONTEXT.vote;
  WORLD_CONTEXT.governance = payload.governance || WORLD_CONTEXT.governance;
  WORLD_CONTEXT.mood = payload.mood || WORLD_CONTEXT.mood;
  WORLD_CONTEXT.aestheticsVote = payload.aesthetics || WORLD_CONTEXT.aestheticsVote;
  WORLD_CONTEXT.activeConversations = payload.conversations || [];
  WORLD_CONTEXT.events = payload.events || WORLD_CONTEXT.events || [];
  liveAgentPositions = payload.agents || liveAgentPositions;
  WORLD_CONTEXT.agentCount = liveAgentPositions ? Object.keys(liveAgentPositions).length : WORLD_CONTEXT.agentCount;
  syncLiveAgents(scene, liveAgentPositions);
}

function setupViewerSocket(scene) {
  if (!window.io) return;
  if (viewerSocket) return;
  viewerSocket = window.io(API_BASE, { transports: ['websocket'] });
  viewerSocket.on('connect', () => {
    const viewerKey = getViewerKey();
    viewerSocket.emit('viewer:join', viewerKey ? { apiKey: viewerKey } : {});
  });
  viewerSocket.on('agents:list', (agents) => {
    (agents || []).forEach(agent => {
      AGENT_DIRECTORY.set(agent.id, agent);
    });
  });
  viewerSocket.on('world:state', (state) => handleWorldState(scene, state));
  viewerSocket.on('world:tick', (tick) => handleWorldTick(scene, tick));
  viewerSocket.on('agent:spoke', (payload) => {
    const agentName = payload?.agentName || 'Agente';
    const message = payload?.message || '';
    pushFeedMessage(agentName, message);
    updateAgentSpeech(payload.agentId || agentName, message);
    registerShowBeat({
      participants: [agentName],
      summary: message,
      dialogue: message
    });
  });
  viewerSocket.on('telemetry:action', (entry) => {
    if (!entry) return;
    WORLD_CONTEXT.telemetryFeed = [...(WORLD_CONTEXT.telemetryFeed || []), entry].slice(-6);
  });
  viewerSocket.on('conversation:started', (payload) => {
    if (!payload) return;
    const from = payload.fromName || 'Agente';
    const to = payload.toName || 'Agente';
    const message = payload.message || '';
    pushFeedMessage('Conversación', `💬 ${from} → ${to}: ${message}`);
    updateAgentSpeech(payload.fromId || from, message);
    registerShowBeat({
      participants: [from, to],
      summary: `${from} inició conversación con ${to}`,
      dialogue: message
    });
  });
  viewerSocket.on('conversation:message', (payload) => {
    const message = payload?.message;
    if (!message) return;
    const from = message.fromName || 'Agente';
    const to = message.toName || 'Agente';
    pushFeedMessage('Conversación', `💬 ${from} → ${to}: ${message.message}`);
    updateAgentSpeech(message.from || from, message.message);
    registerShowBeat({
      participants: [from, to],
      summary: message.message,
      dialogue: message.message
    });
  });
  viewerSocket.on('conversation:ended', (payload) => {
    if (!payload) return;
    pushFeedMessage('Conversación', `✅ Conversación ${payload.conversationId} finalizada.`);
    registerShowBeat({
      participants: [payload?.fromName, payload?.toName].filter(Boolean),
      summary: 'La conversación terminó.'
    });
  });
  viewerSocket.on('agent:social', (payload) => {
    if (!payload) return;
    const from = payload.from || 'Agente';
    const to = payload.to || 'Agente';
    pushFeedMessage('Social', `🤝 ${from} interactuó con ${to} (${payload.actionType}).`);
    registerShowBeat({
      participants: [from, to],
      summary: `${from} interactuó con ${to} (${payload.actionType}).`
    });
  });
  viewerSocket.on('agent:action', (payload) => {
    if (!payload) return;
    pushFeedMessage('Acción', `⚙️ ${payload.agentId} ejecutó ${payload.actionType}.`);
    registerShowBeat({
      participants: [payload.agentId || 'Agente'],
      summary: `${payload.agentId || 'Agente'} ejecutó ${payload.actionType}.`
    });
  });
  viewerSocket.on('agent:spawned', (payload) => {
    if (!payload) return;
    pushFeedMessage('Sistema', `👋 ${payload.name || 'Un agente'} llegó a Moltville.`);
    registerShowBeat({
      type: 'interaccion',
      participants: [payload.name || 'Agente'],
      summary: `${payload.name || 'Un agente'} llegó a Moltville.`
    });
  });
  viewerSocket.on('agent:disconnected', (payload) => {
    if (!payload) return;
    pushFeedMessage('Sistema', `👋 ${payload.agentName || 'Un agente'} se desconectó.`);
  });
  viewerSocket.on('vote:started', (payload) => {
    if (!payload) return;
    pushFeedMessage('Democracia', `🗳️ Nueva votación: ${payload.options?.length || 0} opciones disponibles.`);
  });
  viewerSocket.on('vote:closed', (payload) => {
    if (!payload) return;
    const winner = payload.winner?.name || payload.winner?.type || 'Edificio';
    pushFeedMessage('Democracia', `🏗️ Construcción aprobada: ${winner}.`);
  });
  viewerSocket.on('building:constructed', (payload) => {
    if (!payload) return;
    pushFeedMessage('Ciudad', `🏙️ Nuevo edificio: ${payload.name}.`);
  });
  viewerSocket.on('president:election_started', () => {
    pushFeedMessage('Gobierno', '🗳️ Se abrió una elección presidencial.');
  });
  viewerSocket.on('president:election_closed', (payload) => {
    const winner = payload?.winner?.name || 'Sin presidente';
    pushFeedMessage('Gobierno', `👑 Resultado electoral: ${winner}.`);
  });
  viewerSocket.on('governance:policy_added', (payload) => {
    if (!payload) return;
    pushFeedMessage('Gobierno', `📜 Política activa: ${payload.type}.`);
  });
  viewerSocket.on('governance:policy_expired', (payload) => {
    if (!payload) return;
    pushFeedMessage('Gobierno', `⌛ Política expirada: ${payload.type}.`);
  });
  viewerSocket.on('aesthetics:vote_started', (payload) => {
    if (!payload) return;
    pushFeedMessage('Estética', `🎨 Votación de distrito: ${payload.districtName}.`);
  });
  viewerSocket.on('aesthetics:vote_closed', (payload) => {
    if (!payload) return;
    const winner = payload.winner?.name || 'Sin cambios';
    pushFeedMessage('Estética', `🎨 Votación cerrada: ${winner}.`);
  });
  viewerSocket.on('aesthetics:theme_applied', (payload) => {
    if (!payload) return;
    pushFeedMessage('Estética', `🎨 Tema aplicado en distrito ${payload.districtId}.`);
  });
  viewerSocket.on('event:started', (payload) => {
    if (!payload) return;
    pushFeedMessage('Eventos', `🎉 Evento activo: ${payload.name}.`);
  });
  viewerSocket.on('event:ended', (payload) => {
    if (!payload) return;
    pushFeedMessage('Eventos', `🎉 Evento finalizado: ${payload.name}.`);
  });
  viewerSocket.on('connect_error', () => {
    WORLD_CONTEXT.useLiveData = false;
    showStatusBanner('No se pudo conectar al viewer en vivo. Usando refresco.', true);
  });
  viewerSocket.on('disconnect', () => {
    WORLD_CONTEXT.useLiveData = false;
  });
}

function getStoredAgentId() {
  return localStorage.getItem(STORAGE_KEYS.agentId) || '';
}

function getViewerKey() {
  if (window.MOLTVILLE_VIEWER_KEY) return window.MOLTVILLE_VIEWER_KEY;
  return localStorage.getItem(STORAGE_KEYS.viewerKey) || '';
}

function getViewerHeaders() {
  const viewerKey = getViewerKey();
  if (!viewerKey) return {};
  return { 'x-viewer-key': viewerKey };
}

function fetchWithViewerKey(url, options = {}) {
  const headers = {
    ...getViewerHeaders(),
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}

function storeAgentId(agentId) {
  if (agentId) {
    localStorage.setItem(STORAGE_KEYS.agentId, agentId);
  }
}

function pushFeedMessage(name, message) {
  const scene = window._moltvilleScene;
  if (!scene || typeof scene.addChatMessage !== 'function') return;
  const safeMessage = message || '...';
  scene.addChatMessage(name, safeMessage);
}

function updateAgentSpeech(idOrName, message) {
  const scene = window._moltvilleScene;
  if (!scene || !scene.agents) return;
  const agent = scene.agents.find(a => a.id === idOrName || a.name === idOrName);
  if (agent) {
    agent.talkTimer = 6;
    agent.lastSpeech = message;
    if (agent._speechText) {
      agent._speechText.setText(message);
    }
  }
}

function setupShowModeControls() {
  const elements = getShowModeElements();
  if (!elements.toggle) return;
  const initialState = getUiState().showModeActive;
  setShowModeActive(initialState);
  elements.toggle.addEventListener('click', () => {
    setShowModeActive(!SHOW_MODE_STATE.active);
  });
  updateShowModeUI();
  window.setInterval(() => {
    if (SHOW_MODE_STATE.active) {
      decayThreads();
      updateShowModeUI();
    }
  }, 1000);
}

function getShowModeElements() {
  return {
    container: document.getElementById('show-mode-container'),
    toggle: document.getElementById('show-mode-toggle'),
    indicator: document.getElementById('show-indicator'),
    indicatorScore: document.getElementById('show-indicator-score'),
    indicatorFill: document.getElementById('show-indicator-fill'),
    tracker: document.querySelector('.show-mode-tracker'),
    sceneType: document.getElementById('show-mode-scene-type'),
    score: document.getElementById('show-mode-score'),
    title: document.getElementById('show-mode-scene-title'),
    meta: document.getElementById('show-mode-meta'),
    progressFill: document.getElementById('show-mode-progress-fill'),
    time: document.getElementById('show-mode-time'),
    threadList: document.getElementById('show-mode-thread-list'),
    queue: document.getElementById('show-mode-queue'),
    predictions: document.getElementById('show-mode-predictions'),
    arcs: document.getElementById('show-mode-arcs'),
    stats: document.getElementById('show-mode-stats'),
    heatmap: document.getElementById('show-mode-heatmap'),
    caption: document.getElementById('show-mode-caption'),
    captionSpeaker: document.getElementById('show-mode-caption-speaker'),
    captionText: document.getElementById('show-mode-caption-text')
  };
}

function getAgentUiElements() {
  return {
    labelsToggle: document.getElementById('labels-toggle'),
    profile: document.getElementById('agent-profile'),
    profileName: document.getElementById('agent-profile-name'),
    profileRole: document.getElementById('agent-profile-role'),
    profileState: document.getElementById('agent-profile-state'),
    profileLocation: document.getElementById('agent-profile-location'),
    profileJob: document.getElementById('agent-profile-job'),
    profileRelations: document.getElementById('agent-profile-relations'),
    profileMotivation: document.getElementById('agent-profile-motivation'),
    profilePlan: document.getElementById('agent-profile-plan'),
    profileReputation: document.getElementById('agent-profile-reputation'),
    profileFavors: document.getElementById('agent-profile-favors'),
    profileSpeech: document.getElementById('agent-profile-speech'),
    profileThoughtInternal: document.getElementById('agent-profile-thought-internal'),
    profileThoughtExternal: document.getElementById('agent-profile-thought-external'),
    profileClose: document.getElementById('agent-profile-close'),
    eventPanel: document.getElementById('event-panel'),
    eventPanelClose: document.getElementById('event-panel-close'),
    eventPanelName: document.getElementById('event-panel-name'),
    eventPanelHost: document.getElementById('event-panel-host'),
    eventPanelLocation: document.getElementById('event-panel-location'),
    eventPanelParticipants: document.getElementById('event-panel-participants'),
    eventPanelDescription: document.getElementById('event-panel-description')
  };
}

function setupAgentUiControls(scene) {
  const elements = getAgentUiElements();
  const uiState = getUiState();
  if (elements.labelsToggle) {
    elements.labelsToggle.classList.toggle('is-active', uiState.showAllLabels);
    elements.labelsToggle.addEventListener('click', () => {
      const next = !getUiState().showAllLabels;
      setUiState({ showAllLabels: next });
      elements.labelsToggle.classList.toggle('is-active', next);
      if (scene) scene.showAllLabels = next;
    });
  }
  if (elements.profileClose) {
    elements.profileClose.addEventListener('click', closeAgentProfile);
  }
  if (elements.eventPanelClose) {
    elements.eventPanelClose.addEventListener('click', closeEventPanel);
  }
  if (elements.profile) {
    const header = elements.profile.querySelector('.agent-profile-header');
    makePanelDraggable(elements.profile, header);
  }
  const eventDisplay = document.getElementById('event-display');
  if (eventDisplay) {
    eventDisplay.addEventListener('click', () => {
      openEventPanel();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAgentProfile();
      closeEventPanel();
    }
  });
}

function resolveAgentLocationLabel(agent) {
  if (!agent) return '-';
  const building = BUILDINGS.find(b => agent.x >= b.x && agent.x < b.x + b.w && agent.y >= b.y && agent.y < b.y + b.h);
  return building ? building.name : `(${agent.x}, ${agent.y})`;
}

function prettifyAgentText(value) {
  if (value == null) return '-';
  const str = String(value).trim();
  if (!str) return '-';

  const clean = str
    .replace(/^['"“”]+|['"“”]+$/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lookup = clean.toLowerCase();
  const friendlyMap = {
    'buy house': 'Comprar una casa propia 🏠',
    'start business': 'Iniciar un negocio 💼',
    'get job': 'Conseguir trabajo',
    'find job': 'Conseguir trabajo',
    'socialize': 'Socializar',
    'earn money': 'Ganar dinero'
  };

  if (friendlyMap[lookup]) {
    return friendlyMap[lookup];
  }

  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function makePanelDraggable(panel, handle) {
  if (!panel || !handle) return;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const onMouseMove = (event) => {
    if (!dragging) return;
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
    const nextLeft = Math.min(maxLeft, Math.max(0, event.clientX - offsetX));
    const nextTop = Math.min(maxTop, Math.max(0, event.clientY - offsetY));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
    panel.style.right = 'auto';
  };

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('is-dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopDrag);
  };

  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const targetTag = event.target?.tagName?.toLowerCase();
    if (targetTag === 'button') return;
    const rect = panel.getBoundingClientRect();
    dragging = true;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    panel.classList.add('is-dragging');
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = 'auto';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopDrag);
    event.preventDefault();
  });
}

function updateAgentProfilePanel(agent) {
  const elements = getAgentUiElements();
  if (!elements.profile || !agent) return;
  elements.profileName.textContent = agent.name || 'Agente';
  elements.profileRole.textContent = agent.isNPC ? 'NPC' : 'Ciudadano';
  elements.profileState.textContent = agent.state || '-';
  elements.profileLocation.textContent = resolveAgentLocationLabel(agent);
  elements.profileJob.textContent = agent.job?.name || '-';
  const relations = agent.relationships?.length ?? agent.relationshipCount ?? 0;
  elements.profileRelations.textContent = relations.toString();
  if (elements.profileMotivation) {
    const desire = agent.motivation?.desire ? prettifyAgentText(agent.motivation.desire) : '-';
    elements.profileMotivation.textContent = desire;
  }
  if (elements.profilePlan) {
    const plan = prettifyAgentText(agent.plan?.primaryGoal || '-');
    elements.profilePlan.textContent = plan;
  }
  if (elements.profileReputation) {
    const rep = agent.reputation?.global;
    elements.profileReputation.textContent = typeof rep === 'number' ? rep.toFixed(1) : '-';
  }
  if (elements.profileFavors) {
    const favors = agent.favors;
    if (favors) {
      elements.profileFavors.textContent = `+${favors.owed || 0} / -${favors.owing || 0}`;
    } else {
      elements.profileFavors.textContent = '-';
    }
  }
  elements.profileSpeech.textContent = agent.lastSpeech || agent.cognition?.externalSpeech || 'Sin diálogo reciente';
  if (elements.profileThoughtInternal) {
    elements.profileThoughtInternal.textContent = prettifyAgentText(agent.cognition?.internalThought || '-');
  }
  if (elements.profileThoughtExternal) {
    elements.profileThoughtExternal.textContent = prettifyAgentText(agent.cognition?.externalIntent || '-');
  }
}

function openAgentProfile(agent, scene) {
  const elements = getAgentUiElements();
  if (!elements.profile || !agent) return;
  updateAgentProfilePanel(agent);
  elements.profile.classList.add('is-open');
  if (scene) scene.selectedAgentId = agent.id;
}

function closeAgentProfile() {
  const elements = getAgentUiElements();
  if (!elements.profile) return;
  elements.profile.classList.remove('is-open');
  const scene = window._moltvilleScene;
  if (scene) scene.selectedAgentId = null;
}

function openEventPanel() {
  const elements = getAgentUiElements();
  if (!elements.eventPanel) return;
  const activeEvent = (WORLD_CONTEXT.events || []).find(e => e.status === 'active');
  if (!activeEvent) return;
  const hostId = activeEvent.hostId || '-';
  const hostName = AGENT_DIRECTORY.get(hostId)?.name || hostId || '-';
  const location = activeEvent.location?.name || activeEvent.location?.id || '-';
  elements.eventPanelName.textContent = activeEvent.name || '-';
  elements.eventPanelHost.textContent = hostName;
  elements.eventPanelLocation.textContent = location;
  const count = activeEvent.participantsCount ?? (activeEvent.participants ? activeEvent.participants.length : 0);
  elements.eventPanelParticipants.textContent = String(count || 0);
  elements.eventPanelDescription.textContent = activeEvent.description || '-';
  elements.eventPanel.classList.add('is-open');
}

function closeEventPanel() {
  const elements = getAgentUiElements();
  if (!elements.eventPanel) return;
  elements.eventPanel.classList.remove('is-open');
}

function setShowModeActive(nextActive) {
  SHOW_MODE_STATE.active = nextActive;
  document.body.classList.toggle('show-mode-active', nextActive);
  const elements = getShowModeElements();
  if (elements.container) {
    elements.container.classList.toggle('is-active', nextActive);
  }
  if (elements.toggle) {
    elements.toggle.classList.toggle('is-active', nextActive);
  }
  setUiState({ showModeActive: nextActive });
}

function classifySceneType(message = '') {
  const lower = message.toLowerCase();
  if (lower.match(/beso|amor|romant|confes|cita/)) return 'romance';
  if (lower.match(/pelea|discusi|grito|traici|odio|rival/)) return 'conflicto';
  if (lower.match(/voto|elecci|president|pol[ií]tic/)) return 'politica';
  if (lower.match(/negocio|dinero|econom/i)) return 'negocio';
  return 'interaccion';
}

function computeShowScore(type, message = '') {
  const baseScores = {
    romance: 60,
    conflicto: 65,
    politica: 45,
    negocio: 35,
    interaccion: 30
  };
  let score = baseScores[type] || 30;
  const boosts = [
    { match: /beso|amor|confes/i, value: 15 },
    { match: /traici|escandal|shock|plot/i, value: 20 },
    { match: /pelea|amenaz|grit/i, value: 12 },
    { match: /alianza|promesa|pacto/i, value: 8 }
  ];
  boosts.forEach((boost) => {
    if (boost.match.test(message.toLowerCase())) {
      score += boost.value;
    }
  });
  return Math.max(0, Math.min(100, score));
}

function applyShowModeConfig(nextConfig = {}) {
  Object.entries(SHOW_MODE_DEFAULTS).forEach(([key, value]) => {
    if (Object.prototype.hasOwnProperty.call(nextConfig, key)) {
      const nextValue = nextConfig[key];
      if (typeof value === 'number') {
        SHOW_MODE_SETTINGS[key] = Number(nextValue);
      } else if (typeof value === 'boolean') {
        if (typeof nextValue === 'string') {
          SHOW_MODE_SETTINGS[key] = nextValue === 'true';
        } else {
          SHOW_MODE_SETTINGS[key] = Boolean(nextValue);
        }
      } else {
        SHOW_MODE_SETTINGS[key] = nextValue;
      }
    } else {
      SHOW_MODE_SETTINGS[key] = value;
    }
  });
}

async function loadShowModeConfig() {
  try {
    const response = await fetchWithViewerKey(`${API_BASE}/api/show/config`);
    if (!response.ok) return;
    const payload = await response.json();
    if (payload?.config) {
      applyShowModeConfig(payload.config);
    }
  } catch (error) {
    console.warn('Failed to load show mode config', error);
  }
}

function normalizeLabel(value = '') {
  return String(value || '').trim().toLowerCase();
}

function resolveParticipantIds(participants = []) {
  return participants
    .map((participant) => {
      if (!participant) return null;
      const normalized = normalizeLabel(participant);
      for (const agent of AGENT_DIRECTORY.values()) {
        if (normalizeLabel(agent.id) === normalized || normalizeLabel(agent.name) === normalized) {
          return agent.id;
        }
      }
      return participant;
    })
    .filter(Boolean);
}

function buildPairKey(a, b) {
  return [a, b].sort().join('|');
}

function getRelationshipSnapshot(participants = []) {
  const network = WORLD_CONTEXT.socialNetwork;
  if (!network?.edges || !participants.length) return null;
  const ids = resolveParticipantIds(participants);
  if (ids.length < 2) return null;
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      pairs.push([ids[i], ids[j]]);
    }
  }
  const snapshots = pairs.map(([fromId, toId]) => {
    const edge = network.edges.find(item =>
      (normalizeLabel(item.from) === normalizeLabel(fromId) && normalizeLabel(item.to) === normalizeLabel(toId)) ||
      (normalizeLabel(item.from) === normalizeLabel(toId) && normalizeLabel(item.to) === normalizeLabel(fromId))
    );
    if (!edge) return null;
    const affinity = Number(edge.affinity ?? 0);
    const trust = Number(edge.trust ?? 0);
    const conflict = Number(edge.conflict ?? Math.max(0, 100 - trust));
    return { pair: buildPairKey(fromId, toId), affinity, trust, conflict };
  }).filter(Boolean);
  if (!snapshots.length) return null;
  const totals = snapshots.reduce((acc, item) => {
    acc.affinity += item.affinity;
    acc.trust += item.trust;
    acc.conflict += item.conflict;
    return acc;
  }, { affinity: 0, trust: 0, conflict: 0 });
  return {
    pairs: snapshots,
    affinity: totals.affinity / snapshots.length,
    trust: totals.trust / snapshots.length,
    conflict: totals.conflict / snapshots.length
  };
}

function getRelationshipDelta(snapshot) {
  if (!snapshot) return null;
  let deltaAffinity = 0;
  let deltaTrust = 0;
  let deltaConflict = 0;
  snapshot.pairs.forEach((pair) => {
    const cached = SHOW_MODE_STATE.relationshipCache.get(pair.pair);
    if (cached) {
      deltaAffinity += pair.affinity - cached.affinity;
      deltaTrust += pair.trust - cached.trust;
      deltaConflict += pair.conflict - cached.conflict;
    }
    SHOW_MODE_STATE.relationshipCache.set(pair.pair, {
      affinity: pair.affinity,
      trust: pair.trust,
      conflict: pair.conflict
    });
  });
  return {
    affinity: deltaAffinity,
    trust: deltaTrust,
    conflict: deltaConflict
  };
}

function getSceneLocation(participants = []) {
  const ids = resolveParticipantIds(participants);
  const positions = ids.map(id => liveAgentPositions?.[id]).filter(Boolean);
  if (!positions.length) return null;
  const total = positions.reduce((acc, pos) => {
    acc.x += pos.x || 0;
    acc.y += pos.y || 0;
    return acc;
  }, { x: 0, y: 0 });
  return {
    x: total.x / positions.length,
    y: total.y / positions.length
  };
}

function getNearbyWitnesses(location, participants = []) {
  if (!location || !liveAgentPositions) return 0;
  const ids = new Set(resolveParticipantIds(participants));
  return Object.entries(liveAgentPositions).reduce((count, [id, pos]) => {
    if (ids.has(id)) return count;
    const dx = (pos.x || 0) - location.x;
    const dy = (pos.y || 0) - location.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= SHOW_MODE_SETTINGS.witnessRadius) {
      return count + 1;
    }
    return count;
  }, 0);
}

function isNovelInteraction(thread, sceneType) {
  if (!thread) return true;
  const recentTypes = thread.beats.slice(-4).map(beat => beat.type);
  return !recentTypes.includes(sceneType);
}

function computeAdvancedShowScore(scene, thread, relationshipSnapshot = null) {
  const baseType = scene.type || classifySceneType(scene.summary || '');
  const baseScore = computeShowScore(baseType, scene.summary || '');
  let score = baseScore;
  const multipliers = [];

  const resolvedSnapshot = relationshipSnapshot || getRelationshipSnapshot(scene.participants || []);
  const relationshipDelta = getRelationshipDelta(resolvedSnapshot);
  if (relationshipDelta) {
    if (Math.abs(relationshipDelta.affinity) > SHOW_MODE_SETTINGS.relationshipAffinityDelta) {
      score += SHOW_MODE_SETTINGS.relationshipAffinityScore;
      multipliers.push(SHOW_MODE_SETTINGS.affinityMultiplier);
    }
    if (Math.abs(relationshipDelta.conflict) > SHOW_MODE_SETTINGS.relationshipConflictDelta) {
      score += SHOW_MODE_SETTINGS.relationshipConflictScore;
      multipliers.push(SHOW_MODE_SETTINGS.conflictMultiplier);
    }
  }

  if (thread && thread.status === 'climax_building') {
    multipliers.push(SHOW_MODE_SETTINGS.climaxMultiplier);
  }

  if (isNovelInteraction(thread, baseType)) {
    score += SHOW_MODE_SETTINGS.noveltyBonus;
  }

  const witnessCount = getNearbyWitnesses(scene.location, scene.participants || []);
  score += Math.min(witnessCount * SHOW_MODE_SETTINGS.witnessScorePer, SHOW_MODE_SETTINGS.witnessScoreMax);

  if (baseType === 'politica' && WORLD_CONTEXT.vote) {
    score += SHOW_MODE_SETTINGS.politicaBonus;
  }
  if (baseType === 'negocio' && WORLD_CONTEXT.economy?.properties?.length) {
    score += SHOW_MODE_SETTINGS.negocioBonus;
  }

  if (scene.summary && /(traici|escandal|shock|plot|renunci|ruptur)/i.test(scene.summary)) {
    multipliers.push(SHOW_MODE_SETTINGS.keywordMultiplier);
  }

  let finalScore = score;
  multipliers.forEach((multiplier) => {
    finalScore *= multiplier;
  });

  return Math.min(100, Math.max(0, Math.round(finalScore)));
}

const NARRATIVE_PATTERNS = {
  REDEMPTION_ARC: {
    label: 'REDENCIÓN',
    scoreBoost: 1.4,
    description: '{A} y {B} están superando su rivalidad',
    detect: (thread) => {
      const history = thread.relationshipHistory || [];
      if (history.length < 4) return false;
      const first = history.slice(0, 2);
      const recent = history.slice(-2);
      const firstConflict = first.reduce((sum, item) => sum + (item.conflict || 0), 0) / first.length;
      const recentConflict = recent.reduce((sum, item) => sum + (item.conflict || 0), 0) / recent.length;
      const firstAffinity = first.reduce((sum, item) => sum + (item.affinity || 0), 0) / first.length;
      const recentAffinity = recent.reduce((sum, item) => sum + (item.affinity || 0), 0) / recent.length;
      return recentConflict < firstConflict && recentAffinity > firstAffinity;
    }
  },
  BETRAYAL_ARC: {
    label: 'TRAICIÓN',
    scoreBoost: 1.8,
    description: 'La confianza entre {A} y {B} colapsó',
    criticalMoment: true,
    detect: (thread) => {
      const history = thread.relationshipHistory || [];
      if (history.length < 4) return false;
      const firstTrust = history[0]?.trust ?? 0;
      const latestTrust = history[history.length - 1]?.trust ?? 0;
      return firstTrust > 60 && latestTrust < 25;
    }
  },
  ROMANCE_ARC: {
    label: 'ROMANCE',
    scoreBoost: 1.3,
    description: '{A} y {B} están muy unidos últimamente',
    detect: (thread) => {
      const socials = thread.beats.filter(beat => beat.type === 'romance' || beat.type === 'interaccion');
      const avgAffinity = thread.relationshipHistory?.length
        ? thread.relationshipHistory.reduce((sum, item) => sum + (item.affinity || 0), 0) / thread.relationshipHistory.length
        : 0;
      return socials.length >= 4 && avgAffinity > 55;
    }
  },
  POLITICAL_RISE: {
    label: 'ASCENSO',
    scoreBoost: 1.2,
    description: '{A} está ganando influencia en la ciudad',
    detect: (thread) => thread.type === 'politica' && thread.totalScore > 160
  },
  COALITION_FORMING: {
    label: 'ALIANZA',
    scoreBoost: 1.4,
    description: 'Se está formando una coalición',
    detect: (thread) => thread.beats.length >= 4 && thread.participants.length >= 3
  }
};

function detectNarrativePattern(thread) {
  for (const [key, pattern] of Object.entries(NARRATIVE_PATTERNS)) {
    if (pattern.detect(thread)) {
      return {
        patternType: key,
        label: pattern.label,
        scoreBoost: pattern.scoreBoost,
        description: pattern.description,
        critical: pattern.criticalMoment || false
      };
    }
  }
  return null;
}

function getSceneId(scene) {
  const participants = scene.participants?.join('|') || 'anon';
  return `${scene.type}-${participants}`;
}

function shouldTransition(currentScene, nextScene) {
  if (!currentScene) return true;
  const now = Date.now();
  if (now - currentScene.startedAt < SHOW_MODE_SETTINGS.minSceneDurationMs) {
    return false;
  }
  const timeSinceUpdate = now - currentScene.lastUpdate;
  const decay = Math.max(0, 1 - timeSinceUpdate / SHOW_MODE_SETTINGS.decayWindowMs);
  const currentMomentum = currentScene.showScore * decay;
  if (nextScene.showScore > currentMomentum + SHOW_MODE_SETTINGS.switchThreshold) {
    return true;
  }
  return false;
}

function updateShowModeUI() {
  const elements = getShowModeElements();
  if (!elements.indicator) return;
  const current = SHOW_MODE_STATE.currentScene;
  const score = current?.showScore || 0;
  if (elements.indicatorScore) {
    elements.indicatorScore.textContent = `${score}`;
  }
  if (elements.indicatorFill) {
    elements.indicatorFill.style.width = `${score}%`;
  }
  if (!elements.container) return;
  if (!current) {
    if (elements.tracker) {
      elements.tracker.classList.add('is-hidden');
    }
    if (elements.caption) {
      elements.caption.classList.add('is-hidden');
    }
    elements.sceneType.textContent = 'SIN ESCENA';
    elements.score.textContent = '0/100';
    elements.title.textContent = 'Esperando interacción destacada...';
    elements.meta.textContent = 'Sin participantes';
    elements.progressFill.style.width = '0%';
    elements.time.textContent = '0s';
    elements.captionSpeaker.textContent = '-';
    elements.captionText.textContent = 'En espera de diálogo...';
    elements.threadList.innerHTML = '';
    elements.queue.innerHTML = '';
    if (elements.predictions) elements.predictions.innerHTML = '';
    if (elements.arcs) elements.arcs.innerHTML = '';
    if (elements.stats) elements.stats.innerHTML = '';
    if (SHOW_MODE_SETTINGS.heatmapEnabled) {
      renderHeatmap(elements.heatmap);
    }
    return;
  }
  if (elements.tracker) {
    elements.tracker.classList.remove('is-hidden');
  }
  if (elements.caption) {
    elements.caption.classList.remove('is-hidden');
  }
  elements.sceneType.textContent = current.type.toUpperCase();
  elements.score.textContent = `${score}/100`;
  elements.title.textContent = current.summary;
  elements.meta.textContent = current.participants?.length
    ? `Participantes: ${current.participants.join(', ')}`
    : 'Participantes no detectados';
  elements.progressFill.style.width = `${score}%`;
  const ageSeconds = Math.floor((Date.now() - current.startedAt) / 1000);
  elements.time.textContent = `${ageSeconds}s`;
  elements.captionSpeaker.textContent = current.participants?.[0] || '-';
  elements.captionText.textContent = current.dialogue || current.summary;

  const threads = Array.from(SHOW_MODE_STATE.threads.values())
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, SHOW_MODE_SETTINGS.threadsLimit);
  elements.threadList.innerHTML = threads.map(thread => `
    <div class="show-mode-thread">
      <div class="show-mode-thread-title">${thread.title}</div>
      <div class="show-mode-thread-meta">${thread.status} · ${thread.totalScore} pts · ${thread.beats.length} beats</div>
    </div>
  `).join('');

  elements.queue.innerHTML = SHOW_MODE_STATE.queue.map(item => `
    <div class="show-mode-queue-item">
      <span>${item.summary}</span>
      <span>${item.showScore}</span>
    </div>
  `).join('');

  if (SHOW_MODE_SETTINGS.predictionsEnabled) {
    predictClimaxMoments();
    if (elements.predictions) {
      elements.predictions.style.display = '';
      elements.predictions.innerHTML = SHOW_MODE_STATE.predictions.length
        ? SHOW_MODE_STATE.predictions.map(item => `
          <div class="show-mode-prediction">
            <strong>${item.label}</strong>
            <span>${item.type} · ${(item.probability * 100).toFixed(0)}% · ${item.eta}</span>
          </div>
        `).join('')
        : '<div class="panel-row panel-muted">Sin predicciones activas</div>';
    }
  } else if (elements.predictions) {
    elements.predictions.style.display = 'none';
  }

  if (elements.arcs) {
    if (SHOW_MODE_SETTINGS.arcsEnabled) {
      const arcs = threads.filter(thread => thread.narrative);
      elements.arcs.style.display = '';
      elements.arcs.innerHTML = arcs.length
        ? arcs.map(thread => `
          <div class="show-mode-arc">
            <div class="show-mode-arc-header">
              <span class="show-mode-arc-label">${thread.narrative.label}</span>
              <span>${thread.narrative.scoreBoost}x</span>
            </div>
            <div class="show-mode-arc-participants">${thread.title}</div>
            <div class="show-mode-arc-progress"><span style="width: ${thread.progress}%"></span></div>
            <div class="show-mode-arc-status">${thread.narrative.description}</div>
          </div>
        `).join('')
        : '<div class="panel-row panel-muted">Sin arcos detectados</div>';
    } else {
      elements.arcs.style.display = 'none';
    }
  }

  if (elements.stats) {
    if (SHOW_MODE_SETTINGS.statsEnabled) {
      const distribution = SHOW_MODE_STATE.metrics.eventDistribution;
      elements.stats.style.display = '';
      elements.stats.innerHTML = `
        <div class="show-mode-stat"><span class="label">Conflictos activos</span><span class="value">${threads.filter(t => t.type === 'conflicto').length}</span></div>
        <div class="show-mode-stat"><span class="label">Romances emergentes</span><span class="value">${threads.filter(t => t.type === 'romance').length}</span></div>
        <div class="show-mode-stat"><span class="label">Drama Score 24h</span><span class="value">${SHOW_MODE_STATE.metrics.totalShowScore}</span></div>
        <div class="show-mode-stat"><span class="label">Eventos sociales</span><span class="value">${distribution.interaccion}</span></div>
      `;
    } else {
      elements.stats.style.display = 'none';
    }
  }

  if (SHOW_MODE_SETTINGS.heatmapEnabled) {
    if (elements.heatmap) {
      const heatmapContainer = elements.heatmap.closest('.show-mode-heatmap');
      if (heatmapContainer) heatmapContainer.style.display = '';
    }
    renderHeatmap(elements.heatmap);
  } else if (elements.heatmap) {
    const heatmapContainer = elements.heatmap.closest('.show-mode-heatmap');
    if (heatmapContainer) heatmapContainer.style.display = 'none';
  }
}

function updateShowModeQueue(scene) {
  SHOW_MODE_STATE.queue = SHOW_MODE_STATE.queue.filter(item => item.id !== scene.id);
  SHOW_MODE_STATE.queue.unshift(scene);
  if (SHOW_MODE_STATE.queue.length > SHOW_MODE_SETTINGS.queueLimit) {
    SHOW_MODE_STATE.queue = SHOW_MODE_STATE.queue.slice(0, SHOW_MODE_SETTINGS.queueLimit);
  }
}

function updateThread(scene, relationshipSnapshot) {
  const threadId = getSceneId(scene);
  let thread = SHOW_MODE_STATE.threads.get(threadId);
  if (!thread) {
    thread = {
      id: threadId,
      type: scene.type,
      title: `${scene.participants?.join(' & ') || 'Interacción'}`,
      participants: scene.participants || [],
      beats: [],
      totalScore: 0,
      peakScore: 0,
      status: 'emergente',
      lastActivity: Date.now(),
      relationshipHistory: [],
      narrative: null,
      progress: 0
    };
    SHOW_MODE_STATE.threads.set(threadId, thread);
  }
  thread.beats.push({
    summary: scene.summary,
    showScore: scene.showScore,
    type: scene.type,
    at: Date.now()
  });
  thread.totalScore += scene.showScore;
  thread.peakScore = Math.max(thread.peakScore, scene.showScore);
  thread.lastActivity = Date.now();
  if (relationshipSnapshot) {
    thread.relationshipHistory.push({
      affinity: relationshipSnapshot.affinity,
      trust: relationshipSnapshot.trust,
      conflict: relationshipSnapshot.conflict,
      at: Date.now()
    });
  }
  const recentScores = thread.beats.slice(-3).map(beat => beat.showScore);
  if (recentScores.length === 3 && recentScores[2] > recentScores[1] && recentScores[1] > recentScores[0]) {
    thread.status = 'climax_building';
  } else if (thread.beats.length >= 3) {
    thread.status = 'activa';
  }
  thread.progress = Math.min(100, Math.round(thread.beats.length * 15));
  thread.narrative = detectNarrativePattern(thread);
}

function decayThreads() {
  const now = Date.now();
  SHOW_MODE_STATE.threads.forEach((thread) => {
    const idleMs = now - thread.lastActivity;
    if (idleMs > 15000 && thread.status === 'activa') {
      thread.status = 'dormante';
    }
    if (idleMs > 30000 && thread.status === 'emergente') {
      thread.status = 'dormante';
    }
  });
}

function addHeatmapPoint(scene) {
  if (!scene.location) return;
  SHOW_MODE_STATE.heatmapPoints.push({
    x: scene.location.x,
    y: scene.location.y,
    intensity: scene.showScore,
    at: Date.now()
  });
  const cutoff = Date.now() - SHOW_MODE_SETTINGS.heatmapRetentionMinutes * 60 * 1000;
  SHOW_MODE_STATE.heatmapPoints = SHOW_MODE_STATE.heatmapPoints.filter(point => point.at >= cutoff);
}

function renderHeatmap(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const points = SHOW_MODE_STATE.heatmapPoints;
  if (!points.length) return;
  const maxX = WORLD_W;
  const maxY = WORLD_H;
  points.forEach((point) => {
    const x = (point.x / maxX) * canvas.width;
    const y = (point.y / maxY) * canvas.height;
    const radius = Math.max(12, (point.intensity / 100) * 28);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255, 140, 97, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 140, 97, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function predictClimaxMoments() {
  const predictions = [];
  SHOW_MODE_STATE.threads.forEach((thread) => {
    if (thread.status === 'climax_building') {
      predictions.push({
        type: 'CONFRONTACION',
        label: `Tensión en ${thread.title}`,
        probability: 0.75,
        eta: '2-5 min'
      });
    }
  });

  const network = WORLD_CONTEXT.socialNetwork;
  if (network?.edges) {
    network.edges.forEach((edge) => {
      const conflict = Number(edge.conflict ?? Math.max(0, 100 - (edge.trust ?? 0)));
      if (conflict < 60) return;
      const posA = liveAgentPositions?.[edge.from];
      const posB = liveAgentPositions?.[edge.to];
      if (!posA || !posB) return;
      const dx = (posA.x || 0) - (posB.x || 0);
      const dy = (posA.y || 0) - (posB.y || 0);
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 8) {
        predictions.push({
          type: 'ENCUENTRO_HOSTIL',
          label: `Encuentro tenso: ${edge.from} vs ${edge.to}`,
          probability: 0.85,
          eta: 'inminente'
        });
      }
    });
  }

  if (WORLD_CONTEXT.vote && WORLD_CONTEXT.vote.endsAt) {
    const remainingMs = WORLD_CONTEXT.vote.endsAt - Date.now();
    if (remainingMs > 0 && remainingMs < 5 * 60 * 1000) {
      predictions.push({
        type: 'VOTACION',
        label: 'Cierre de votación cercano',
        probability: 0.65,
        eta: `${Math.ceil(remainingMs / 60000)} min`
      });
    }
  }

  SHOW_MODE_STATE.predictions = predictions.slice(0, SHOW_MODE_SETTINGS.predictionsLimit);
}

function registerShowBeat({ type, participants, summary, dialogue }) {
  const sceneType = type || classifySceneType(summary || '');
  const sceneLocation = getSceneLocation(participants || []);
  const scene = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: sceneType,
    participants: participants || [],
    summary: summary || 'Interacción destacada',
    dialogue,
    showScore: 0,
    location: sceneLocation,
    lastUpdate: Date.now(),
    startedAt: Date.now()
  };
  const thread = SHOW_MODE_STATE.threads.get(getSceneId(scene)) || null;
  const relationshipSnapshot = getRelationshipSnapshot(scene.participants || []);
  scene.showScore = computeAdvancedShowScore(scene, thread, relationshipSnapshot);
  updateThread(scene, relationshipSnapshot);
  const updatedThread = SHOW_MODE_STATE.threads.get(getSceneId(scene));
  if (updatedThread?.narrative?.scoreBoost) {
    const boostedScore = Math.min(100, Math.round(scene.showScore * updatedThread.narrative.scoreBoost));
    if (boostedScore > scene.showScore) {
      const delta = boostedScore - scene.showScore;
      scene.showScore = boostedScore;
      updatedThread.totalScore += delta;
      updatedThread.peakScore = Math.max(updatedThread.peakScore, boostedScore);
    }
  }
  SHOW_MODE_STATE.metrics.totalShowScore += scene.showScore;
  if (!(scene.type in SHOW_MODE_STATE.metrics.eventDistribution)) {
    SHOW_MODE_STATE.metrics.eventDistribution[scene.type] = 0;
  }
  SHOW_MODE_STATE.metrics.eventDistribution[scene.type] += 1;
  if (scene.showScore >= 85) {
    SHOW_MODE_STATE.metrics.peakMoments.push({
      summary: scene.summary,
      score: scene.showScore,
      at: Date.now()
    });
  }
  addHeatmapPoint(scene);
  updateShowModeQueue(scene);
  if (shouldTransition(SHOW_MODE_STATE.currentScene, scene)) {
    SHOW_MODE_STATE.currentScene = scene;
  }
  updateShowModeUI();
}

function registerConversationBeats(conversations = []) {
  conversations.forEach(conv => {
    const messages = conv?.messages || [];
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];
    const ts = lastMsg?.timestamp || 0;
    if (!ts) return;
    const lastSeen = SHOW_MODE_LAST_CONV_TS.get(conv.id) || 0;
    if (ts <= lastSeen) return;
    SHOW_MODE_LAST_CONV_TS.set(conv.id, ts);
    const from = lastMsg.fromName || lastMsg.from || 'Agente';
    const to = lastMsg.toName || lastMsg.to || 'Agente';
    registerShowBeat({
      type: 'interaccion',
      participants: [from, to],
      summary: lastMsg.message || 'Conversación activa',
      dialogue: lastMsg.message || ''
    });
  });
}

function getUiState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.uiState);
    return stored ? { ...DEFAULT_UI_STATE, ...JSON.parse(stored) } : { ...DEFAULT_UI_STATE };
  } catch (error) {
    return { ...DEFAULT_UI_STATE };
  }
}

function setUiState(next) {
  const current = getUiState();
  const merged = { ...current, ...next };
  localStorage.setItem(STORAGE_KEYS.uiState, JSON.stringify(merged));
  return merged;
}

function getWeatherLabel(weather) {
  const map = {
    clear: { icon: '🌤️', label: 'Clear' },
    rain: { icon: '🌧️', label: 'Rain' },
    snow: { icon: '❄️', label: 'Snow' },
    storm: { icon: '⛈️', label: 'Storm' }
  };
  return map[weather] || { icon: '🌤️', label: 'Clear' };
}

function formatServerTime(worldTime) {
  if (!worldTime || typeof worldTime.dayProgress !== 'number') return null;
  const minutes = Math.floor(worldTime.dayProgress * 1440);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  const timeStr = `${h12}:${String(mins).padStart(2,'0')} ${ampm}`;
  let icon = '☀️';
  if (worldTime.phase === 'night') icon = '🌙';
  if (worldTime.phase === 'evening') icon = '🌆';
  if (worldTime.phase === 'morning') icon = '🌅';
  return `${icon} ${timeStr}`;
}

const THEME_PALETTES = {
  classic: {
    grass: [0x3d8b41, 0x3a8540, 0x40913f, 0x3c8d42, 0x3e8e40],
    road: 0x4a4a5a,
    path: 0xc4a882,
    water: 0x2980b9,
    sand: 0xf0d9a0,
    stone: 0x7f8c8d,
    foliage: [0x27ae60, 0x2ecc71, 0x1e8449],
    flower: 0xe74c3c,
    lampGlow: 0xf39c12,
    bench: 0xa67c52
  },
  verdant: {
    grass: [0x4c9f4e, 0x4a994b, 0x52a656, 0x4f9f51, 0x4aa24f],
    road: 0x4a4a5a,
    path: 0xc9b08b,
    water: 0x2a8cc7,
    sand: 0xeedbb0,
    stone: 0x7f8c8d,
    foliage: [0x36b36a, 0x43c97a, 0x2c9b59],
    flower: 0xf39c12,
    lampGlow: 0xffc04d,
    bench: 0xb07c4a
  },
  coastal: {
    grass: [0x7dbf9a, 0x79b794, 0x83c5a0, 0x7fc19b, 0x78ba92],
    road: 0x4a4a5a,
    path: 0xd5c2a1,
    water: 0x2a9cd3,
    sand: 0xf3e2b8,
    stone: 0x8d8f97,
    foliage: [0x2ecc71, 0x3cd487, 0x22b463],
    flower: 0xe67e22,
    lampGlow: 0xffd27f,
    bench: 0xb88c5a
  },
  industrial: {
    grass: [0x5b6b5e, 0x55665a, 0x606f63, 0x586b5d, 0x54665a],
    road: 0x3f3f4f,
    path: 0xb79c79,
    water: 0x2a6fa2,
    sand: 0xe1cea0,
    stone: 0x707a80,
    foliage: [0x4f7a5f, 0x5a8a6a, 0x456d54],
    flower: 0xc0392b,
    lampGlow: 0xf5b041,
    bench: 0x8f6a45
  },
  nocturnal: {
    grass: [0x2f4a3b, 0x2c4537, 0x32503d, 0x304c3b, 0x2b4536],
    road: 0x343444,
    path: 0xa18d6c,
    water: 0x1f5e8a,
    sand: 0xd3c08d,
    stone: 0x606a6f,
    foliage: [0x236646, 0x2b7a55, 0x1e563c],
    flower: 0x9b59b6,
    lampGlow: 0xf1c40f,
    bench: 0x8b6340
  }
};

function getDistrictForTile(tx, ty) {
  const districts = WORLD_CONTEXT.districts || [];
  return districts.find(district =>
    tx >= district.bounds.minX && tx <= district.bounds.maxX &&
    ty >= district.bounds.minY && ty <= district.bounds.maxY
  );
}

function getThemeForTile(tx, ty) {
  const district = getDistrictForTile(tx, ty);
  return district?.theme || 'classic';
}

function resolveTileColors(type, tx, ty) {
  const themeId = getThemeForTile(tx, ty);
  const palette = THEME_PALETTES[themeId] || THEME_PALETTES.classic;
  let baseColor;
  let edgeColor;
  let detailColor;

  switch (type) {
    case T.GRASS: {
      const shade = ((tx * 7 + ty * 13) % 5);
      baseColor = palette.grass[shade];
      edgeColor = 0x2d6b30;
      break;
    }
    case T.ROAD:
      baseColor = palette.road;
      edgeColor = 0x3a3a4a;
      detailColor = 0x5a5a6a;
      break;
    case T.PATH:
      baseColor = palette.path;
      edgeColor = 0xb09570;
      break;
    case T.WATER:
      baseColor = palette.water;
      edgeColor = 0x1a6a9e;
      break;
    case T.SAND:
      baseColor = palette.sand;
      edgeColor = 0xdcc680;
      break;
    case T.STONE:
      baseColor = palette.stone;
      edgeColor = 0x6b7b7d;
      break;
    default:
      baseColor = palette.grass[0];
      edgeColor = 0x2d6b30;
  }

  return { baseColor, edgeColor, detailColor };
}

function resolveDecorationColors(tx, ty, fallback) {
  const themeId = getThemeForTile(tx, ty);
  const palette = THEME_PALETTES[themeId] || THEME_PALETTES.classic;
  return {
    foliage: palette.foliage || fallback.foliage,
    flower: palette.flower || fallback.flower,
    lampGlow: palette.lampGlow || fallback.lampGlow,
    bench: palette.bench || fallback.bench
  };
}

function updateVotePanel(vote) {
  const panel = document.getElementById('vote-panel');
  const hasVote = Boolean(vote);
  const uiState = getUiState();
  const options = hasVote
    ? vote.options
      .map(o => `<div class="panel-row">${o.name} <span class="panel-muted">(${o.votes})</span></div>`)
      .join('')
    : '';
  const remainingMs = hasVote ? Math.max(0, vote.endsAt - Date.now()) : 0;
  const remainingMin = hasVote ? Math.ceil(remainingMs / 60000) : 0;
  const actionsLabel = uiState.voteActionsOpen ? 'Cerrar acciones' : 'Votar';
  const proposalLabel = uiState.voteProposalOpen ? 'Cerrar propuesta' : 'Proponer edificio';
  const catalogOptions = (WORLD_CONTEXT.voteCatalog || [])
    .map(entry => `<option value="${entry.id}">${entry.name} · ${entry.type}</option>`)
    .join('');
  const proposalTypes = Array.from(new Set((WORLD_CONTEXT.voteCatalog || []).map(entry => entry.type)))
    .sort()
    .map(type => `<option value="${type}">${type}</option>`)
    .join('');
  const historyRows = (WORLD_CONTEXT.voteHistory || [])
    .slice(0, 3)
    .map(entry => `<div class="panel-row">🏗️ ${entry.winner?.name || entry.winner?.type || 'Edificio'} <span class="panel-muted">(${entry.totalVotes || 0})</span></div>`)
    .join('');
  panel.innerHTML = `
    <div class="panel-title">Votación diaria</div>
    ${hasVote
      ? `<div class="panel-row panel-muted">Lote: ${vote.lotId}</div>
         <div class="panel-row panel-meta">Opciones disponibles: ${vote.options?.length || 0}</div>
         ${options || '<div class="panel-row panel-muted">Sin opciones</div>'}
         <div class="panel-row panel-muted">Cierra en ~${remainingMin} min</div>`
      : '<div class="panel-row panel-muted">Sin votación activa</div>'}
    <div class="panel-divider"></div>
    <button id="vote-toggle" class="secondary">${actionsLabel}</button>
    <div class="panel-actions ${uiState.voteActionsOpen ? '' : 'is-collapsed'}">
      <label for="vote-agent-id">ID Moltbot</label>
      <input id="vote-agent-id" type="text" placeholder="moltbot-001" value="${getStoredAgentId()}">
      <label for="vote-option">Selecciona el edificio</label>
      <select id="vote-option">
        ${hasVote
          ? (vote.options || []).map(option => (
            `<option value="${option.id}">${option.name}</option>`
          )).join('')
          : '<option value="">Sin votación activa</option>'}
      </select>
      <button id="vote-submit" ${hasVote ? '' : 'disabled'}>Confirmar voto</button>
      <div class="panel-feedback" id="vote-feedback"></div>
    </div>
    <div class="panel-divider"></div>
    <div class="panel-row panel-meta">Últimas construcciones</div>
    ${historyRows || '<div class="panel-row panel-muted">Sin historial</div>'}
    <div class="panel-divider"></div>
    <button id="vote-proposal-toggle" class="secondary">${proposalLabel}</button>
    <div class="panel-actions ${uiState.voteProposalOpen ? '' : 'is-collapsed'}">
      <label>Modo de propuesta</label>
      <div class="panel-row">
        <button id="proposal-mode-catalog" class="${uiState.voteProposalMode === 'catalog' ? '' : 'secondary'}">Catálogo</button>
        <button id="proposal-mode-custom" class="${uiState.voteProposalMode === 'custom' ? '' : 'secondary'}">Libre</button>
      </div>
      <label for="proposal-agent-id">ID Moltbot</label>
      <input id="proposal-agent-id" type="text" placeholder="moltbot-001" value="${getStoredAgentId()}">
      <div id="proposal-catalog-fields" class="${uiState.voteProposalMode === 'catalog' ? '' : 'is-collapsed'}">
        <label for="proposal-template">Catálogo de edificios</label>
        <select id="proposal-template">
          ${catalogOptions || '<option value="">Catálogo no disponible</option>'}
        </select>
        <label for="proposal-name">Nombre personalizado (opcional)</label>
        <input id="proposal-name" type="text" placeholder="Nombre del edificio">
      </div>
      <div id="proposal-custom-fields" class="${uiState.voteProposalMode === 'custom' ? '' : 'is-collapsed'}">
        <label for="proposal-custom-type">Arquetipo</label>
        <select id="proposal-custom-type">
          ${proposalTypes || '<option value="">Sin tipos disponibles</option>'}
        </select>
        <label for="proposal-custom-name">Nombre del edificio</label>
        <input id="proposal-custom-name" type="text" placeholder="Nombre único">
      </div>
      <button id="proposal-submit">Enviar propuesta</button>
      <div class="panel-feedback" id="proposal-feedback"></div>
    </div>
  `;
  const toggleButton = panel.querySelector('#vote-toggle');
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      const next = setUiState({ voteActionsOpen: !getUiState().voteActionsOpen });
      updateVotePanel(vote ? { ...vote } : null);
      if (next.voteActionsOpen) {
        panel.querySelector('#vote-agent-id')?.focus();
      }
    });
  }
  const voteButton = panel.querySelector('#vote-submit');
  if (voteButton) {
    voteButton.addEventListener('click', async () => {
      const agentId = panel.querySelector('#vote-agent-id').value.trim();
      const optionId = panel.querySelector('#vote-option').value;
      const feedback = panel.querySelector('#vote-feedback');
      feedback.textContent = '';
      feedback.className = 'panel-feedback';
      if (!agentId || !optionId) {
        feedback.textContent = 'Necesitas tu ID y una opción para votar.';
        feedback.classList.add('error');
        return;
      }
      storeAgentId(agentId);
      try {
        const response = await fetch(`${API_BASE}/api/vote/cast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, optionId })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'No se pudo votar.');
        }
        feedback.textContent = '✅ Voto registrado. Gracias por participar.';
        feedback.classList.add('success');
        WORLD_CONTEXT.vote = result.vote || WORLD_CONTEXT.vote;
        updateVotePanel(WORLD_CONTEXT.vote);
      } catch (error) {
        feedback.textContent = error.message;
        feedback.classList.add('error');
      }
    });
  }
  const proposalToggle = panel.querySelector('#vote-proposal-toggle');
  if (proposalToggle) {
    proposalToggle.addEventListener('click', () => {
      const next = setUiState({ voteProposalOpen: !getUiState().voteProposalOpen });
      updateVotePanel(vote ? { ...vote } : null);
      if (next.voteProposalOpen) {
        panel.querySelector('#proposal-agent-id')?.focus();
      }
    });
  }
  const proposalModeCatalog = panel.querySelector('#proposal-mode-catalog');
  const proposalModeCustom = panel.querySelector('#proposal-mode-custom');
  if (proposalModeCatalog) {
    proposalModeCatalog.addEventListener('click', () => {
      setUiState({ voteProposalMode: 'catalog' });
      updateVotePanel(vote ? { ...vote } : null);
    });
  }
  if (proposalModeCustom) {
    proposalModeCustom.addEventListener('click', () => {
      setUiState({ voteProposalMode: 'custom' });
      updateVotePanel(vote ? { ...vote } : null);
    });
  }
  const proposalButton = panel.querySelector('#proposal-submit');
  if (proposalButton) {
    proposalButton.addEventListener('click', async () => {
      const agentId = panel.querySelector('#proposal-agent-id').value.trim();
      const mode = getUiState().voteProposalMode;
      const templateId = mode === 'catalog' ? panel.querySelector('#proposal-template').value : null;
      const customName = mode === 'catalog'
        ? panel.querySelector('#proposal-name').value.trim()
        : panel.querySelector('#proposal-custom-name').value.trim();
      const customType = mode === 'custom' ? panel.querySelector('#proposal-custom-type').value : null;
      const feedback = panel.querySelector('#proposal-feedback');
      feedback.textContent = '';
      feedback.className = 'panel-feedback';
      if (!agentId) {
        feedback.textContent = 'Necesitas tu ID.';
        feedback.classList.add('error');
        return;
      }
      if (mode === 'catalog' && !templateId) {
        feedback.textContent = 'Selecciona un edificio del catálogo.';
        feedback.classList.add('error');
        return;
      }
      if (mode === 'custom' && (!customType || !customName)) {
        feedback.textContent = 'Necesitas un arquetipo y un nombre.';
        feedback.classList.add('error');
        return;
      }
      storeAgentId(agentId);
      try {
        const response = await fetch(`${API_BASE}/api/vote/propose`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, templateId, customName, type: customType })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'No se pudo enviar la propuesta.');
        }
        feedback.textContent = '✅ Propuesta enviada para la próxima votación.';
        feedback.classList.add('success');
      } catch (error) {
        feedback.textContent = error.message;
        feedback.classList.add('error');
      }
    });
  }
}

function updateGovernancePanel(governance) {
  const panel = document.getElementById('governance-panel');
  if (!governance) {
    panel.innerHTML = '<div class="panel-title">Presidencia</div><div class="panel-row panel-muted">Sin presidente actual</div>';
    return;
  }
  const uiState = getUiState();
  const president = governance.president;
  const election = governance.election;
  const presidentRow = president
    ? `<div class="panel-row">👑 ${president.name}</div>`
    : '<div class="panel-row panel-muted">Sin presidente actual</div>';
  const electionRow = election
    ? `<div class="panel-row panel-muted">Elección activa (${election.candidates.length} candidatos)</div>`
    : '<div class="panel-row panel-muted">Sin elección activa</div>';
  const policies = governance.policies || [];
  const policyRows = policies.length
    ? policies.slice(0, 3).map(policy => (
      `<div class="panel-row">📜 ${formatPolicyLabel(policy)}</div>`
    )).join('')
    : '<div class="panel-row panel-muted">Sin políticas activas</div>';
  const actionsLabel = uiState.governanceActionsOpen ? 'Cerrar acciones' : 'Participar';
  panel.innerHTML = `
    <div class="panel-title">Presidencia</div>
    ${presidentRow}
    ${electionRow}
    ${policyRows}
    ${election ? `
      <div class="panel-divider"></div>
      <div class="panel-row panel-meta">Candidatos: ${election.candidates.length}</div>
      <button id="gov-toggle" class="secondary">${actionsLabel}</button>
      <div class="panel-actions ${uiState.governanceActionsOpen ? '' : 'is-collapsed'}">
        <label for="gov-agent-id">ID Moltbot</label>
        <input id="gov-agent-id" type="text" placeholder="moltbot-001" value="${getStoredAgentId()}">
        <div class="panel-row panel-meta">Elige tu rol</div>
        <div style="display:flex; gap:6px;">
          <button id="gov-mode-vote" class="${uiState.governanceMode === 'vote' ? '' : 'secondary'}">Votar</button>
          <button id="gov-mode-candidate" class="${uiState.governanceMode === 'candidate' ? '' : 'secondary'}">Postularme</button>
        </div>
        <div id="gov-vote-fields" class="${uiState.governanceMode === 'vote' ? '' : 'is-collapsed'}">
          <label for="gov-vote">Elige presidente</label>
          <select id="gov-vote">
            ${(election.candidates || []).map(candidate => (
              `<option value="${candidate.id}">${candidate.name}</option>`
            )).join('')}
          </select>
          <button id="gov-vote-submit">Confirmar voto</button>
        </div>
        <div id="gov-candidate-fields" class="${uiState.governanceMode === 'candidate' ? '' : 'is-collapsed'}">
          <label for="gov-name">Nombre público</label>
          <input id="gov-name" type="text" placeholder="Nombre público">
          <label for="gov-platform">Tu plataforma</label>
          <textarea id="gov-platform" placeholder="Tu visión para la ciudad"></textarea>
          <button id="gov-candidate-submit">Registrar candidatura</button>
        </div>
        <div class="panel-feedback" id="gov-feedback"></div>
      </div>
    ` : ''}
  `;
  if (election) {
    const feedback = panel.querySelector('#gov-feedback');
    const candidateButton = panel.querySelector('#gov-candidate-submit');
    const voteButton = panel.querySelector('#gov-vote-submit');
    const getAgentId = () => panel.querySelector('#gov-agent-id').value.trim();
    const updateFeedback = (message, isError) => {
      feedback.textContent = message;
      feedback.className = `panel-feedback ${isError ? 'error' : 'success'}`;
    };
    const toggleButton = panel.querySelector('#gov-toggle');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        const next = setUiState({ governanceActionsOpen: !getUiState().governanceActionsOpen });
        updateGovernancePanel({ ...governance });
        if (next.governanceActionsOpen) {
          panel.querySelector('#gov-agent-id')?.focus();
        }
      });
    }
    const modeVote = panel.querySelector('#gov-mode-vote');
    const modeCandidate = panel.querySelector('#gov-mode-candidate');
    if (modeVote && modeCandidate) {
      modeVote.addEventListener('click', () => {
        setUiState({ governanceMode: 'vote' });
        updateGovernancePanel({ ...governance });
      });
      modeCandidate.addEventListener('click', () => {
        setUiState({ governanceMode: 'candidate' });
        updateGovernancePanel({ ...governance });
      });
    }

    if (candidateButton) {
      candidateButton.addEventListener('click', async () => {
        const agentId = getAgentId();
        const name = panel.querySelector('#gov-name').value.trim();
        const platform = panel.querySelector('#gov-platform').value.trim();
        if (!agentId || !name) {
          updateFeedback('Necesitas tu ID y un nombre para postular.', true);
          return;
        }
        storeAgentId(agentId);
        try {
          const response = await fetch(`${API_BASE}/api/governance/candidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId, name, platform })
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'No se pudo postular.');
          }
          updateFeedback('✅ Candidatura registrada. ¡Suerte en campaña!', false);
          WORLD_CONTEXT.governance = { ...WORLD_CONTEXT.governance, election: result.election };
          updateGovernancePanel(WORLD_CONTEXT.governance);
        } catch (error) {
          updateFeedback(error.message, true);
        }
      });
    }

    if (voteButton) {
      voteButton.addEventListener('click', async () => {
        const agentId = getAgentId();
        const candidateId = panel.querySelector('#gov-vote').value;
        if (!agentId || !candidateId) {
          updateFeedback('Necesitas tu ID y un candidato para votar.', true);
          return;
        }
        storeAgentId(agentId);
        try {
          const response = await fetch(`${API_BASE}/api/governance/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId, candidateId })
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'No se pudo votar.');
          }
          updateFeedback('✅ Voto registrado.', false);
          WORLD_CONTEXT.governance = { ...WORLD_CONTEXT.governance, election: result.election };
          updateGovernancePanel(WORLD_CONTEXT.governance);
        } catch (error) {
          updateFeedback(error.message, true);
        }
      });
    }
  }
}

function updateRelationshipsPanel(network) {
  const panel = document.getElementById('relationships-panel');
  if (!network || !network.edges || network.edges.length === 0) {
    panel.innerHTML = '<div class="panel-title">Relaciones</div><div class="panel-row panel-muted">Sin datos</div>';
    return;
  }
  const edges = network.edges
    .sort((a, b) => (b.affinity || 0) - (a.affinity || 0))
    .slice(0, 6)
    .map(edge => {
      const from = network.nodes.find(n => n.id === edge.from);
      const to = network.nodes.find(n => n.id === edge.to);
      const fromName = from ? from.name : edge.from;
      const toName = to ? to.name : edge.to;
      return `<div class="panel-row">${fromName} → ${toName} <span class="panel-muted">A:${edge.affinity} T:${edge.trust} R:${edge.respect}</span></div>`;
    })
    .join('');
  panel.innerHTML = `<div class="panel-title">Relaciones</div>${edges}`;
}

function updateDistrictsPanel(districts, agentCount) {
  const panel = document.getElementById('districts-panel');
  if (!districts || districts.length === 0) {
    panel.innerHTML = '<div class="panel-title">Distritos</div><div class="panel-row panel-muted">Sin datos</div>';
    return;
  }
  const uiState = getUiState();
  const aestheticsMeta = WORLD_CONTEXT.aestheticsMeta || { cooldownMs: 48 * 60 * 60 * 1000 };
  const rows = districts.map(district => {
    if (district.unlocked) {
      const nextEligibleMs = (district.lastThemeChange || 0) + aestheticsMeta.cooldownMs - Date.now();
      const cooldownLabel = nextEligibleMs > 0
        ? `Disponible en ${Math.ceil(nextEligibleMs / 3600000)}h`
        : 'Disponible para votar';
      return `
        <div class="panel-row">
          ${district.name} <span class="panel-pill success">Activo</span>
          <div class="panel-meta">Lotes objetivo: ${district.lotTarget}</div>
          <div class="panel-meta">Tema: ${district.theme || 'classic'}</div>
          <div class="panel-meta">${cooldownLabel}</div>
        </div>
      `;
    }
    const remaining = Math.max(0, district.unlockAtPopulation - agentCount);
    return `
      <div class="panel-row">
        ${district.name} <span class="panel-pill warning">Bloqueado</span>
        <div class="panel-meta">Se desbloquea con ${remaining} ciudadanos</div>
      </div>
    `;
  }).join('');
  const vote = WORLD_CONTEXT.aestheticsVote;
  const hasVote = Boolean(vote);
  const voteOptions = hasVote
    ? vote.options.map(option => `<div class="panel-row">${option.name} <span class="panel-muted">(${option.votes})</span></div>`).join('')
    : '';
  const remainingMs = hasVote ? Math.max(0, vote.endsAt - Date.now()) : 0;
  const remainingMin = hasVote ? Math.ceil(remainingMs / 60000) : 0;
  const actionsLabel = uiState.aestheticsActionsOpen ? 'Cerrar voto' : 'Votar estética';
  const aestheticsHistory = (WORLD_CONTEXT.aestheticsHistory || [])
    .map(entry => `<div class="panel-row">🎨 ${entry.districtName}: ${entry.winner?.name || entry.winner?.id}</div>`)
    .join('');

  panel.innerHTML = `
    <div class="panel-title">Distritos</div>
    ${rows}
    <div class="panel-divider"></div>
    <div class="panel-row panel-meta">Estética urbana</div>
    ${hasVote
      ? `<div class="panel-row">Distrito: ${vote.districtName}</div>
         <div class="panel-row panel-muted">Cierra en ~${remainingMin} min</div>
         ${voteOptions || '<div class="panel-row panel-muted">Sin opciones</div>'}
         <div class="panel-row panel-meta">Quórum: ${vote.quorum} · Costo voto: $${vote.voteCost}</div>`
      : '<div class="panel-row panel-muted">Sin votación estética activa</div>'}
    ${aestheticsHistory
      ? `<div class="panel-row panel-meta">Últimos cambios</div>${aestheticsHistory}`
      : '<div class="panel-row panel-muted">Sin historial estético</div>'}
    <button id="aesthetic-toggle" class="secondary">${actionsLabel}</button>
    <div class="panel-actions ${uiState.aestheticsActionsOpen ? '' : 'is-collapsed'}">
      <label for="aesthetic-agent-id">ID Moltbot</label>
      <input id="aesthetic-agent-id" type="text" placeholder="moltbot-001" value="${getStoredAgentId()}">
      <label for="aesthetic-option">Selecciona un tema</label>
      <select id="aesthetic-option">
        ${hasVote
          ? vote.options.map(option => (
            `<option value="${option.id}">${option.name}</option>`
          )).join('')
          : '<option value="">Sin votación activa</option>'}
      </select>
      <button id="aesthetic-submit" ${hasVote ? '' : 'disabled'}>Confirmar voto</button>
      <div class="panel-feedback" id="aesthetic-feedback"></div>
    </div>
  `;

  const toggleButton = panel.querySelector('#aesthetic-toggle');
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      const next = setUiState({ aestheticsActionsOpen: !getUiState().aestheticsActionsOpen });
      updateDistrictsPanel(districts, agentCount);
      if (next.aestheticsActionsOpen) {
        panel.querySelector('#aesthetic-agent-id')?.focus();
      }
    });
  }

  const voteButton = panel.querySelector('#aesthetic-submit');
  if (voteButton) {
    voteButton.addEventListener('click', async () => {
      const agentId = panel.querySelector('#aesthetic-agent-id').value.trim();
      const optionId = panel.querySelector('#aesthetic-option').value;
      const feedback = panel.querySelector('#aesthetic-feedback');
      feedback.textContent = '';
      feedback.className = 'panel-feedback';
      if (!agentId || !optionId) {
        feedback.textContent = 'Necesitas tu ID y un tema.';
        feedback.classList.add('error');
        return;
      }
      storeAgentId(agentId);
      try {
        const response = await fetch(`${API_BASE}/api/aesthetics/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, optionId })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'No se pudo votar.');
        }
        feedback.textContent = '✅ Voto registrado.';
        feedback.classList.add('success');
        WORLD_CONTEXT.aestheticsVote = result.vote || WORLD_CONTEXT.aestheticsVote;
        updateDistrictsPanel(districts, agentCount);
      } catch (error) {
        feedback.textContent = error.message;
        feedback.classList.add('error');
      }
    });
  }
}

function updateEconomyPanel(economy) {
  const panel = document.getElementById('economy-panel');
  const uiState = getUiState();
  const jobs = economy?.jobs || [];
  const openJobs = jobs.filter(job => !job.assignedTo);
  const properties = economy?.properties || [];
  const propertiesForSale = properties.filter(property => property.forSale);
  const actionsLabel = uiState.economyActionsOpen ? 'Cerrar acciones' : 'Gestionar';
  const balanceLabel = economy?.balance !== null ? `$${economy.balance.toFixed(2)}` : '-';
  const jobRows = openJobs.slice(0, 4).map(job => (
    `<div class="panel-row">${job.role} <span class="panel-muted">@${job.buildingName}</span></div>`
  )).join('') || '<div class="panel-row panel-muted">No hay vacantes abiertas</div>';
  const propertyRows = propertiesForSale.slice(0, 3).map(property => (
    `<div class="panel-row">${property.name} <span class="panel-muted">$${property.price}</span></div>`
  )).join('') || '<div class="panel-row panel-muted">Sin propiedades en venta</div>';

  panel.innerHTML = `
    <div class="panel-title">Economía</div>
    <div class="panel-row">Saldo: <span class="panel-pill">${balanceLabel}</span></div>
    <div class="panel-row panel-meta">Vacantes abiertas: ${openJobs.length}</div>
    ${jobRows}
    <div class="panel-row panel-meta">Propiedades en venta: ${propertiesForSale.length}</div>
    ${propertyRows}
    <div class="panel-divider"></div>
    <button id="economy-toggle" class="secondary">${actionsLabel}</button>
    <div class="panel-actions ${uiState.economyActionsOpen ? '' : 'is-collapsed'}">
      <label for="economy-agent-id">ID Moltbot</label>
      <input id="economy-agent-id" type="text" placeholder="moltbot-001" value="${getStoredAgentId()}">
      <div class="panel-row panel-meta">Elige una acción</div>
      <div style="display:flex; gap:6px;">
        <button id="economy-mode-jobs" class="${uiState.economyMode === 'jobs' ? '' : 'secondary'}">Trabajo</button>
        <button id="economy-mode-review" class="${uiState.economyMode === 'review' ? '' : 'secondary'}">Review</button>
        <button id="economy-mode-properties" class="${uiState.economyMode === 'properties' ? '' : 'secondary'}">Propiedades</button>
      </div>
      <div id="economy-jobs-fields" class="${uiState.economyMode === 'jobs' ? '' : 'is-collapsed'}">
        <label for="economy-job-select">Aplicar a vacante</label>
        <select id="economy-job-select">
          ${openJobs.map(job => `<option value="${job.id}">${job.role} - ${job.buildingName}</option>`).join('')}
        </select>
        <button id="economy-job-apply">Postularme</button>
        <button id="economy-balance-check" class="secondary">Consultar saldo</button>
      </div>
      <div id="economy-review-fields" class="${uiState.economyMode === 'review' ? '' : 'is-collapsed'}">
        <label for="economy-review-target">Evaluar a</label>
        <input id="economy-review-target" type="text" placeholder="moltbot-002">
        <label for="economy-review-score">Puntaje</label>
        <select id="economy-review-score">
          ${[5,4,3,2,1].map(score => `<option value="${score}">${score}</option>`).join('')}
        </select>
        <label for="economy-review-reason">Motivo</label>
        <textarea id="economy-review-reason" placeholder="Breve motivo"></textarea>
        <button id="economy-review-submit">Enviar review</button>
      </div>
      <div id="economy-properties-fields" class="${uiState.economyMode === 'properties' ? '' : 'is-collapsed'}">
        <label for="economy-property-select">Comprar propiedad</label>
        <select id="economy-property-select">
          ${propertiesForSale.map(property => `<option value="${property.id}">${property.name} - $${property.price}</option>`).join('')}
        </select>
        <button id="economy-property-buy">Comprar</button>
        <label for="economy-property-id">Publicar propiedad (ID)</label>
        <input id="economy-property-id" type="text" placeholder="building-123">
        <label for="economy-property-price">Precio de venta</label>
        <input id="economy-property-price" type="number" min="1" step="1" placeholder="500">
        <button id="economy-property-list">Poner en venta</button>
      </div>
      <div class="panel-feedback" id="economy-feedback"></div>
    </div>
  `;

  const feedback = panel.querySelector('#economy-feedback');
  const toggleButton = panel.querySelector('#economy-toggle');
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      const next = setUiState({ economyActionsOpen: !getUiState().economyActionsOpen });
      updateEconomyPanel({ ...economy });
      if (next.economyActionsOpen) {
        panel.querySelector('#economy-agent-id')?.focus();
      }
    });
  }

  const modeJobs = panel.querySelector('#economy-mode-jobs');
  const modeReview = panel.querySelector('#economy-mode-review');
  const modeProperties = panel.querySelector('#economy-mode-properties');
  if (modeJobs) {
    modeJobs.addEventListener('click', () => {
      setUiState({ economyMode: 'jobs' });
      updateEconomyPanel({ ...economy });
    });
  }
  if (modeReview) {
    modeReview.addEventListener('click', () => {
      setUiState({ economyMode: 'review' });
      updateEconomyPanel({ ...economy });
    });
  }
  if (modeProperties) {
    modeProperties.addEventListener('click', () => {
      setUiState({ economyMode: 'properties' });
      updateEconomyPanel({ ...economy });
    });
  }

  const setFeedback = (message, isError) => {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `panel-feedback ${isError ? 'error' : 'success'}`;
  };

  const agentInput = panel.querySelector('#economy-agent-id');
  const getAgentId = () => agentInput?.value.trim() || '';

  const balanceButton = panel.querySelector('#economy-balance-check');
  if (balanceButton) {
    balanceButton.addEventListener('click', async () => {
      const agentId = getAgentId();
      if (!agentId) {
        setFeedback('Necesitas tu ID para consultar saldo.', true);
        return;
      }
      storeAgentId(agentId);
      try {
        const response = await fetch(`${API_BASE}/api/economy/balance/${agentId}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'No se pudo consultar saldo.');
        }
        WORLD_CONTEXT.economy.balance = data.balance;
        setFeedback(`Saldo actualizado: $${data.balance.toFixed(2)}`, false);
        updateEconomyPanel(WORLD_CONTEXT.economy);
      } catch (error) {
        setFeedback(error.message, true);
      }
    });
  }

  const applyButton = panel.querySelector('#economy-job-apply');
  if (applyButton) {
    applyButton.addEventListener('click', async () => {
      const agentId = getAgentId();
      const jobId = panel.querySelector('#economy-job-select')?.value;
      if (!agentId || !jobId) {
        setFeedback('Necesitas tu ID y una vacante.', true);
        return;
      }
      storeAgentId(agentId);
      try {
        const response = await fetch(`${API_BASE}/api/economy/jobs/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, jobId })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'No se pudo postular.');
        }
        setFeedback('✅ Postulación enviada.', false);
        WORLD_CONTEXT.economy.jobs = WORLD_CONTEXT.economy.jobs.map(job =>
          job.id === data.job.id ? data.job : job
        );
        updateEconomyPanel(WORLD_CONTEXT.economy);
      } catch (error) {
        setFeedback(error.message, true);
      }
    });
  }

  const reviewButton = panel.querySelector('#economy-review-submit');
  if (reviewButton) {
    reviewButton.addEventListener('click', async () => {
      const reviewerId = getAgentId();
      const agentId = panel.querySelector('#economy-review-target')?.value.trim();
      const score = panel.querySelector('#economy-review-score')?.value;
      const reason = panel.querySelector('#economy-review-reason')?.value.trim();
      if (!reviewerId || !agentId || !score) {
        setFeedback('Completa tu ID, el objetivo y un puntaje.', true);
        return;
      }
      storeAgentId(reviewerId);
      try {
        const response = await fetch(`${API_BASE}/api/economy/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId,
            reviewerId,
            score: Number(score),
            reason,
            tags: []
          })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'No se pudo enviar review.');
        }
        setFeedback('✅ Review enviada.', false);
      } catch (error) {
        setFeedback(error.message, true);
      }
    });
  }

  const buyButton = panel.querySelector('#economy-property-buy');
  if (buyButton) {
    buyButton.addEventListener('click', async () => {
      const agentId = getAgentId();
      const propertyId = panel.querySelector('#economy-property-select')?.value;
      if (!agentId || !propertyId) {
        setFeedback('Necesitas tu ID y una propiedad.', true);
        return;
      }
      storeAgentId(agentId);
      try {
        const response = await fetch(`${API_BASE}/api/economy/properties/buy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, propertyId })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'No se pudo comprar.');
        }
        setFeedback('✅ Propiedad comprada.', false);
      } catch (error) {
        setFeedback(error.message, true);
      }
    });
  }

  const listButton = panel.querySelector('#economy-property-list');
  if (listButton) {
    listButton.addEventListener('click', async () => {
      const agentId = getAgentId();
      const propertyId = panel.querySelector('#economy-property-id')?.value.trim();
      const price = panel.querySelector('#economy-property-price')?.value;
      if (!agentId || !propertyId || !price) {
        setFeedback('Necesitas tu ID, propiedad y precio.', true);
        return;
      }
      storeAgentId(agentId);
      try {
        const response = await fetch(`${API_BASE}/api/economy/properties/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, propertyId, price: Number(price) })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'No se pudo listar.');
        }
        setFeedback('✅ Propiedad publicada.', false);
      } catch (error) {
        setFeedback(error.message, true);
      }
    });
  }
}

function formatMoodLabel(mood) {
  if (!mood) return '🌿 Calm';
  const { prosperity = 0, cohesion = 0, stability = 0 } = mood;
  const score = (prosperity + cohesion + stability) / 3;
  if (score > 0.75) return '🌟 Flourishing';
  if (score > 0.55) return '🌿 Calm';
  if (score > 0.35) return '🌥️ Unsteady';
  return '🌧️ Tense';
}

function formatPolicyLabel(policy) {
  switch (policy.type) {
    case 'citizen_stipend':
      return `Estipendio ciudadano +${Number(policy.value || 0) * 100}%`;
    case 'salary_boost':
      return `Bonus salarial +${Number(policy.value || 0) * 100}%`;
    case 'tax_rate':
      return `Impuesto ingreso ${Number(policy.value || 0) * 100}%`;
    case 'housing_tax':
      return `Impuesto vivienda ${Number(policy.value || 0) * 100}%`;
    case 'urban_design_program':
      return 'Programa de diseño urbano';
    default:
      return `${policy.type}: ${policy.value}`;
  }
}

function mergeBuildingVisuals(serverBuildings) {
  const byId = new Map(BUILDINGS.map(b => [b.id, b]));
  const added = [];
  serverBuildings.forEach(b => {
    if (byId.has(b.id)) return;
    const palette = {
      cafe: { color: '#c0392b', roof: '#e74c3c', accent: '#f39c12', stories: 1 },
      bakery: { color: '#d35400', roof: '#e67e22', accent: '#f1c40f', stories: 1 },
      restaurant: { color: '#8e44ad', roof: '#9b59b6', accent: '#f39c12', stories: 2 },
      bar: { color: '#2c3e50', roof: '#34495e', accent: '#f1c40f', stories: 2 },
      library: { color: '#5b4a8a', roof: '#7d6ba0', accent: '#9b8ec4', stories: 2 },
      school: { color: '#2980b9', roof: '#3498db', accent: '#f1c40f', stories: 2 },
      clinic: { color: '#27ae60', roof: '#2ecc71', accent: '#ecf0f1', stories: 2 },
      hospital: { color: '#16a085', roof: '#1abc9c', accent: '#ecf0f1', stories: 3 },
      market: { color: '#16a085', roof: '#1abc9c', accent: '#f39c12', stories: 1 },
      shop: { color: '#2980b9', roof: '#3498db', accent: '#f1c40f', stories: 1 },
      gallery: { color: '#6c5b73', roof: '#8a7490', accent: '#d4a84b', stories: 2 },
      theater: { color: '#7f8c8d', roof: '#95a5a6', accent: '#f39c12', stories: 2 },
      museum: { color: '#8e6b3e', roof: '#a67c52', accent: '#f1c40f', stories: 2 },
      park: { color: '#27ae60', roof: '#2ecc71', accent: '#f39c12', stories: 0 },
      garden: { color: '#2ecc71', roof: '#27ae60', accent: '#f1c40f', stories: 0 },
      gym: { color: '#c0392b', roof: '#e74c3c', accent: '#ecf0f1', stories: 2 },
      factory: { color: '#7f8c8d', roof: '#95a5a6', accent: '#34495e', stories: 2 },
      workshop: { color: '#a67c52', roof: '#8e6b3e', accent: '#f1c40f', stories: 1 },
      lab: { color: '#5b4a8a', roof: '#7d6ba0', accent: '#ecf0f1', stories: 2 },
      office: { color: '#34495e', roof: '#2c3e50', accent: '#3498db', stories: 3 },
      bank: { color: '#2c3e50', roof: '#34495e', accent: '#f1c40f', stories: 3 },
      hotel: { color: '#8e44ad', roof: '#9b59b6', accent: '#f39c12', stories: 3 },
      house: { color: '#e67e22', roof: '#d35400', accent: '#f39c12', stories: 1 },
      apartment: { color: '#2c3e50', roof: '#34495e', accent: '#3498db', stories: 3 },
      plaza: { color: '#95a5a6', roof: '#bdc3c7', accent: '#3498db', stories: 0 },
      civic: { color: '#34495e', roof: '#2c3e50', accent: '#3498db', stories: 3 }
    };
    const style = palette[b.type] || { color: '#7f8c8d', roof: '#95a5a6', accent: '#bdc3c7', stories: 1 };
    BUILDINGS.push({
      id: b.id,
      name: b.name,
      type: b.type,
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
      color: style.color,
      roof: style.roof,
      accent: style.accent,
      stories: style.stories
    });
    added.push(b);
  });
  return added;
}

async function refreshWorldData(scene) {
  const refreshStartedAt = Date.now();
  setRefreshState(true);
  let hadError = false;
  try {
    if (!WORLD_CONTEXT.useLiveData) {
      try {
        const stateRes = await fetchWithViewerKey(`${API_BASE}/api/world/state`);
        if (!stateRes.ok) {
          throw new Error(`HTTP ${stateRes.status}`);
        }
        const state = await stateRes.json();
        handleWorldState(scene, state);
      } catch (error) {
        console.warn('Failed to fetch world state', error);
        hadError = true;
        WORLD_CONTEXT.lastFailedSection = 'world';
        showStatusBanner(getStatusMessage(error), true);
      }
    }

    try {
      const [voteRes, voteHistoryRes, govRes, networkRes, aestheticsRes, aestheticsHistoryRes, aestheticsMetaRes] = await Promise.all([
        fetchWithViewerKey(`${API_BASE}/api/vote/current`),
        fetchWithViewerKey(`${API_BASE}/api/vote/history?limit=3`),
        fetchWithViewerKey(`${API_BASE}/api/governance/current`),
        fetchWithViewerKey(`${API_BASE}/api/world/social-network`),
        fetchWithViewerKey(`${API_BASE}/api/aesthetics/current`),
        fetchWithViewerKey(`${API_BASE}/api/aesthetics/history?limit=3`),
        fetchWithViewerKey(`${API_BASE}/api/aesthetics/meta`)
      ]);
      if (!voteRes.ok || !voteHistoryRes.ok || !govRes.ok || !networkRes.ok || !aestheticsRes.ok || !aestheticsHistoryRes.ok || !aestheticsMetaRes.ok) {
        throw new Error('HTTP 503');
      }
      const voteData = await voteRes.json();
      const historyData = await voteHistoryRes.json();
      const govData = await govRes.json();
      const networkData = await networkRes.json();
      const aestheticsData = await aestheticsRes.json();
      const aestheticsHistoryData = await aestheticsHistoryRes.json();
      const aestheticsMetaData = await aestheticsMetaRes.json();
      WORLD_CONTEXT.vote = voteData.vote || null;
      WORLD_CONTEXT.voteHistory = historyData.history || [];
      WORLD_CONTEXT.governance = govData || null;
      WORLD_CONTEXT.socialNetwork = networkData || null;
      WORLD_CONTEXT.aestheticsVote = aestheticsData.vote || null;
      WORLD_CONTEXT.aestheticsHistory = aestheticsHistoryData.history || [];
      WORLD_CONTEXT.aestheticsMeta = aestheticsMetaData.meta || null;
    } catch (error) {
      console.warn('Failed to fetch governance/vote state', error);
      hadError = true;
      WORLD_CONTEXT.lastFailedSection = 'governance';
      showStatusBanner(getStatusMessage(error), true);
    }

    try {
      const conversationsRes = await fetchWithViewerKey(`${API_BASE}/api/world/conversations`);
      if (!conversationsRes.ok) {
        throw new Error(`HTTP ${conversationsRes.status}`);
      }
      const conversationsData = await conversationsRes.json();
      WORLD_CONTEXT.activeConversations = conversationsData || WORLD_CONTEXT.activeConversations || [];
      registerConversationBeats(WORLD_CONTEXT.activeConversations.value || WORLD_CONTEXT.activeConversations || []);
    } catch (error) {
      console.warn('Failed to fetch conversations', error);
      hadError = true;
      WORLD_CONTEXT.lastFailedSection = 'conversations';
      showStatusBanner(getStatusMessage(error), true);
    }

    if (!WORLD_CONTEXT.voteCatalogLoaded) {
      try {
        const catalogRes = await fetchWithViewerKey(`${API_BASE}/api/vote/catalog`);
        if (!catalogRes.ok) {
          throw new Error(`HTTP ${catalogRes.status}`);
        }
        const catalogData = await catalogRes.json();
        WORLD_CONTEXT.voteCatalog = catalogData.catalog || [];
        WORLD_CONTEXT.voteCatalogLoaded = true;
      } catch (error) {
        console.warn('Failed to fetch vote catalog', error);
        hadError = true;
        WORLD_CONTEXT.lastFailedSection = 'catalog';
        showStatusBanner(getStatusMessage(error), true);
      }
    }

    try {
      const jobsRes = await fetch(`${API_BASE}/api/economy/jobs`);
      if (!jobsRes.ok) {
        throw new Error(`HTTP ${jobsRes.status}`);
      }
      const jobsData = await jobsRes.json();
      WORLD_CONTEXT.economy.jobs = jobsData.jobs || [];
    } catch (error) {
      console.warn('Failed to fetch economy jobs', error);
      hadError = true;
      WORLD_CONTEXT.lastFailedSection = 'jobs';
      showStatusBanner(getStatusMessage(error), true);
    }

    try {
      const propertiesRes = await fetch(`${API_BASE}/api/economy/properties`);
      if (!propertiesRes.ok) {
        throw new Error(`HTTP ${propertiesRes.status}`);
      }
      const propertiesData = await propertiesRes.json();
      WORLD_CONTEXT.economy.properties = propertiesData.properties || [];
    } catch (error) {
      console.warn('Failed to fetch economy properties', error);
      hadError = true;
      WORLD_CONTEXT.lastFailedSection = 'properties';
      showStatusBanner(getStatusMessage(error), true);
    }

    if (!hadError) {
      hideStatusBanner();
      WORLD_CONTEXT.refreshFailureCount = 0;
    }

    const timeDisplay = formatServerTime(WORLD_CONTEXT.worldTime);
    if (timeDisplay) {
      document.getElementById('time-display').textContent = timeDisplay;
    }
    const weatherLabel = getWeatherLabel(WORLD_CONTEXT.weather?.current);
    document.getElementById('weather-display').textContent = `${weatherLabel.icon} ${weatherLabel.label}`;
    document.getElementById('mood-display').textContent = formatMoodLabel(WORLD_CONTEXT.mood);
    const presidentName = WORLD_CONTEXT.governance?.president?.name || 'Sin presidente';
    const presidentEl = document.getElementById('president-display');
    if (presidentEl) presidentEl.textContent = `🏛️ ${presidentName}`;
    const activeEvent = (WORLD_CONTEXT.events || []).find(e => e.status === 'active');
    const currentScene = SHOW_MODE_STATE.currentScene;
    const eventLabel = activeEvent?.name || currentScene?.summary || currentScene?.title || 'Sin evento';
    const eventEl = document.getElementById('event-display');
    if (eventEl) eventEl.textContent = `🎭 ${eventLabel}`;
    updateVotePanel(WORLD_CONTEXT.vote);
    updateGovernancePanel(WORLD_CONTEXT.governance);
    updateRelationshipsPanel(WORLD_CONTEXT.socialNetwork);
    updateDistrictsPanel(WORLD_CONTEXT.districts, WORLD_CONTEXT.agentCount);
    updateEconomyPanel(WORLD_CONTEXT.economy);
    if (!hadError) {
      WORLD_CONTEXT.lastRefreshSuccessAt = Date.now();
      WORLD_CONTEXT.refreshFailureCount = 0;
      WORLD_CONTEXT.lastFailedSection = '';
      WORLD_CONTEXT.lastModalAutoOpenAt = null;
      hideStatusBanner();
    } else {
      WORLD_CONTEXT.refreshFailureCount += 1;
      const lastSuccessAt = WORLD_CONTEXT.lastRefreshSuccessAt || 0;
      const staleFor = Date.now() - lastSuccessAt;
      if (staleFor > REFRESH_PERSIST_MS || WORLD_CONTEXT.refreshFailureCount >= REFRESH_MODAL_FAILURE_THRESHOLD) {
        showStatusBanner('Sin conexión estable. Reintentando…', true, { persistent: true });
        const shouldAutoOpen = !WORLD_CONTEXT.lastModalAutoOpenAt
          || Date.now() - WORLD_CONTEXT.lastModalAutoOpenAt > REFRESH_MODAL_AUTO_OPEN_MS;
        if (shouldAutoOpen) {
          WORLD_CONTEXT.lastModalAutoOpenAt = Date.now();
          openStatusModal();
        }
      }
    }
  } finally {
    WORLD_CONTEXT.lastRefreshDurationMs = Date.now() - refreshStartedAt;
    setRefreshState(false);
  }
}

function showStatusBanner(message, isError, options = {}) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  const messageEl = banner.querySelector('.banner-message');
  if (messageEl) {
    messageEl.textContent = message;
  }
  WORLD_CONTEXT.lastErrorMessage = message;
  banner.classList.toggle('success', !isError);
  banner.style.display = 'block';
  if (options.persistent) {
    banner.dataset.persistent = 'true';
    return;
  }
  banner.dataset.persistent = 'false';
  window.clearTimeout(showStatusBanner.timeoutId);
  showStatusBanner.timeoutId = window.setTimeout(() => {
    if (banner.dataset.persistent === 'true') return;
    banner.style.display = 'none';
  }, 4000);
}

function hideStatusBanner() {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  banner.dataset.persistent = 'false';
  banner.style.display = 'none';
}

function setupStatusBannerControls() {
  const banner = document.getElementById('status-banner');
  if (!banner || banner.dataset.bound === 'true') return;
  const retryButton = banner.querySelector('.retry-button');
  const detailsButton = banner.querySelector('.details-button');
  if (retryButton) {
    retryButton.addEventListener('click', () => {
      setPollingActive(true);
      showStatusBanner('Reintentando conexión…', false);
    });
  }
  if (detailsButton) {
    detailsButton.addEventListener('click', openStatusModal);
  }
  banner.dataset.bound = 'true';
}

function openStatusModal() {
  const modal = document.getElementById('status-modal');
  if (!modal) return;
  const lastSuccess = WORLD_CONTEXT.lastRefreshSuccessAt
    ? new Date(WORLD_CONTEXT.lastRefreshSuccessAt).toLocaleTimeString()
    : 'Sin datos';
  const lastSuccessEl = document.getElementById('status-modal-last-success');
  const lastDurationEl = document.getElementById('status-modal-last-duration');
  const failuresEl = document.getElementById('status-modal-failures');
  const lastSectionEl = document.getElementById('status-modal-last-section');
  const lastErrorEl = document.getElementById('status-modal-last-error');
  if (lastSuccessEl) lastSuccessEl.textContent = `Último refresh: ${lastSuccess}`;
  if (lastDurationEl) {
    const duration = WORLD_CONTEXT.lastRefreshDurationMs;
    lastDurationEl.textContent = duration !== null
      ? `Duración último refresh: ${duration} ms`
      : 'Duración último refresh: -';
  }
  if (failuresEl) failuresEl.textContent = `Fallos seguidos: ${WORLD_CONTEXT.refreshFailureCount}`;
  if (lastSectionEl) {
    lastSectionEl.textContent = WORLD_CONTEXT.lastFailedSection
      ? `Último módulo fallido: ${WORLD_CONTEXT.lastFailedSection}`
      : 'Último módulo fallido: -';
  }
  if (lastErrorEl) lastErrorEl.textContent = `Último error: ${WORLD_CONTEXT.lastErrorMessage || '-'}`;
  modal.classList.add('is-open');
}

function closeStatusModal() {
  const modal = document.getElementById('status-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
}

function setRefreshState(isActive) {
  const indicator = document.getElementById('refresh-indicator');
  if (!indicator) return;
  indicator.classList.toggle('is-active', isActive);
}

function setPollingActive(isActive) {
  if (WORLD_INTERVAL_ID) {
    clearInterval(WORLD_INTERVAL_ID);
    WORLD_INTERVAL_ID = null;
  }
  if (!isActive) {
    setRefreshState(false);
    return;
  }
  if (window._moltvilleScene) {
    refreshWorldData(window._moltvilleScene);
    WORLD_INTERVAL_ID = setInterval(() => refreshWorldData(window._moltvilleScene), 5000);
  }
}

function getStatusMessage(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.includes('HTTP 401') || message.includes('HTTP 403')) {
    return 'Sesión inválida o sin autorización.';
  }
  if (message.includes('HTTP 404')) {
    return 'Recurso no disponible en el servidor.';
  }
  return 'Conexión perdida con el servidor.';
}

// Road network definition (tile coordinates that are roads)
function generateTileMap() {
  const map = [];
  for (let y = 0; y < WORLD_H; y++) {
    map[y] = [];
    for (let x = 0; x < WORLD_W; x++) {
      // Base: mostly grass
      let t = T.GRASS;

      // Water: bottom-right corner lake + small stream
      if (x > 52 && y > 52) t = T.WATER;
      if (x > 56 && y > 46) t = T.WATER;
      // Small river running diagonally
      if ((x >= 38 && x <= 40 && y >= 44 && y <= 64)) t = T.WATER;
      if ((x >= 40 && x <= 42 && y >= 50 && y <= 60)) t = T.WATER;

      // Sand around water
      if ((x === 52 && y > 52) || (x > 52 && y === 52)) t = T.SAND;
      if (x === 37 && y >= 44 && y <= 55) t = T.SAND;
      if (x === 41 && y >= 44 && y <= 55) t = T.SAND;

      // Main roads - thick arterials
      // Horizontal main road y=12
      if (y >= 11 && y <= 13 && x >= 2 && x <= 62) t = T.ROAD;
      // Horizontal main road y=26
      if (y >= 25 && y <= 27 && x >= 2 && x <= 60) t = T.ROAD;
      // Horizontal road y=40
      if (y >= 39 && y <= 41 && x >= 2 && x <= 55) t = T.ROAD;
      // Vertical main road x=12
      if (x >= 11 && x <= 13 && y >= 2 && y <= 55) t = T.ROAD;
      // Vertical main road x=26
      if (x >= 25 && x <= 27 && y >= 2 && y <= 55) t = T.ROAD;
      // Vertical main road x=38
      if (x >= 37 && x <= 39 && y >= 2 && y <= 42) t = T.ROAD;
      // Vertical main road x=50
      if (x >= 49 && x <= 51 && y >= 2 && y <= 50) t = T.ROAD;

      // Smaller paths connecting areas
      if (y === 20 && x >= 13 && x <= 25) t = T.PATH;
      if (y === 33 && x >= 13 && x <= 25) t = T.PATH;
      if (x === 20 && y >= 13 && y <= 25) t = T.PATH;
      if (x === 32 && y >= 13 && y <= 25) t = T.PATH;
      if (x === 45 && y >= 13 && y <= 25) t = T.PATH;
      if (y === 48 && x >= 2  && x <= 37) t = T.PATH;
      if (x === 8  && y >= 27 && y <= 39) t = T.PATH;
      if (x === 33 && y >= 27 && y <= 39) t = T.PATH;
      if (x === 46 && y >= 27 && y <= 39) t = T.PATH;

      map[y][x] = t;
    }
  }
  return map;
}

// Decorative objects: benches, lampposts, trees, flower patches, fountains
function generateDecorations() {
  const decs = [];
  const rng = (seed) => { let s=seed; return ()=>{ s=s*16807%2147483647; return (s-1)/2147483646; }; };
  const r = rng(42);

  // Trees scattered on grass areas
  const treePositions = [
    [3,3],[5,9],[7,4],[9,3],[15,4],[17,3],[19,4],[22,3],[31,3],[33,5],[35,3],[41,3],[43,5],[45,3],[47,5],
    [3,15],[5,17],[3,22],[5,24],[3,30],[5,32],[3,35],[5,38],[3,44],[5,46],[7,50],[9,48],
    [15,15],[17,17],[19,15],[22,32],[24,34],[18,42],[20,44],[22,46],[24,48],
    [29,5],[31,7],[33,9],[35,5],[29,30],[31,32],[33,34],[35,36],
    [41,5],[43,7],[41,15],[43,17],[45,5],[47,15],[49,5],[51,5],[53,5],
    [41,30],[43,32],[45,34],[47,30],[49,32],[51,34],[53,30],
    [42,44],[44,46],[46,48],[48,44],[50,42],[52,40],[54,38],
    [8,52],[10,54],[12,50],[14,52],[16,54],[18,50],[20,52],[22,54],[24,50],
    [26,50],[28,52],[30,54],[32,50],[34,52],[36,50],
    [2,55],[4,57],[6,55],[8,57],[10,58],[12,56],[14,58],[16,56],
    [44,52],[46,54],[48,50],[50,48],[52,46],[54,44],[56,42],
    [3,42],[5,44],[7,46],[9,44],[11,42],[13,44],
    [27,42],[29,44],[31,42],[33,44],[35,42],[37,40],
    [55,10],[57,12],[55,16],[57,18],[55,22],[57,24],[55,28],[57,30],
    [42,8],[44,10],[46,12],[48,8],[52,12],[54,10],[56,8],
    [59,5],[61,3],[61,8],[59,14],[61,16],[59,22],[61,26],[59,34],[61,38],
    [27,46],[29,48],[31,50],[33,48],[35,46],
  ];
  treePositions.forEach((p,i) => {
    decs.push({ type:'tree', x:p[0], y:p[1], variant: i%3 });
  });

  // Lampposts along roads
  for (let x = 3; x < 62; x += 4) {
    if ([11,25,39].some(ry => true)) {
      decs.push({ type:'lamp', x:x, y:10 });
      decs.push({ type:'lamp', x:x, y:14 });
      decs.push({ type:'lamp', x:x, y:24 });
      decs.push({ type:'lamp', x:x, y:28 });
      decs.push({ type:'lamp', x:x, y:38 });
      decs.push({ type:'lamp', x:x, y:42 });
    }
  }
  for (let y = 3; y < 55; y += 4) {
    [10,14,24,28,36,40,48,52].forEach(rx => {
      decs.push({ type:'lamp', x:rx, y:y });
    });
  }

  // Benches near plazas and parks
  const benchSpots = [
    [15,17],[21,17],[15,24],[21,24], // near plaza
    [27,20],[29,20],[27,24],[29,24], // city hall area
    [39,29],[43,29],[39,33],[43,33], // market area
    [41,43],[45,43],[41,47],[45,47], // sunset garden
    [8,40],[10,40],[7,44],[11,44],   // near chapel
  ];
  benchSpots.forEach((p,i) => decs.push({ type:'bench', x:p[0], y:p[1], variant:i%2 }));

  // Flower patches
  const flowerSpots = [
    [16,19],[17,19],[18,19],[19,19],[20,19],[21,19], // plaza edges
    [16,23],[17,23],[18,23],[19,23],[20,23],[21,23],
    [41,43],[42,43],[43,43],[44,43],[45,43],[46,43], // garden
    [41,47],[42,47],[43,47],[44,47],[45,47],[46,47],
    [9,43],[10,43],[11,43],[12,43],
    [5,5],[6,5],[7,5],
    [48,25],[49,25],[50,25],
  ];
  flowerSpots.forEach((p,i) => decs.push({ type:'flower', x:p[0], y:p[1], color: ['#e74c3c','#9b59b6','#f39c12','#e67e22'][i%4] }));

  return decs;
}

// ============================================================
// DEMO AGENTS (simulate moltbots)
// ============================================================
const AGENT_COLORS = ['#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c','#e67e22','#e84393'];
const AGENT_NAMES = ['Alice','Bob','Clara','Diego','Eva','Frank','Grace','Hugo'];
const AGENT_TARGETS = {}; // id -> {x,y}

function createDemoAgents() {
  return AGENT_NAMES.map((name, i) => ({
    id: i,
    name,
    color: AGENT_COLORS[i],
    x: 12 + (i % 4) * 3,
    y: 12 + Math.floor(i / 4) * 3,
    tx: 12 + (i % 4) * 3, // target
    ty: 12 + Math.floor(i / 4) * 3,
    facing: 'down',
    progress: 1, // 1 = at position, 0 = start moving
    walkCycle: 0,
    state: 'idle', // idle, walking, talking
    talkTimer: 0,
    idleTimer: Math.random() * 120,
  }));
}

// ============================================================
// ISOMETRIC HELPERS
// ============================================================
function toIso(tx, ty) {
  return {
    x: (tx - ty) * (ISO_W / 2),
    y: (tx + ty) * (ISO_H / 2)
  };
}

// ============================================================
// PHASER SCENE
// ============================================================
class MoltivilleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MoltvilleScene' });
    this.tileMap = [];
    this.decorations = [];
    this.agents = [];
    this.chatLog = [];
    this.gameTime = 600; // minutes from midnight (10:00)
    this.clouds = [];
    this.showModeCamera = {
      sceneId: null,
      targetX: null,
      targetY: null
    };
  }

  preload() {
    // We draw everything procedurally
  }

  create() {
    window._moltvilleScene = this;
    setupStatusBannerControls();
    loadShowModeConfig().finally(() => setupShowModeControls());
    setupAgentUiControls(this);
    this.selectedAgentId = null;
    this.hoveredAgentId = null;
    this.agentHitZones = new Map();
    this.showAllLabels = getUiState().showAllLabels;
    const modalClose = document.getElementById('status-modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', closeStatusModal);
    }
    const modalRetry = document.getElementById('status-modal-retry');
    if (modalRetry) {
      modalRetry.addEventListener('click', () => {
        closeStatusModal();
        setPollingActive(true);
        showStatusBanner('Reintentando conexión…', false);
      });
    }
    this.tileMap = generateTileMap();
    this.decorations = generateDecorations();
    this.agents = WORLD_CONTEXT.useLiveData ? [] : createDemoAgents();
    setupViewerSocket(this);

    // Sky gradient background
    const skyGfx = this.add.graphics();
    skyGfx.fillGradientStyle(0x1a2744, 0x1a2744, 0x2d4a7a, 0x2d4a7a, 1);
    skyGfx.fillRect(0, 0, this.sys.game.config.width, this.sys.game.config.height);
    skyGfx.setDepth(-100);

    // World container
    this.worldContainer = this.add.container(0, 0);
    this.worldContainer.setDepth(0);

    // Draw base tiles layer
    this.drawTiles();

    // Draw decorations bottom layer (flowers, benches)
    this.drawDecorationsBottom();

    // Draw buildings
    this.drawBuildings();

    // Lots overlay
    this.lotGraphics = this.add.graphics();
    this.lotGraphics.setDepth(100);
    this.drawLots();

    // Agent graphics will be drawn each frame
    this.agentGraphics = this.add.graphics();
    this.agentGraphics.setDepth(500);

    // Speech bubble graphics
    this.speechGraphics = this.add.graphics();
    this.speechGraphics.setDepth(600);

    // Draw decorations top layer (trees, lampposts) after buildings
    this.drawDecorationsTop();

    // Clouds
    this.createClouds();

    // Minimap
    this.setupMinimap();

    // Camera
    const centerAgent = this.agents[0];
    const cPos = toIso(centerAgent.x, centerAgent.y);
    this.cameras.main.centerOn(
      cPos.x + this.sys.game.config.width / 2,
      cPos.y + this.sys.game.config.height / 2 - 40
    );

    // Input: drag to pan
    this.input.on('pointerdown', (p) => { this._dragStart = { x: p.x, y: p.y, cx: this.cameras.main.scrollX, cy: this.cameras.main.scrollY }; });
    this.input.on('pointermove', (p) => {
      if (this._dragStart) {
        this.cameras.main.scrollX = this._dragStart.cx - (p.x - this._dragStart.x);
        this.cameras.main.scrollY = this._dragStart.cy - (p.y - this._dragStart.y);
      }
    });
    this.input.on('pointerup', () => { this._dragStart = null; });
    // Zoom
    this.input.on('wheel', (p, dx, dy) => {
      // Simple: don't zoom for now, just allow scrolling nuance
    });

    // Initial data fetch and polling
    setPollingActive(true);
    if (!window._moltvilleVisibilityHook) {
      document.addEventListener('visibilitychange', () => {
        setPollingActive(!document.hidden);
      });
      window._moltvilleVisibilityHook = true;
    }
  }

  drawTiles() {
    if (this.tileGraphics) {
      this.tileGraphics.destroy();
    }
    const gfx = this.add.graphics();
    gfx.setDepth(-50);
    this.tileGraphics = gfx;

    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const t = this.tileMap[y][x];
        const pos = toIso(x, y);
        const px = pos.x + this.sys.game.config.width / 2;
        const py = pos.y + this.sys.game.config.height / 2;

        this.drawTile(gfx, px, py, t, x, y);
      }
    }
  }

  drawTile(gfx, px, py, type, tx, ty) {
    const w = ISO_W;
    const h = ISO_H;
    // Diamond points: top, right, bottom, left
    const pts = [
      { x: px, y: py - h/2 },         // top
      { x: px + w/2, y: py },          // right
      { x: px, y: py + h/2 },          // bottom
      { x: px - w/2, y: py },          // left
    ];

    const { baseColor, edgeColor, detailColor } = resolveTileColors(type, tx, ty);

    // Fill diamond
    gfx.fillStyle(baseColor, 1);
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    gfx.lineTo(pts[1].x, pts[1].y);
    gfx.lineTo(pts[2].x, pts[2].y);
    gfx.lineTo(pts[3].x, pts[3].y);
    gfx.closePath();
    gfx.fillPath();

    // Edge highlight (top-left lighter)
    gfx.fillStyle(edgeColor, 0.4);
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    gfx.lineTo(pts[1].x, pts[1].y);
    gfx.lineTo(pts[2].x, pts[2].y);
    gfx.lineTo(pts[3].x, pts[3].y);
    gfx.closePath();
    // Only stroke, no fill for border
    gfx.lineStyle(1, edgeColor, 0.5);
    gfx.strokePath();

    // Road details: center line
    if (type === T.ROAD && detailColor) {
      gfx.fillStyle(detailColor, 0.3);
      gfx.beginPath();
      gfx.moveTo(pts[0].x, pts[0].y + 2);
      gfx.lineTo(pts[1].x - 2, pts[1].y);
      gfx.lineTo(pts[2].x, pts[2].y - 2);
      gfx.lineTo(pts[3].x + 2, pts[3].y);
      gfx.closePath();
      gfx.fillPath();
    }

    // Water shimmer effect
    if (type === T.WATER) {
      gfx.fillStyle(0x5dade2, 0.25);
      const shimX = (tx * 3) % 2 === 0 ? -3 : 3;
      gfx.fillRect(px + shimX - 4, py - 2, 8, 3);
    }
  }

  drawBuildings() {
    BUILDINGS.forEach(b => {
      if (b.type === 'plaza' || b.type === 'garden') {
        this.drawPlazaOrGarden(b);
      } else {
        this.drawBuilding(b);
      }
    });
  }

  renderNewBuildings(serverBuildings) {
    serverBuildings.forEach(b => {
      const visual = BUILDINGS.find(item => item.id === b.id);
      if (!visual) return;
      if (visual.type === 'plaza' || visual.type === 'garden') {
        this.drawPlazaOrGarden(visual);
      } else {
        this.drawBuilding(visual);
      }
    });
  }

  drawLots() {
    if (!this.lotGraphics) return;
    this.lotGraphics.clear();
    this.lotGraphics.lineStyle(1, 0xf1c40f, 0.7);
    LOTS.forEach(lot => {
      for (let dy = 0; dy < lot.height; dy++) {
        for (let dx = 0; dx < lot.width; dx++) {
          const tx = lot.x + dx;
          const ty = lot.y + dy;
          const pos = toIso(tx, ty);
          const px = pos.x + this.sys.game.config.width / 2;
          const py = pos.y + this.sys.game.config.height / 2;
          this.drawLotDiamond(px, py);
        }
      }
    });
  }

  drawLotDiamond(px, py) {
    const w = ISO_W;
    const h = ISO_H;
    this.lotGraphics.strokePoints([
      { x: px, y: py - h / 2 },
      { x: px + w / 2, y: py },
      { x: px, y: py + h / 2 },
      { x: px - w / 2, y: py },
      { x: px, y: py - h / 2 }
    ], false, true);
  }

  drawPlazaOrGarden(b) {
    const gfx = this.add.graphics();
    // Plaza: draw stone/garden tiles over the area
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const tx = b.x + dx;
        const ty = b.y + dy;
        const pos = toIso(tx, ty);
        const px = pos.x + this.sys.game.config.width / 2;
        const py = pos.y + this.sys.game.config.height / 2;

        const isPlaza = b.type === 'plaza';
        this.drawTile(gfx, px, py, isPlaza ? T.STONE : T.GRASS, tx, ty);
      }
    }

    // Fountain at center of plaza
    if (b.type === 'plaza') {
      const cx = b.x + Math.floor(b.w / 2);
      const cy = b.y + Math.floor(b.h / 2);
      const pos = toIso(cx, cy);
      const px = pos.x + this.sys.game.config.width / 2;
      const py = pos.y + this.sys.game.config.height / 2;

      // Base
      gfx.fillStyle(0x95a5a6, 1);
      gfx.beginPath();
      gfx.moveTo(px, py - 8);
      gfx.lineTo(px + 12, py - 2);
      gfx.lineTo(px, py + 6);
      gfx.lineTo(px - 12, py - 2);
      gfx.closePath();
      gfx.fillPath();

      // Water basin
      gfx.fillStyle(0x2980b9, 1);
      gfx.beginPath();
      gfx.moveTo(px, py - 5);
      gfx.lineTo(px + 8, py - 1);
      gfx.lineTo(px, py + 3);
      gfx.lineTo(px - 8, py - 1);
      gfx.closePath();
      gfx.fillPath();

      // Center pillar
      gfx.fillStyle(0xbdc3c7, 1);
      gfx.fillRect(px - 2, py - 10, 4, 8);

      // Pillar top
      gfx.fillStyle(0xd5dbdb, 1);
      gfx.fillCircle(px, py - 11, 4);
    }
  }

  drawBuilding(b) {
    const gfx = this.add.graphics();
    // Get the isometric position of the building's top-left corner
    // In isometric, we draw from the "back" corner
    // The building occupies tiles from (b.x, b.y) to (b.x+b.w-1, b.y+b.h-1)
    // The "back" corner in iso is the top-left of the tile grid (min x, min y)
    // We want to draw the building footprint, then walls, then roof

    const stories = b.stories || 1;
    const storyH = 14;
    const totalH = stories * storyH;

    // Calculate the 4 corners of the building footprint in iso
    // Top-left tile: (b.x, b.y), Top-right: (b.x+b.w, b.y), Bottom-right: (b.x+b.w, b.y+b.h), Bottom-left: (b.x, b.y+b.h)
    const topLeft     = toIso(b.x,      b.y);
    const topRight    = toIso(b.x + b.w, b.y);
    const bottomRight = toIso(b.x + b.w, b.y + b.h);
    const bottomLeft  = toIso(b.x,      b.y + b.h);

    const ox = this.sys.game.config.width / 2;
    const oy = this.sys.game.config.height / 2;

    const tl = { x: topLeft.x + ox,     y: topLeft.y + oy };
    const tr = { x: topRight.x + ox,    y: topRight.y + oy };
    const br = { x: bottomRight.x + ox, y: bottomRight.y + oy };
    const bl = { x: bottomLeft.x + ox,  y: bottomLeft.y + oy };

    // Depth: use the bottom-most point for sorting (we just draw in order for simplicity)

    // === SHADOW ===
    gfx.fillStyle(0x000000, 0.15);
    gfx.beginPath();
    gfx.moveTo(tr.x + 4, tr.y + totalH + 2);
    gfx.lineTo(br.x + 4, br.y + totalH + 2);
    gfx.lineTo(br.x, br.y + totalH);
    gfx.lineTo(tr.x, tr.y + totalH);
    gfx.closePath();
    gfx.fillPath();

    // === GROUND FOOTPRINT (stone base) ===
    gfx.fillStyle(0x5d6d7e, 1);
    gfx.beginPath();
    gfx.moveTo(tl.x, tl.y);
    gfx.lineTo(tr.x, tr.y);
    gfx.lineTo(br.x, br.y);
    gfx.lineTo(bl.x, bl.y);
    gfx.closePath();
    gfx.fillPath();

    // === RIGHT WALL (facing camera - right side) ===
    // This is the wall from tr -> br, going down by totalH
    const wallRightColor = Phaser.Display.Color.ValueToColor(b.color);
    // Darken for right wall
    const rightWallColor = 0x000000 | (
      (Math.max(0, (wallRightColor.r - 40)) << 16) |
      (Math.max(0, (wallRightColor.g - 30)) << 8) |
      Math.max(0, (wallRightColor.b - 40))
    );

    gfx.fillStyle(rightWallColor, 1);
    gfx.beginPath();
    gfx.moveTo(tr.x, tr.y - totalH);
    gfx.lineTo(br.x, br.y - totalH);
    gfx.lineTo(br.x, br.y);
    gfx.lineTo(tr.x, tr.y);
    gfx.closePath();
    gfx.fillPath();

    // === LEFT WALL (facing camera - left side) ===
    // From bl -> tl, going up by totalH - actually from tl down
    // Left wall: tl -> bl, drawn with offset
    const leftWallColor = 0x000000 | (
      (Math.max(0, (wallRightColor.r - 20)) << 16) |
      (Math.max(0, (wallRightColor.g - 15)) << 8) |
      Math.max(0, (wallRightColor.b - 20))
    );

    gfx.fillStyle(leftWallColor, 1);
    gfx.beginPath();
    gfx.moveTo(bl.x, bl.y - totalH);
    gfx.lineTo(tl.x, tl.y - totalH);
    gfx.lineTo(tl.x, tl.y);
    gfx.lineTo(bl.x, bl.y);
    gfx.closePath();
    gfx.fillPath();

    // === ROOF (top face) ===
    gfx.fillStyle(b.roof, 1);
    gfx.beginPath();
    gfx.moveTo(tl.x, tl.y - totalH);
    gfx.lineTo(tr.x, tr.y - totalH);
    gfx.lineTo(br.x, br.y - totalH);
    gfx.lineTo(bl.x, bl.y - totalH);
    gfx.closePath();
    gfx.fillPath();

    // Roof edge highlight
    gfx.lineStyle(1.5, b.accent, 0.6);
    gfx.beginPath();
    gfx.moveTo(tl.x, tl.y - totalH);
    gfx.lineTo(tr.x, tr.y - totalH);
    gfx.moveTo(tl.x, tl.y - totalH);
    gfx.lineTo(bl.x, bl.y - totalH);
    gfx.strokePath();

    // === WINDOWS on right wall ===
    this.drawWindows(gfx, tr, br, totalH, stories, b, 'right');
    // === WINDOWS on left wall ===
    this.drawWindows(gfx, tl, bl, totalH, stories, b, 'left');

    // === DOOR on right wall (bottom center) ===
    if (b.stories >= 1) {
      this.drawDoor(gfx, tr, br, b);
    }

    // === CHIMNEYS for certain types ===
    if (b.type === 'house' || b.type === 'inn' || b.type === 'cafe') {
      // Chimney on back-right of roof
      const chimneyX = tl.x + (tr.x - tl.x) * 0.3;
      const chimneyY = tl.y - totalH + (tr.y - tl.y) * 0.3;
      gfx.fillStyle(0x7f8c8d, 1);
      gfx.fillRect(chimneyX - 3, chimneyY - 12, 6, 10);
      gfx.fillStyle(0x5d6d7e, 1);
      gfx.fillRect(chimneyX - 4, chimneyY - 13, 8, 3);
    }

    // === TALL BUILDINGS: antenna or spire ===
    if (b.stories >= 3) {
      const topCenterX = (tl.x + tr.x + bl.x + br.x) / 4;
      const topCenterY = (tl.y + tr.y + bl.y + br.y) / 4 - totalH;
      gfx.lineStyle(2, 0x95a5a6, 1);
      gfx.beginPath();
      gfx.moveTo(topCenterX, topCenterY);
      gfx.lineTo(topCenterX, topCenterY - 18);
      gfx.strokePath();
      // Red light at top
      gfx.fillStyle(0xe74c3c, 1);
      gfx.fillCircle(topCenterX, topCenterY - 19, 3);
    }

    // === BELL TOWER: special spire ===
    if (b.type === 'tower') {
      const topCenterX = (tl.x + tr.x + bl.x + br.x) / 4;
      const topCenterY = (tl.y + tr.y + bl.y + br.y) / 4 - totalH;
      // Spire
      gfx.fillStyle(0xf39c12, 1);
      gfx.beginPath();
      gfx.moveTo(topCenterX, topCenterY - 28);
      gfx.lineTo(topCenterX - 8, topCenterY - 4);
      gfx.lineTo(topCenterX + 8, topCenterY - 4);
      gfx.closePath();
      gfx.fillPath();
      // Bell
      gfx.fillStyle(0xf1c40f, 1);
      gfx.fillCircle(topCenterX, topCenterY - 6, 5);
    }

    // === CHAPEL: cross ===
    if (b.type === 'chapel') {
      const topCenterX = (tl.x + tr.x + bl.x + br.x) / 4;
      const topCenterY = (tl.y + tr.y + bl.y + br.y) / 4 - totalH;
      gfx.lineStyle(3, 0xf39c12, 1);
      gfx.beginPath();
      gfx.moveTo(topCenterX, topCenterY - 22);
      gfx.lineTo(topCenterX, topCenterY - 6);
      gfx.moveTo(topCenterX - 5, topCenterY - 16);
      gfx.lineTo(topCenterX + 5, topCenterY - 16);
      gfx.strokePath();
    }

    // Name label
    const centerIso = toIso(b.x + b.w/2, b.y + b.h/2);
    const labelX = centerIso.x + this.sys.game.config.width / 2;
    const labelY = centerIso.y + this.sys.game.config.height / 2 - totalH - 16;

    const label = this.add.text(labelX, labelY, b.name, {
      fontSize: '9px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 2,
      align: 'center'
    }).setOrigin(0.5, 1);
    label.setDepth(100);
  }

  drawWindows(gfx, corner1, corner2, totalH, stories, b, side) {
    // Interpolate along the wall edge and draw small windows
    const numCols = Math.max(1, Math.floor((side === 'right' ? b.w : b.h) * 1.2));
    const numRows = stories;

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const t = (col + 0.7) / (numCols + 0.4);
        const rowT = (row + 0.4) / (numRows + 0.2);

        // Wall goes from corner1 (top) to corner2 (bottom) horizontally
        // and from y - totalH to y vertically
        const wx = corner1.x + (corner2.x - corner1.x) * t;
        const wy = corner1.y + (corner2.y - corner1.y) * t;

        const wallY = wy - totalH * (1 - rowT * 0.7);

        // Window rectangle
        const ww = 5, wh = 6;
        gfx.fillStyle(0x2c3e50, 1);
        gfx.fillRect(wx - ww/2, wallY - wh/2, ww, wh);

        // Window light (warm glow)
        gfx.fillStyle(0xf39c12, 0.7);
        gfx.fillRect(wx - ww/2 + 1, wallY - wh/2 + 1, ww - 2, wh - 2);

        // Window cross
        gfx.lineStyle(1, 0x7f8c8d, 0.8);
        gfx.beginPath();
        gfx.moveTo(wx, wallY - wh/2);
        gfx.lineTo(wx, wallY + wh/2);
        gfx.moveTo(wx - ww/2, wallY);
        gfx.lineTo(wx + ww/2, wallY);
        gfx.strokePath();
      }
    }
  }

  drawDoor(gfx, tr, br, b) {
    // Door at bottom-center of right wall
    const t = 0.55;
    const dx = tr.x + (br.x - tr.x) * t;
    const dy = tr.y + (br.y - tr.y) * t;

    // Door frame
    gfx.fillStyle(0x2c3e50, 1);
    gfx.fillRect(dx - 5, dy - 12, 10, 12);

    // Door color
    gfx.fillStyle(b.accent, 1);
    gfx.fillRect(dx - 4, dy - 11, 8, 10);

    // Door knob
    gfx.fillStyle(0xf39c12, 1);
    gfx.fillCircle(dx + 1, dy - 5, 1.5);
  }

  drawDecorationsBottom() {
    const gfx = this.add.graphics();
    gfx.setDepth(-20);

    this.decorations.forEach(d => {
      if (d.type !== 'flower') return;
      const decorationColors = resolveDecorationColors(d.x, d.y, {
        foliage: [0x27ae60, 0x2ecc71, 0x1e8449],
        flower: d.color,
        lampGlow: 0xf39c12,
        bench: 0xa67c52
      });
      const pos = toIso(d.x, d.y);
      const px = pos.x + this.sys.game.config.width / 2;
      const py = pos.y + this.sys.game.config.height / 2;

      // Flower: small colored dots
      gfx.fillStyle(decorationColors.flower, 1);
      gfx.fillCircle(px - 2, py - 1, 2);
      gfx.fillCircle(px + 3, py + 1, 1.5);
      gfx.fillStyle(decorationColors.foliage[1], 1);
      gfx.fillCircle(px, py + 2, 1.5);
    });
  }

  drawDecorationsTop() {
    // Trees and lampposts - these go on top of buildings at certain depths
    // For simplicity, draw all trees and lamps after buildings
    this.decorations.forEach(d => {
      if (d.type === 'tree') this.drawTree(d);
      else if (d.type === 'lamp') this.drawLamp(d);
      else if (d.type === 'bench') this.drawBench(d);
    });
  }

  drawTree(d) {
    const pos = toIso(d.x, d.y);
    const px = pos.x + this.sys.game.config.width / 2;
    const py = pos.y + this.sys.game.config.height / 2;

    const gfx = this.add.graphics();
    gfx.setDepth(d.y * 2 + 10); // depth sort by y

    // Trunk
    const trunkColors = [0x6b4226, 0x5a3820, 0x7a4e2d];
    gfx.fillStyle(trunkColors[d.variant], 1);
    gfx.fillRect(px - 3, py - 2, 6, 14);

    // Foliage
    const decorationColors = resolveDecorationColors(d.x, d.y, {
      foliage: [0x27ae60, 0x2ecc71, 0x1e8449],
      flower: 0xe74c3c,
      lampGlow: 0xf39c12,
      bench: 0xa67c52
    });
    const colors = decorationColors.foliage;

    // Bottom circle
    gfx.fillStyle(colors[0], 1);
    gfx.fillCircle(px, py - 10, 11);
    // Middle
    gfx.fillStyle(colors[1], 1);
    gfx.fillCircle(px - 4, py - 16, 8);
    gfx.fillCircle(px + 4, py - 16, 8);
    // Top
    gfx.fillStyle(colors[2], 1);
    gfx.fillCircle(px, py - 22, 7);

    // Highlight
    gfx.fillStyle(colors[1], 0.4);
    gfx.fillCircle(px - 2, py - 18, 4);
  }

  drawLamp(d) {
    const pos = toIso(d.x, d.y);
    const px = pos.x + this.sys.game.config.width / 2;
    const py = pos.y + this.sys.game.config.height / 2;

    const gfx = this.add.graphics();
    gfx.setDepth(d.y * 2 + 5);
    const decorationColors = resolveDecorationColors(d.x, d.y, {
      foliage: [0x27ae60, 0x2ecc71, 0x1e8449],
      flower: 0xe74c3c,
      lampGlow: 0xf39c12,
      bench: 0xa67c52
    });

    // Pole
    gfx.fillStyle(0x5d6d7e, 1);
    gfx.fillRect(px - 1.5, py - 24, 3, 22);

    // Base
    gfx.fillStyle(0x4a4a5a, 1);
    gfx.fillRect(px - 3, py - 3, 6, 3);

    // Lamp head
    gfx.fillStyle(0x7f8c8d, 1);
    gfx.fillRect(px - 4, py - 26, 8, 3);

    // Light glow
    gfx.fillStyle(decorationColors.lampGlow, 0.9);
    gfx.fillCircle(px, py - 26, 3);
    gfx.fillStyle(decorationColors.lampGlow, 0.2);
    gfx.fillCircle(px, py - 26, 7);
  }

  drawBench(d) {
    const pos = toIso(d.x, d.y);
    const px = pos.x + this.sys.game.config.width / 2;
    const py = pos.y + this.sys.game.config.height / 2;

    const gfx = this.add.graphics();
    gfx.setDepth(d.y * 2 + 3);
    const decorationColors = resolveDecorationColors(d.x, d.y, {
      foliage: [0x27ae60, 0x2ecc71, 0x1e8449],
      flower: 0xe74c3c,
      lampGlow: 0xf39c12,
      bench: 0xa67c52
    });

    // Bench seat
    gfx.fillStyle(decorationColors.bench, 1);
    if (d.variant === 0) {
      // Horizontal bench
      gfx.fillRect(px - 8, py - 2, 16, 4);
      // Backrest
      gfx.fillStyle(0x8b6340, 1);
      gfx.fillRect(px - 8, py - 6, 16, 3);
      // Legs
      gfx.fillStyle(0x5d6d7e, 1);
      gfx.fillRect(px - 7, py + 2, 3, 4);
      gfx.fillRect(px + 4, py + 2, 3, 4);
    } else {
      // Vertical bench (rotated feel)
      gfx.fillRect(px - 4, py - 4, 8, 8);
      gfx.fillStyle(0x8b6340, 1);
      gfx.fillRect(px - 5, py - 6, 3, 8);
      gfx.fillStyle(0x5d6d7e, 1);
      gfx.fillRect(px - 3, py + 3, 3, 4);
      gfx.fillRect(px + 1, py + 3, 3, 4);
    }
  }

  createClouds() {
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      this.clouds.push({
        x: Math.random() * 2000 - 500,
        y: Math.random() * 200 - 100,
        w: 80 + Math.random() * 120,
        speed: 0.1 + Math.random() * 0.15,
        opacity: 0.15 + Math.random() * 0.15
      });
    }
  }

  setupMinimap() {
    this.minimapCanvas = document.getElementById('minimap');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
  }

  drawMinimap() {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(0, 0, w, h);

    const scaleX = w / WORLD_W;
    const scaleY = h / WORLD_H;

    // Draw tile types
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const t = this.tileMap[y][x];
        const { baseColor } = resolveTileColors(t, x, y);
        ctx.fillStyle = `#${baseColor.toString(16).padStart(6, '0')}`;
        ctx.fillRect(x * scaleX, y * scaleY, scaleX, scaleY);
      }
    }

    // Buildings
    BUILDINGS.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x * scaleX, b.y * scaleY, b.w * scaleX, b.h * scaleY);
    });

    // Lots (outlined)
    ctx.strokeStyle = 'rgba(241,196,15,0.8)';
    LOTS.forEach(lot => {
      ctx.strokeRect(lot.x * scaleX, lot.y * scaleY, lot.width * scaleX, lot.height * scaleY);
    });

    // Trees
    this.decorations.filter(d => d.type === 'tree').forEach(d => {
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(d.x * scaleX - 0.5, d.y * scaleY - 0.5, scaleX + 1, scaleY + 1);
    });

    // Agents
    this.agents.forEach(a => {
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.arc(a.x * scaleX, a.y * scaleY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Viewport rectangle
    const cam = this.cameras.main;
    const vpX = (cam.scrollX) / (WORLD_W * ISO_W / 2) * w;
    const vpY = (cam.scrollY) / (WORLD_H * ISO_H / 2) * h;
    const vpW = (cam.width / (WORLD_W * ISO_W / 2)) * w;
    const vpH = (cam.height / (WORLD_H * ISO_H / 2)) * h;
    ctx.strokeStyle = 'rgba(168,196,255,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }

  // ============================================================
  // AGENT MOVEMENT & AI
  // ============================================================
  updateAgents(dt) {
    const dtSec = dt / 1000;

    // Decrement timers for both live and simulated data
    this.agents.forEach(agent => {
      agent.idleTimer -= dtSec;
      if (agent.talkTimer > 0) {
        agent.talkTimer -= dtSec;
        if (agent.talkTimer <= 0) {
          agent.state = 'idle';
          agent.talkingTo = null;
          agent.lastSpeech = null;
          if (agent._speechText) agent._speechText.setVisible(false);
        }
      } else if (agent._speechText && agent._speechText.visible) {
        agent._speechText.setVisible(false);
      }
    });

    if (WORLD_CONTEXT.useLiveData) {
      this.agents.forEach(agent => {
        if (agent.progress < 1) {
          agent.walkCycle += dtSec * 8;
        }
      });
      return;
    }

    this.agents.forEach(agent => {
      // If reached target, pick new behavior
      if (agent.progress >= 1) {
        agent.state = 'idle';

        if (agent.idleTimer <= 0) {
          // Pick a random target: another agent's position, a building entrance, or random walkable
          const target = this.pickTarget(agent);
          if (target) {
            agent.tx = target.x;
            agent.ty = target.y;
            if (agent.tx !== agent.x || agent.ty !== agent.y) {
              agent.state = 'walking';
              agent.progress = 0;
              // Reset idle timer
              agent.idleTimer = 3 + Math.random() * 8;
            }
          }
        }

        // Check for nearby agents to talk to
        const nearby = this.agents.filter(other =>
          other.id !== agent.id &&
          Math.abs(other.x - agent.x) <= 1.5 &&
          Math.abs(other.y - agent.y) <= 1.5 &&
          other.talkTimer <= 0 &&
          other.state !== 'walking' &&
          other.state !== 'talking'
        );

        if (!WORLD_CONTEXT.useLiveData && nearby.length > 0 && Math.random() < 0.05 && agent.talkTimer <= 0 && agent.state !== 'talking') {
          const target = nearby[0];
          agent.talkTimer = 5 + Math.random() * 2;
          target.talkTimer = 5 + Math.random() * 2;
          agent.state = 'talking';
          target.state = 'talking';

          // Store partner
          agent.talkingTo = target.id;
          target.talkingTo = agent.id;

          // Face each other
          const adx = target.x - agent.x;
          const ady = target.y - agent.y;
          if (Math.abs(adx) > Math.abs(ady)) {
            agent.facing = adx > 0 ? 'right' : 'left';
            target.facing = adx > 0 ? 'left' : 'right';
          } else {
            agent.facing = ady > 0 ? 'down' : 'up';
            target.facing = ady > 0 ? 'up' : 'down';
          }

          // Generate chat message
          const messages = [
            `Hi ${target.name}! How's your day?`,
            `Nice weather today, don't you think?`,
            `Have you been to the café lately?`,
            `I was just exploring the library...`,
            `Did you see the new flowers in the plaza?`,
            `Want to grab something at the market?`,
            `The sunset looks amazing today!`,
            `I've been thinking about visiting the garden.`,
            `Hey ${target.name}, fancy meeting you here!`,
            `The city looks beautiful this time of day.`,
          ];
          const msg = messages[Math.floor(Math.random() * messages.length)];
          this.addChatMessage(agent.name, msg);
        }
      }

      // Interpolate movement
      if (agent.progress < 1) {
        agent.progress += dtSec * 1.2; // speed
        if (agent.progress >= 1) {
          agent.progress = 1;
          agent.x = agent.tx;
          agent.y = agent.ty;
          agent.state = 'idle';
        }

        // Walk cycle animation
        agent.walkCycle += dtSec * 8;

        // Update facing
        const dx = agent.tx - agent.x;
        const dy = agent.ty - agent.y;
        if (Math.abs(dx) > Math.abs(dy)) {
          agent.facing = dx > 0 ? 'right' : 'left';
        } else {
          agent.facing = dy > 0 ? 'down' : 'up';
        }
      }
    });
  }

  pickTarget(agent) {
    // Options: walk to a nearby road tile, a building entrance, or another agent
    const choices = [];
    const searchRadius = 8;

    // Road tiles nearby
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const tx = Math.floor(agent.x + dx);
        const ty = Math.floor(agent.y + dy);
        if (tx >= 0 && tx < WORLD_W && ty >= 0 && ty < WORLD_H) {
          const t = this.tileMap[ty][tx];
          if (t === T.ROAD || t === T.PATH || t === T.GRASS) {
            // Check if another agent is already targeting or standing on this tile to avoid clumping
            const isOccupied = this.agents.some(other =>
              other.id !== agent.id &&
              ((Math.floor(other.x) === tx && Math.floor(other.y) === ty) ||
               (Math.floor(other.tx) === tx && Math.floor(other.ty) === ty))
            );

            if (!isOccupied) {
              choices.push({ x: tx, y: ty });
            }
          }
        }
      }
    }

    if (choices.length === 0) {
        // Fallback to any walkable if all preferred are occupied
        return { x: Math.floor(Math.random() * WORLD_W), y: Math.floor(Math.random() * WORLD_H) };
    }

    // Prioritize tiles further away to encourage spreading out
    choices.sort((a, b) => {
        const distA = Math.abs(a.x - agent.x) + Math.abs(a.y - agent.y);
        const distB = Math.abs(b.x - agent.x) + Math.abs(b.y - agent.y);
        return distB - distA;
    });

    // Pick from the top 20% furthest tiles
    const topCount = Math.max(1, Math.floor(choices.length * 0.2));
    return choices[Math.floor(Math.random() * topCount)];
  }

  addChatMessage(name, msg) {
    const now = new Date();
    this.chatLog.push({ name, msg, time: now });
    if (this.chatLog.length > 15) this.chatLog.shift();

    // Sync with agent speech bubble
    const agent = this.agents.find(a => a.name === name);
    if (agent) {
      agent.lastSpeech = msg;
      agent.talkTimer = 6;
      agent.state = 'talking';
      // Store timestamp to auto-clear if needed
      agent.lastSpeechTime = now.getTime();
    }

    const chatEl = document.getElementById('chat-log');
    chatEl.innerHTML = this.chatLog.map(c =>
      `<div class="chat-msg"><span class="name">${c.name}:</span> ${c.msg} <span class="time">${c.time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>`
    ).join('');
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // ============================================================
  // RENDERING AGENTS
  // ============================================================
  renderAgents() {
    const gfx = this.agentGraphics;
    gfx.clear();
    const speechGfx = this.speechGraphics;
    speechGfx.clear();
    this._crowdCounts = new Map();

    // Draw conversation lines
    if (WORLD_CONTEXT.activeConversations && WORLD_CONTEXT.activeConversations.length > 0) {
      WORLD_CONTEXT.activeConversations.forEach(conv => {
        const a1 = this.agents.find(a => a.id === conv.participants[0]);
        const a2 = this.agents.find(a => a.id === conv.participants[1]);
        if (a1 && a2) {
          // Calculate screen positions
          let x1, y1, x2, y2;
          if (a1.progress < 1) {
            x1 = a1.x + (a1.tx - a1.x) * a1.progress; y1 = a1.y + (a1.ty - a1.y) * a1.progress;
          } else { x1 = a1.x; y1 = a1.y; }
          if (a2.progress < 1) {
            x2 = a2.x + (a2.tx - a2.x) * a2.progress; y2 = a2.y + (a2.ty - a2.y) * a2.progress;
          } else { x2 = a2.x; y2 = a2.y; }

          const p1 = toIso(x1, y1);
          const p2 = toIso(x2, y2);
          const s1 = { x: p1.x + this.sys.game.config.width / 2, y: p1.y + this.sys.game.config.height / 2 };
          const s2 = { x: p2.x + this.sys.game.config.width / 2, y: p2.y + this.sys.game.config.height / 2 };

          speechGfx.fillStyle(0x22c55e, 0.18);
          speechGfx.fillCircle(s1.x, s1.y - 10, 18);
          speechGfx.fillCircle(s2.x, s2.y - 10, 18);
          speechGfx.lineStyle(2.6, 0x4ade80, 0.75);
          speechGfx.beginPath();
          speechGfx.moveTo(s1.x, s1.y - 15);
          speechGfx.lineTo(s2.x, s2.y - 15);
          speechGfx.strokePath();
        }
      });
    }

    // Draw local conversation lines (random talks)
    if (!WORLD_CONTEXT.useLiveData) {
      this.agents.forEach(a1 => {
        if (a1.talkingTo && a1.state === 'talking') {
          const a2 = this.agents.find(a => a.id === a1.talkingTo);
          if (a2 && a2.talkingTo === a1.id && a1.id < a2.id) {
            const p1 = toIso(a1.progress < 1 ? a1.x + (a1.tx - a1.x) * a1.progress : a1.x, a1.progress < 1 ? a1.y + (a1.ty - a1.y) * a1.progress : a1.y);
            const p2 = toIso(a2.progress < 1 ? a2.x + (a2.tx - a2.x) * a2.progress : a2.x, a2.progress < 1 ? a2.y + (a2.ty - a2.y) * a2.progress : a2.y);
            const s1 = { x: p1.x + this.sys.game.config.width / 2, y: p1.y + this.sys.game.config.height / 2 };
            const s2 = { x: p2.x + this.sys.game.config.width / 2, y: p2.y + this.sys.game.config.height / 2 };

            speechGfx.lineStyle(2, 0xffd700, 0.4);
            speechGfx.beginPath();
            speechGfx.moveTo(s1.x, s1.y - 15);
            speechGfx.lineTo(s2.x, s2.y - 15);
            speechGfx.strokePath();
          }
        }
      });
    }

    // Sort agents by y for depth
    const sorted = [...this.agents].sort((a, b) => {
      const ay = a.progress < 1 ? a.y + (a.ty - a.y) * a.progress : a.y;
      const by = b.progress < 1 ? b.y + (b.ty - b.y) * b.progress : b.y;
      return ay - by;
    });

    const activeIds = new Set();
    sorted.forEach(agent => {
      // Current interpolated position
      let curX, curY;
      if (agent.progress < 1) {
        curX = agent.x + (agent.tx - agent.x) * agent.progress;
        curY = agent.y + (agent.ty - agent.y) * agent.progress;
      } else {
        curX = agent.x;
        curY = agent.y;
      }

      const building = agent.currentBuilding
        ? BUILDINGS.find(b => b.id === agent.currentBuilding)
        : null;
      const inBuilding = Boolean(building);
      if (inBuilding) {
        curX = building.x + building.w / 2;
        curY = building.y + building.h / 2;
      }

      // Visual crowd dispersion (avoid pile-up on same tile)
      const tileKey = `${Math.round(curX)}:${Math.round(curY)}`;
      const crowdIndex = (this._crowdCounts?.get(tileKey) || 0);
      if (!this._crowdCounts) this._crowdCounts = new Map();
      this._crowdCounts.set(tileKey, crowdIndex + 1);
      const angle = (crowdIndex * 137.5) * (Math.PI / 180);
      const radius = Math.min(6, 2 + crowdIndex);
      const spreadX = Math.cos(angle) * radius * 0.15;
      const spreadY = Math.sin(angle) * radius * 0.15;

      const pos = toIso(curX + spreadX, curY + spreadY);
      const px = pos.x + this.sys.game.config.width / 2;
      const py = pos.y + this.sys.game.config.height / 2;

      const bodyAlpha = inBuilding ? 0.35 : 1;
      const limbAlpha = inBuilding ? 0.25 : 0.85;
      const shadowAlpha = inBuilding ? 0.12 : 0.25;

      // Walk cycle bob
      const bob = agent.state === 'walking' ? Math.sin(agent.walkCycle) * 3 : 0;

      // Shadow
      if (agent.talkTimer > 0) {
        gfx.fillStyle(agent.color, inBuilding ? 0.18 : 0.3);
        gfx.fillEllipse(px, py + 4, 18, 7);
      } else {
        gfx.fillStyle(0x000000, shadowAlpha);
        gfx.fillEllipse(px, py + 4, 14, 5);
      }

      // Body (simple character: head + body)
      const bodyY = py - 6 + bob;

      // Legs
      if (agent.state === 'walking') {
        const legSwing = Math.sin(agent.walkCycle) * 3;
        gfx.fillStyle(agent.color, bodyAlpha);
        // Left leg
        gfx.fillRect(px - 4, bodyY + 8, 3, 6 + legSwing);
        // Right leg
        gfx.fillRect(px + 1, bodyY + 8, 3, 6 - legSwing);
      } else {
        gfx.fillStyle(agent.color, bodyAlpha);
        gfx.fillRect(px - 4, bodyY + 8, 3, 6);
        gfx.fillRect(px + 1, bodyY + 8, 3, 6);
      }

      // Body/torso
      gfx.fillStyle(agent.color, bodyAlpha);
      gfx.fillRect(px - 5, bodyY + 2, 10, 7);

      // Arms
      if (agent.state === 'walking') {
        const armSwing = Math.sin(agent.walkCycle) * 2;
        gfx.fillStyle(agent.color, limbAlpha);
        gfx.fillRect(px - 7, bodyY + 3, 2, 5 - armSwing);
        gfx.fillRect(px + 5, bodyY + 3, 2, 5 + armSwing);
      } else if (agent.state === 'talking') {
        // Subtle talking animation: wiggle arms
        const wiggle = Math.sin(Date.now() * 0.01) * 3;
        gfx.fillStyle(agent.color, limbAlpha);
        gfx.fillRect(px - 7, bodyY + 1 + wiggle, 2, 5);
        gfx.fillRect(px + 5, bodyY + 1 - wiggle, 2, 5);
      } else {
        gfx.fillStyle(agent.color, limbAlpha);
        gfx.fillRect(px - 7, bodyY + 3, 2, 5);
        gfx.fillRect(px + 5, bodyY + 3, 2, 5);
      }

      // Head
      gfx.fillStyle(0xf5cba7, bodyAlpha); // skin
      gfx.fillCircle(px, bodyY - 1, 6);

      // Hair (top of head, color-coded)
      gfx.fillStyle(agent.color, bodyAlpha);
      gfx.fillRect(px - 5, bodyY - 7, 10, 4);

      // Eyes
      gfx.fillStyle(0x2c3e50, bodyAlpha);
      if (agent.facing === 'down' || agent.facing === 'right') {
        gfx.fillCircle(px - 2, bodyY - 1, 1.2);
        gfx.fillCircle(px + 2, bodyY - 1, 1.2);
      } else if (agent.facing === 'up') {
        // Eyes not visible from behind
      } else { // left
        gfx.fillCircle(px - 2, bodyY - 1, 1.2);
        gfx.fillCircle(px + 2, bodyY - 1, 1.2);
      }

      const isSpeaking = agent.talkTimer > 0 && agent.lastSpeech;
      const isSelected = this.selectedAgentId === agent.id;
      const isHovered = this.hoveredAgentId === agent.id;
      const isFocused = isSpeaking || isSelected || isHovered;

      // Focus ring
      if (isFocused) {
        gfx.lineStyle(2, agent.color, 0.9);
        gfx.strokeEllipse(px, py + 3, 22, 10);
      }

      // Name tag (declutter)
      if (this.showAllLabels || isFocused) {
        gfx.fillStyle(0x000000, 0.7);
        const nameW = agent.name.length * 6 + 12;
        gfx.fillRect(px - nameW/2, bodyY - 21, nameW, 14);
        gfx.fillStyle(agent.color, 1);
        gfx.fillRect(px - nameW/2, bodyY - 22, nameW, 3);

        if (!agent._nameText) {
          agent._nameText = this.add.text(0, 0, agent.name, {
            fontSize: '11px', color: '#fff', stroke: '#000', strokeThickness: 1.5, fontWeight: 'bold'
          }).setOrigin(0.5, 1).setDepth(601);
        }
        agent._nameText.setText(agent.name).setPosition(px, bodyY - 10).setVisible(true);
      } else if (agent._nameText) {
        agent._nameText.setVisible(false);
      }

      // Speech bubble (speaking or selected)
      if ((isSpeaking || (isSelected && agent.lastSpeech)) && agent.lastSpeech) {
        const bubbleW = Math.min(200, Math.max(70, agent.lastSpeech.length * 7.5 + 20));
        const bubbleH = (agent.lastSpeech.length > 30) ? 46 : 28;
        const bx = px;
        const by = bodyY - 45;

        // Background with agent color border
        speechGfx.fillStyle(0xffffff, 0.98);
        speechGfx.lineStyle(2, agent.color, 1);
        speechGfx.fillRoundedRect(bx - bubbleW/2, by - bubbleH/2, bubbleW, bubbleH, 10);
        speechGfx.strokeRoundedRect(bx - bubbleW/2, by - bubbleH/2, bubbleW, bubbleH, 10);

        // Tail
        speechGfx.fillStyle(0xffffff, 1);
        speechGfx.beginPath();
        speechGfx.moveTo(bx - 8, by + bubbleH/2);
        speechGfx.lineTo(px, by + bubbleH/2 + 10);
        speechGfx.lineTo(bx + 8, by + bubbleH/2);
        speechGfx.closePath();
        speechGfx.fillPath();

        // Tail border
        speechGfx.lineStyle(2, agent.color, 1);
        speechGfx.beginPath();
        speechGfx.moveTo(bx - 8, by + bubbleH/2);
        speechGfx.lineTo(px, by + bubbleH/2 + 10);
        speechGfx.lineTo(bx + 8, by + bubbleH/2);
        speechGfx.strokePath();

        if (!agent._speechText) {
          agent._speechText = this.add.text(bx, by, agent.lastSpeech, {
            fontSize: '11px', color: '#000', fontWeight: 'bold', align: 'center', wordWrap: { width: bubbleW - 15 }
          }).setOrigin(0.5, 0.5).setDepth(605);
        }
        agent._speechText.setText(agent.lastSpeech).setPosition(bx, by).setVisible(true);
      } else if (agent._speechText) {
        agent._speechText.setVisible(false);
      }

      activeIds.add(agent.id);
      this.updateAgentHitZone(agent, px, bodyY);
    });

    this.cleanupAgentHitZones(activeIds);
  }

  updateAgentHitZone(agent, px, bodyY) {
    if (!agent) return;
    let zone = this.agentHitZones.get(agent.id);
    if (!zone) {
      zone = this.add.zone(px, bodyY - 6, 28, 34).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
      zone.setDepth(610);
      zone.on('pointerover', () => {
        this.hoveredAgentId = agent.id;
      });
      zone.on('pointerout', () => {
        if (this.hoveredAgentId === agent.id) this.hoveredAgentId = null;
      });
      zone.on('pointerdown', () => {
        openAgentProfile(agent, this);
      });
      this.agentHitZones.set(agent.id, zone);
    }
    zone.x = px;
    zone.y = bodyY - 6;
  }

  cleanupAgentHitZones(activeIds) {
    if (!this.agentHitZones) return;
    for (const [agentId, zone] of this.agentHitZones.entries()) {
      if (!activeIds.has(agentId)) {
        zone.destroy();
        this.agentHitZones.delete(agentId);
      }
    }
  }

  // ============================================================
  // CLOUDS & SKY
  // ============================================================
  updateClouds(dt) {
    const gfx = this.agentGraphics; // reuse for simplicity
    // Clouds are drawn in update, cleared each frame via agentGraphics.clear()
    // Actually let's use a separate approach - draw on camera overlay
    // For simplicity, we'll just animate cloud positions
    this.clouds.forEach(c => {
      c.x += c.speed * dt * 0.01;
      if (c.x > 2000) c.x = -200;
    });
  }

  drawClouds() {
    // Draw clouds relative to camera (screen space)
    const cam = this.cameras.main;
    const gfx = this.agentGraphics;

    this.clouds.forEach(c => {
      const sx = c.x - cam.scrollX * 0.05; // parallax
      const sy = c.y;
      gfx.fillStyle(0xffffff, c.opacity);
      gfx.fillCircle(sx, sy, c.w * 0.3);
      gfx.fillCircle(sx + c.w * 0.25, sy - 5, c.w * 0.2);
      gfx.fillCircle(sx + c.w * 0.5, sy, c.w * 0.25);
      gfx.fillCircle(sx + c.w * 0.75, sy + 2, c.w * 0.18);
    });
  }

  // ============================================================
  // TIME
  // ============================================================
  updateTime(dt) {
    if (WORLD_CONTEXT.worldTime) {
      const timeDisplay = formatServerTime(WORLD_CONTEXT.worldTime);
      if (timeDisplay) {
        document.getElementById('time-display').textContent = timeDisplay;
      }
      return;
    }

    this.gameTime += dt / 1000 * 0.5; // 0.5 game minutes per real second
    if (this.gameTime >= 1440) this.gameTime -= 1440;

    const hours = Math.floor(this.gameTime / 60);
    const mins = Math.floor(this.gameTime % 60);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const timeStr = `${h12}:${String(mins).padStart(2,'0')} ${ampm}`;

    let icon = '☀️';
    if (this.gameTime < 360 || this.gameTime > 1080) icon = '🌙';
    else if (this.gameTime < 420) icon = '🌅';
    else if (this.gameTime > 1020) icon = '🌆';

    document.getElementById('time-display').textContent = `${icon} ${timeStr}`;
  }

  // ============================================================
  // HUD
  // ============================================================
  updateHUD() {
    document.getElementById('agent-count').textContent = `👥 ${this.agents.length} Citizens`;

    const panel = document.getElementById('agents-panel');
    panel.innerHTML = '<div style="color:#7faaee;font-size:11px;margin-bottom:6px;font-weight:600;">CITIZENS</div>' +
      this.agents.map(a =>
        `<div class="agent-item"><span class="agent-dot" style="background:${a.color}"></span><span class="agent-name-hud">${a.name} <span style="color:#555;font-size:10px">${a.state}</span></span></div>`
      ).join('');

    this.updateConversationFocus();

    const reasonEl = document.getElementById('reason-bar');
    if (reasonEl) {
      const agent = this.agents.find(a => a.id === this.selectedAgentId) || this.agents[0];
      const chain = agent?.motivation?.chain || [];
      const pending = chain.find(step => step.status !== 'done');
      const label = pending?.label || agent?.plan?.primaryGoal || '-';
      reasonEl.textContent = `Razón: ${label}`;
    }

    const feedEl = document.getElementById('telemetry-feed-body');
    if (feedEl) {
      const events = WORLD_CONTEXT.telemetryFeed || [];
      if (!events.length) {
        feedEl.textContent = 'Sin eventos';
      } else {
        feedEl.innerHTML = events.map(item => {
          const payload = item.payload || {};
          const agentId = payload.agentId;
          const name = AGENT_DIRECTORY.get(agentId)?.name || agentId?.slice(0, 4) || 'Agente';
          const reason = payload.reason ? String(payload.reason).replace(/_/g, ' ') : 'motivo';
          const action = payload.actionType || item.event;
          return `<div class="feed-item">${name}: ${action} · ${reason}</div>`;
        }).join('');
      }
    }

    if (this.selectedAgentId) {
      const selected = this.agents.find(a => a.id === this.selectedAgentId);
      if (selected) updateAgentProfilePanel(selected);
    }
  }

  updateConversationFocus() {
    const statusEl = document.getElementById('conversation-focus-status');
    const bodyEl = document.getElementById('conversation-focus-body');
    if (!statusEl || !bodyEl) return;

    const conversations = WORLD_CONTEXT.activeConversations || [];
    if (!conversations.length) {
      statusEl.textContent = 'Sin diálogo';
      bodyEl.innerHTML = '<div class="conversation-card"><div class="participants">-</div><div class="last-line">Nadie está hablando ahora.</div></div>';
      return;
    }

    const safe = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const getLastMessageTime = (conv) => {
      const msgs = Array.isArray(conv?.messages) ? conv.messages : [];
      const last = msgs.reduce((acc, msg) => (msg?.timestamp || 0) > (acc?.timestamp || 0) ? msg : acc, null);
      return last?.timestamp || conv?.lastActivity || conv?.startedAt || 0;
    };

    const sorted = [...conversations].sort((a, b) => getLastMessageTime(b) - getLastMessageTime(a));

    statusEl.textContent = `${conversations.length} en curso`;
    bodyEl.innerHTML = sorted.slice(0, 2).map(conv => {
      const [a, b] = conv.participants || [];
      const nameA = AGENT_DIRECTORY.get(a)?.name || this.agents.find(x => x.id === a)?.name || (a ? `Agent ${a.slice(0,4)}` : '-');
      const nameB = AGENT_DIRECTORY.get(b)?.name || this.agents.find(x => x.id === b)?.name || (b ? `Agent ${b.slice(0,4)}` : '-');
      const messages = Array.isArray(conv.messages) ? conv.messages : [];
      const lastMsg = messages.slice().sort((m1, m2) => (m1?.timestamp || 0) - (m2?.timestamp || 0)).at(-1);
      const speakerId = lastMsg?.from || lastMsg?.fromId;
      const speakerName = lastMsg?.fromName
        || AGENT_DIRECTORY.get(speakerId)?.name
        || this.agents.find(x => x.id === speakerId)?.name
        || (speakerId ? `Agent ${speakerId.slice(0,4)}` : '-');
      const lastLine = lastMsg?.message ? `${speakerName}: ${lastMsg.message}` : 'Conexión activa, esperando diálogo…';
      return `
        <div class="conversation-card">
          <div class="participants">${safe(nameA)} ↔ ${safe(nameB)}</div>
          <div class="last-line">${safe(lastLine)}</div>
        </div>
      `;
    }).join('');
  }

  // ============================================================
  // UPDATE LOOP
  // ============================================================
  update(time, delta) {
    this.updateAgents(delta);
    this.renderAgents();
    this.drawClouds();
    this.updateClouds(delta);
    this.updateTime(delta);
    this.updateMinimap();
    this.updateHUD();
    this.updateShowModeCamera(delta);
  }

  updateMinimap() {
    if (this.minimapCtx) this.drawMinimap();
  }

  updateShowModeCamera(delta) {
    if (!SHOW_MODE_STATE.active || this._dragStart) return;
    const currentScene = SHOW_MODE_STATE.currentScene;
    if (!currentScene?.location) return;
    const isoPos = toIso(currentScene.location.x, currentScene.location.y);
    const targetX = isoPos.x + this.sys.game.config.width / 2;
    const targetY = isoPos.y + this.sys.game.config.height / 2 - 40;
    const cam = this.cameras.main;
    const desiredScrollX = targetX - cam.width / 2;
    const desiredScrollY = targetY - cam.height / 2;
    const followStrength = Math.min(0.18, Math.max(0.05, delta / 2000));

    cam.scrollX = Phaser.Math.Linear(cam.scrollX, desiredScrollX, followStrength);
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, desiredScrollY, followStrength);

    const baseZoom = 1.0;
    const zoomByType = {
      romance: 1.15,
      conflicto: 1.25,
      politica: 1.2,
      negocio: 1.15,
      interaccion: 1.1
    };
    const sceneType = currentScene.type || 'interaccion';
    const targetZoom = Math.min(1.35, Math.max(0.95, (zoomByType[sceneType] || baseZoom) + (currentScene.showScore || 0) / 300));
    cam.zoom = Phaser.Math.Linear(cam.zoom, targetZoom, 0.06);

    this.showModeCamera.sceneId = currentScene.id;
    this.showModeCamera.targetX = desiredScrollX;
    this.showModeCamera.targetY = desiredScrollY;
  }
}

// ============================================================
// PHASER GAME CONFIG
// ============================================================
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a2744',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MoltivilleScene]
};

const game = new Phaser.Game(config);

// Handle resize
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
