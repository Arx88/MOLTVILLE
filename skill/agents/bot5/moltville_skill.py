#!/usr/bin/env python3
"""
MOLTVILLE Skill for OpenClaw
Connects Moltbot to MOLTVILLE virtual city
"""

import json
import asyncio
import socketio
import aiohttp
from typing import Dict, List, Optional, Any
from pathlib import Path
import logging
import random

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MOLTVILLESkill:
    """
    MOLTVILLE Skill - Enables Moltbot to live in a virtual city
    """
    
    def __init__(self, config_path: str = "config.json"):
        """Initialize the skill with configuration"""
        self.config_path = Path(__file__).parent / config_path
        self.config = self._load_config(self.config_path)
        self.sio = socketio.AsyncClient(
            reconnection=True,
            reconnection_attempts=5,
            reconnection_delay=2
        )
        self.connected = False
        self.agent_id_path = Path(__file__).parent / ".moltville_agent_id"
        self.agent_id = self._load_agent_id()
        self.current_state = {}
        self._auto_task: Optional[asyncio.Task] = None
        self._decision_task: Optional[asyncio.Task] = None
        self._active_goals: List[Dict[str, Any]] = []
        self._conversation_state: Dict[str, str] = {}
        self._recent_utterances: List[Dict[str, Any]] = []
        self.long_memory_path = Path(__file__).parent / "memory.json"
        self.long_memory = self._load_long_memory()
        self._current_intent: Optional[str] = None
        self._intent_expires_at: Optional[float] = None
        self._traits = self._init_traits()
        self._political_candidate: bool = False
        self._last_campaign_ts: float = 0
        self._campaign_cooldown = 45
        self._last_hotspot: Optional[Dict[str, Any]] = None
        self._last_conversation_ts: Dict[str, float] = {}
        self._last_conversation_msg: Dict[str, str] = {}
        self._conversation_cooldown = 0
        self._conversation_stale_seconds = 120
        self._relation_update_cooldown = 8
        self._last_relation_update: Dict[str, float] = {}
        self._plan_state = self.long_memory.get("planState", {}) if isinstance(self.long_memory, dict) else {}
        self._plan_ttl_seconds = 180
        self._plan_action_timeout = 45
        self._goal_state = self.long_memory.get("goalState", {}) if isinstance(self.long_memory, dict) else {}
        self._motivation_state = self.long_memory.get("motivationState", {}) if isinstance(self.long_memory, dict) else {}
        self._world_state_cache = None
        self._world_state_cache_at = 0
        self._world_state_cache_ttl = 30
        self._profile_last_sent = 0
        
        # Setup event handlers
        self._setup_handlers()

    def _get_http_base_url(self) -> str:
        server_url = self.config.get('server', {}).get('url', '')
        if server_url.startswith('ws://'):
            return 'http://' + server_url[len('ws://'):]
        if server_url.startswith('wss://'):
            return 'https://' + server_url[len('wss://'):]
        return server_url

    async def _http_request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        base_url = self._get_http_base_url().rstrip('/')
        url = f"{base_url}{path}"
        headers = {}
        api_key = self.config.get('server', {}).get('apiKey')
        if isinstance(api_key, str) and api_key.strip():
            headers['x-api-key'] = api_key.strip()
        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(method, url, json=payload, headers=headers) as response:
                    data = await response.json()
                    if response.status >= 400:
                        return {"error": data.get('error', f"HTTP {response.status}")}
                    return data
        except Exception as error:
            logger.error(f"HTTP request failed: {error}")
            return {"error": str(error)}
    
    def _load_config(self, config_path: Path) -> Dict:
        """Load configuration from file"""
        if not config_path.exists():
            # Create default config
            default_config = {
                "server": {
                    "url": "ws://localhost:3001",
                    "apiKey": "CHANGE_ME"
                },
                "agent": {
                    "name": "MoltbotCitizen",
                    "avatar": "char1",
                    "personality": "friendly and curious"
                },
                "behavior": {
                    "autoExplore": True,
                    "conversationInitiation": "moderate",
                    "decisionInterval": 30000,
                    "decisionLoop": {
                        "enabled": True,
                        "intervalMs": 20000,
                        "mode": "heuristic"
                    }
                },
                "llm": {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "apiKey": ""
                }
            }
            
            with open(config_path, 'w') as f:
                json.dump(default_config, f, indent=2)
            
            logger.warning(f"Created default config at {config_path}. Please update with your API key!")
            return default_config
        
        with open(config_path) as f:
            return json.load(f)

    def _save_config(self) -> None:
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)
        except OSError as error:
            logger.warning(f"Failed to save config: {error}")

    def _load_long_memory(self) -> Dict[str, Any]:
        if not self.long_memory_path.exists():
            return {"episodes": [], "notes": [], "relationships": {}}
        try:
            return json.loads(self.long_memory_path.read_text())
        except OSError as error:
            logger.warning(f"Failed to load long memory: {error}")
            return {"episodes": [], "notes": [], "relationships": {}}

    def _save_long_memory(self) -> None:
        try:
            self.long_memory_path.write_text(json.dumps(self.long_memory, indent=2))
        except OSError as error:
            logger.warning(f"Failed to save long memory: {error}")

    def _apply_profile_traits(self, profile: Dict[str, Any]) -> None:
        if not isinstance(profile, dict):
            return
        traits = profile.get("traits")
        if not isinstance(traits, dict):
            return
        try:
            self._traits = {
                "ambition": float(traits.get("ambition", self._traits.get("ambition", 0.5))),
                "sociability": float(traits.get("sociability", self._traits.get("sociability", 0.6))),
                "curiosity": float(traits.get("curiosity", self._traits.get("curiosity", 0.5))),
                "discipline": float(traits.get("discipline", self._traits.get("discipline", 0.5)))
            }
        except (TypeError, ValueError):
            return

    def _infer_desire_from_profile(self) -> str:
        profile = self.long_memory.get("profile") if isinstance(self.long_memory, dict) else {}
        goals = profile.get("goals") if isinstance(profile, dict) else []
        goal_text = " ".join([str(g).lower() for g in goals])
        if any(token in goal_text for token in ("president", "alcald", "polit")):
            return "be_president"
        if any(token in goal_text for token in ("negocio", "empresa", "emprend", "tienda", "cafe")):
            return "start_business"
        if any(token in goal_text for token in ("cita", "amor", "pareja", "romance")):
            return "find_love"
        if any(token in goal_text for token in ("casa", "hogar", "vivienda")):
            return "buy_house"
        # fallback by traits
        if self._traits.get("ambition", 0.5) >= 0.75:
            return "be_president"
        if self._traits.get("curiosity", 0.5) >= 0.7:
            return "start_business"
        return "buy_house"

    def _build_motivation_chain(self, desire: str) -> List[Dict[str, Any]]:
        if desire == "be_president":
            return [
                {"id": "desire_president", "label": "Quiero liderar la ciudad", "requires": []},
                {"id": "build_reputation", "label": "Necesito reputación positiva", "requires": ["desire_president"]},
                {"id": "help_citizens", "label": "Debo ayudar a ciudadanos concretos", "requires": ["build_reputation"]},
                {"id": "register_candidate", "label": "Registrarme como candidato", "requires": ["help_citizens"]},
                {"id": "win_votes", "label": "Conseguir votos reales", "requires": ["register_candidate"]}
            ]
        if desire == "start_business":
            return [
                {"id": "desire_business", "label": "Quiero abrir un negocio", "requires": []},
                {"id": "need_capital", "label": "Necesito capital", "requires": ["desire_business"]},
                {"id": "get_job", "label": "Necesito un trabajo estable", "requires": ["need_capital"]},
                {"id": "get_votes", "label": "Necesito votos para conseguir ese trabajo", "requires": ["get_job"]},
                {"id": "open_business", "label": "Proponer y votar un nuevo local", "requires": ["need_capital"]}
            ]
        if desire == "find_love":
            return [
                {"id": "desire_date", "label": "Quiero tener una cita", "requires": []},
                {"id": "build_relationship", "label": "Necesito ganar confianza con alguien", "requires": ["desire_date"]},
                {"id": "need_money", "label": "Necesito dinero para planear la cita", "requires": ["build_relationship"]},
                {"id": "get_job", "label": "Necesito un trabajo estable", "requires": ["need_money"]},
                {"id": "get_votes", "label": "Necesito votos para el trabajo", "requires": ["get_job"]},
                {"id": "plan_date", "label": "Proponer la cita en un lugar concreto", "requires": ["need_money"]}
            ]
        return [
            {"id": "desire_house", "label": "Quiero un hogar propio", "requires": []},
            {"id": "need_money", "label": "Necesito dinero", "requires": ["desire_house"]},
            {"id": "get_job", "label": "Necesito un trabajo estable", "requires": ["need_money"]},
            {"id": "get_votes", "label": "Necesito votos para el trabajo", "requires": ["get_job"]},
            {"id": "build_support", "label": "Debo ganarme apoyo ayudando a otros", "requires": ["get_votes"]},
            {"id": "buy_house", "label": "Comprar casa", "requires": ["need_money"]}
        ]

    def _ensure_motivation_state(self) -> None:
        if isinstance(self._motivation_state, dict) and self._motivation_state.get("desire"):
            return
        desire = self._infer_desire_from_profile()
        chain = self._build_motivation_chain(desire)
        self._motivation_state = {
            "desire": desire,
            "chain": [{**step, "status": "pending"} for step in chain],
            "startedAt": int(asyncio.get_event_loop().time() * 1000)
        }
        if isinstance(self.long_memory, dict):
            self.long_memory["motivationState"] = self._motivation_state
            self._save_long_memory()

    def _mark_chain_done(self, chain: List[Dict[str, Any]], step_id: str) -> None:
        for step in chain:
            if step.get("id") == step_id:
                step["status"] = "done"

    def _chain_ready(self, chain: List[Dict[str, Any]], step: Dict[str, Any]) -> bool:
        requires = step.get("requires", []) or []
        if not requires:
            return True
        for req in requires:
            required_step = next((s for s in chain if s.get("id") == req), None)
            if not required_step or required_step.get("status") != "done":
                return False
        return True

    async def _update_motivation_progress(self, perception: Dict[str, Any]) -> None:
        self._ensure_motivation_state()
        chain = self._motivation_state.get("chain", []) if isinstance(self._motivation_state, dict) else []
        context = perception.get("context", {}) or {}
        economy = context.get("economy", {}) or {}
        job = economy.get("job")
        balance = economy.get("balance", 0)
        target_price = self._goal_state.get("targetPrice") or 0
        if job:
            self._mark_chain_done(chain, "get_job")
        if target_price and balance >= target_price:
            self._mark_chain_done(chain, "need_money")
        if isinstance(self.long_memory, dict):
            self.long_memory["motivationState"] = self._motivation_state
            self._save_long_memory()

    async def _next_motivation_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        await self._update_motivation_progress(perception)
        chain = self._motivation_state.get("chain", []) if isinstance(self._motivation_state, dict) else []
        if not chain:
            return None
        pending = [step for step in chain if step.get("status") != "done" and self._chain_ready(chain, step)]
        if not pending:
            return None
        current = pending[0]
        step_id = current.get("id")
        economy = (perception.get("context") or {}).get("economy", {}) or {}
        job = economy.get("job")
        balance = economy.get("balance", 0)
        if step_id in ("build_support", "help_citizens", "build_relationship"):
            nearby = perception.get("nearbyAgents", []) or []
            if nearby:
                target_id = nearby[0].get("id")
                message = await self._llm_social_message("help_citizens", {"target": target_id})
                if target_id and message:
                    return {"type": "start_conversation", "params": {"target_id": target_id, "message": message}}
            return {"type": "move_to", "params": self._pick_hotspot("social")}
        if step_id in ("get_job", "get_votes"):
            application = await self.list_job_applications()
            app = application.get("application") if isinstance(application, dict) else None
            if not job and not app:
                jobs = await self.list_jobs()
                available = [j for j in (jobs.get("jobs") or []) if not j.get("assignedTo")]
                if available:
                    return {"type": "apply_job", "params": {"job_id": available[0].get("id")}}
            if app and app.get("status") == "pending":
                nearby = perception.get("nearbyAgents", []) or []
                if nearby:
                    target_id = nearby[0].get("id")
                    if target_id:
                        await self.propose_negotiation(target_id, app.get("jobId"))
                        message = await self._llm_social_message("job_support", {"jobId": app.get("jobId"), "target": target_id})
                        if message:
                            return {"type": "start_conversation", "params": {"target_id": target_id, "message": message}}
                return {"type": "move_to", "params": self._pick_hotspot("social")}
            return {"type": "move_to", "params": self._pick_hotspot("work")}
        if step_id in ("buy_house", "open_business"):
            if step_id == "buy_house":
                props = await self.list_properties()
                for_sale = [p for p in (props.get("properties") or []) if p.get("forSale")]
                if for_sale:
                    cheapest = sorted(for_sale, key=lambda p: p.get("price", 0))[0]
                    if balance >= cheapest.get("price", 0):
                        return {"type": "buy_property", "params": {"property_id": cheapest.get("id")}}
                return {"type": "move_to", "params": self._pick_hotspot("work")}
            return {"type": "move_to", "params": self._pick_hotspot("work")}
        if step_id in ("register_candidate", "win_votes"):
            if step_id == "register_candidate":
                await self._maybe_register_candidate(perception)
                return {"type": "wait", "params": {}}
            nearby = perception.get("nearbyAgents", []) or []
            if nearby:
                target_id = nearby[0].get("id")
                message = await self._llm_social_message("campaign", {"target": target_id})
                if target_id and message:
                    return {"type": "start_conversation", "params": {"target_id": target_id, "message": message}}
            return {"type": "move_to", "params": self._pick_hotspot("social")}
        if step_id in ("plan_date",):
            nearby = perception.get("nearbyAgents", []) or []
            if nearby:
                target_id = nearby[0].get("id")
                message = await self._llm_social_message("plan_date", {"target": target_id})
                if target_id and message:
                    return {"type": "start_conversation", "params": {"target_id": target_id, "message": message}}
            return {"type": "move_to", "params": self._pick_hotspot("social")}
        return None

    async def _ensure_profile(self) -> None:
        if isinstance(self.long_memory.get("profile"), dict):
            self._apply_profile_traits(self.long_memory.get("profile"))
            return
        llm_config = self.config.get("llm", {})
        provider = llm_config.get("provider", "")
        model = llm_config.get("model", "")
        api_key = llm_config.get("apiKey", "")
        if not (provider and model):
            return
        if provider not in ("ollama",) and not api_key:
            return
        prompt = (
            "Eres un agente recién llegado a MOLTVILLE. Debes crear tu propio perfil. "
            "No menciones IA, modelos ni sistemas. Responde SOLO JSON. "
            "Incluye: traits (ambition,sociability,curiosity,discipline) valores 0-1, "
            "goals (3 metas de largo plazo), style (como hablas), "
            "backstory (2 frases), values (3 palabras), quirks (2 hábitos)."
        )
        payload = {
            "name": self.config.get("agent", {}).get("name"),
            "personality_hint": self.config.get("agent", {}).get("personality")
        }
        profile = await self._call_llm_json(prompt, payload)
        if isinstance(profile, dict):
            self.long_memory["profile"] = profile
            self._save_long_memory()
            self._apply_profile_traits(profile)

    def _init_traits(self) -> Dict[str, float]:
        traits = self.config.get("agent", {}).get("traits", {}) if isinstance(self.config.get("agent", {}), dict) else {}
        if isinstance(traits, dict) and traits:
            return {
                "ambition": float(traits.get("ambition", 0.5)),
                "sociability": float(traits.get("sociability", 0.6)),
                "curiosity": float(traits.get("curiosity", 0.5)),
                "discipline": float(traits.get("discipline", 0.5))
            }
        # Stable fallback by agent id hash
        seed = sum(ord(c) for c in (self.agent_id or self.config.get("agent", {}).get("name", "agent")))
        random.seed(seed)
        return {
            "ambition": round(random.uniform(0.3, 0.9), 2),
            "sociability": round(random.uniform(0.3, 0.9), 2),
            "curiosity": round(random.uniform(0.3, 0.9), 2),
            "discipline": round(random.uniform(0.3, 0.9), 2)
        }

    def _get_daily_phase(self, perception: Dict[str, Any]) -> str:
        phase = (perception.get("worldTime") or {}).get("phase")
        if isinstance(phase, str) and phase:
            return phase
        progress = (perception.get("worldTime") or {}).get("dayProgress", 0)
        try:
            progress = float(progress)
        except (TypeError, ValueError):
            progress = 0
        if progress < 0.35:
            return "morning"
        if progress < 0.7:
            return "afternoon"
        return "night"

    def _is_meta_message(self, message: str) -> bool:
        if not isinstance(message, str):
            return True
        lowered = message.lower()
        banned = [
            "modelo", "llm", "ia", "sistema", "servidor", "api", "oauth", "prueba", "test", "prompt",
            "ciclo", "coordenad", "estabilidad", "monitoreo", "instruccion", "instrucción", "parametro", "parámetro",
            "secuencia", "diagnostic", "observacion", "observación"
        ]
        return any(term in lowered for term in banned)

    def _select_intent(self, perception: Dict[str, Any]) -> str:
        needs = perception.get("needs", {}) or {}
        social = float(needs.get("social", 100) or 100)
        energy = float(needs.get("energy", 100) or 100)
        hunger = float(needs.get("hunger", 0) or 0)
        phase = self._get_daily_phase(perception)

        # Base weights
        weights = {
            "social": 0.4 + (1 - social / 100) * 0.7 + self._traits["sociability"] * 0.3,
            "work": 0.3 + self._traits["discipline"] * 0.4 + (phase == "morning") * 0.2,
            "leisure": 0.2 + self._traits["curiosity"] * 0.4 + (phase == "night") * 0.2
        }
        if hunger > 60:
            weights["work"] *= 0.7
            weights["leisure"] *= 0.6
        if energy < 35:
            weights["social"] *= 0.7
            weights["work"] *= 0.5

        intent = max(weights, key=weights.get)
        return intent

    def _approval_ratio(self, relationships: Dict[str, Any]) -> float:
        if not relationships:
            return 0.0
        approvals = 0
        total = 0
        for _, rel in relationships.items():
            if not isinstance(rel, dict):
                continue
            total += 1
            if rel.get("affinity", 0) >= 2 or rel.get("trust", 0) >= 2:
                approvals += 1
        return approvals / max(total, 1)

    def _pick_hotspot(self, intent: str) -> Dict[str, int]:
        hotspots = {
            "social": [
                {"name": "plaza", "x": 16, "y": 18},
                {"name": "cafe", "x": 14, "y": 8},
                {"name": "market", "x": 36, "y": 28}
            ],
            "work": [
                {"name": "cityhall", "x": 28, "y": 22},
                {"name": "shop", "x": 30, "y": 14},
                {"name": "library", "x": 24, "y": 6}
            ],
            "leisure": [
                {"name": "park", "x": 40, "y": 42},
                {"name": "gallery", "x": 50, "y": 8},
                {"name": "library", "x": 24, "y": 6}
            ]
        }
        options = hotspots.get(intent, hotspots["social"])
        if self._last_hotspot and random.random() < 0.6:
            options = [opt for opt in options if opt["name"] != self._last_hotspot.get("name")] or options
        choice = random.choice(options)
        self._last_hotspot = choice
        return {"x": choice["x"], "y": choice["y"]}

    async def _maybe_register_candidate(self, perception: Dict[str, Any]) -> None:
        if self._political_candidate:
            return
        if self._traits["ambition"] < 0.7:
            return
        relationships = (perception.get("context") or {}).get("relationships", {}) or {}
        approval = self._approval_ratio(relationships)
        if approval < 0.2:
            return
        platform = f"Impulsar MOLTVILLE con comunidad y crecimiento local."
        payload = {
            "agentId": self.agent_id,
            "name": self.config.get("agent", {}).get("name", "Ciudadano"),
            "platform": platform
        }
        result = await self._http_request('POST', '/api/governance/candidate', payload)
        if not result.get('error'):
            self._political_candidate = True

    def _remember_utterance(self, speaker_id: str, message: str) -> None:
        if not speaker_id or not message:
            return
        if self._is_meta_message(message):
            return
        entry = {
            "speakerId": speaker_id,
            "message": message.strip()[:280],
            "timestamp": int(asyncio.get_event_loop().time() * 1000)
        }
        self._recent_utterances.append(entry)
        self._recent_utterances = self._recent_utterances[-12:]

    def _record_episode(self, kind: str, data: Dict[str, Any]) -> None:
        entry = {
            "type": kind,
            "data": data,
            "timestamp": int(asyncio.get_event_loop().time() * 1000)
        }
        self.long_memory.setdefault("episodes", []).append(entry)
        self.long_memory["episodes"] = self.long_memory["episodes"][-80:]
        self._save_long_memory()

    async def _analyze_relationship(self, speaker_id: str, message: str) -> Dict[str, Any]:
        prompt = (
            "Eres un ciudadano de MOLTVILLE evaluando una interacción social. "
            "Devuelve SOLO JSON con campos: affinityDelta, trustDelta, respectDelta (-2 a 2), "
            "y note (máx 8 palabras) en tono in-world."
        )
        payload = {
            "self": self.config.get("agent", {}).get("name"),
            "otherId": speaker_id,
            "message": message
        }
        result = await self._call_llm_json(prompt, payload)
        if isinstance(result, dict):
            return result
        lowered = message.lower()
        pos = ["gracias", "genial", "perfecto", "me encanta", "bien", "claro"]
        neg = ["no", "mal", "nunca", "molesta", "odio", "mentira"]
        score = 1 if any(p in lowered for p in pos) else (-1 if any(n in lowered for n in neg) else 0)
        return {
            "affinityDelta": score,
            "trustDelta": score,
            "respectDelta": 0,
            "note": "buena impresión" if score > 0 else ("tenso" if score < 0 else "neutral")
        }

    def _update_relationship_memory(self, speaker_id: str, message: str, analysis: Dict[str, Any]) -> None:
        if not speaker_id:
            return
        rels = self.long_memory.setdefault("relationships", {})
        current = rels.get(speaker_id, {}) if isinstance(rels.get(speaker_id), dict) else {}
        def clamp(val, lo=-10, hi=10):
            return max(lo, min(hi, val))
        affinity = clamp(int(current.get("affinity", 0)) + int(analysis.get("affinityDelta", 0)))
        trust = clamp(int(current.get("trust", 0)) + int(analysis.get("trustDelta", 0)))
        respect = clamp(int(current.get("respect", 0)) + int(analysis.get("respectDelta", 0)))
        rels[speaker_id] = {
            **current,
            "affinity": affinity,
            "trust": trust,
            "respect": respect,
            "lastNote": str(analysis.get("note", ""))[:80],
            "lastMessage": message[:160]
        }
        self._save_long_memory()

    def _get_recent_context(self) -> Dict[str, Any]:
        cleaned = [u for u in self._recent_utterances if not self._is_meta_message(u.get("message", ""))]
        return {
            "recentUtterances": list(cleaned),
            "episodes": self.long_memory.get("episodes", [])[-10:],
            "relationshipNotes": self.long_memory.get("relationships", {}),
            "planState": self.long_memory.get("planState", {}),
            "goalState": self.long_memory.get("goalState", {})
        }

    def _load_agent_id(self) -> Optional[str]:
        if not self.agent_id_path.exists():
            return None
        try:
            stored = self.agent_id_path.read_text().strip()
            return stored or None
        except OSError as error:
            logger.warning(f"Failed to load agent id: {error}")
            return None

    def _store_agent_id(self, agent_id: str) -> None:
        if not agent_id:
            return
        try:
            self.agent_id_path.write_text(agent_id)
        except OSError as error:
            logger.warning(f"Failed to store agent id: {error}")
    
    def _setup_handlers(self):
        """Setup WebSocket event handlers"""
        
        @self.sio.event
        async def connect():
            logger.info("Connected to MOLTVILLE server")
            await self._authenticate()
        
        @self.sio.event
        async def disconnect():
            logger.info("Disconnected from MOLTVILLE server")
            self.connected = False
            if self._auto_task:
                self._auto_task.cancel()
                self._auto_task = None
            if self._decision_task:
                self._decision_task.cancel()
                self._decision_task = None
        
        @self.sio.on('agent:registered')
        async def agent_registered(data):
            logger.info(f"Agent registered: {data}")
            self.agent_id = data['agentId']
            self.current_state = data
            self.connected = True
            self._store_agent_id(self.agent_id)

        @self.sio.on('auth:rotated')
        async def auth_rotated(data):
            if not isinstance(data, dict):
                return
            new_key = data.get('apiKey')
            if isinstance(new_key, str) and new_key.strip():
                self.config['server']['apiKey'] = new_key.strip()
                self._save_config()
                logger.info("API key rotated and saved.")
        
        @self.sio.on('perception:update')
        async def perception_update(data):
            logger.debug(f"Perception update: {data}")
            self.current_state['perception'] = data
        
        @self.sio.on('perception:speech')
        async def perception_speech(data):
            speaker = data.get('from') if isinstance(data, dict) else None
            message = data.get('message') if isinstance(data, dict) else None
            if speaker and message:
                logger.info(f"Heard: {speaker} said '{message}'")
                self._remember_utterance(speaker, message)
                self._record_episode('heard_speech', {"from": speaker, "message": message})
            else:
                logger.info(f"Heard speech: {data}")

        @self.sio.on('conversation:started')
        async def conversation_started(data):
            if not isinstance(data, dict):
                return
            participants = data.get('participants', [])
            conv_id = data.get('id')
            if not conv_id or not isinstance(participants, list):
                return
            other_id = next((pid for pid in participants if pid != self.agent_id), None)
            if other_id:
                self._conversation_state[other_id] = conv_id
                self._record_episode('conversation_started', {
                    "conversationId": conv_id,
                    "with": other_id
                })

        @self.sio.on('conversation:message')
        async def conversation_message(data):
            if not isinstance(data, dict):
                return
            conv_id = data.get('conversationId')
            message = data.get('message') or {}
            from_id = message.get('fromId')
            text = message.get('message')
            if from_id and text:
                self._remember_utterance(from_id, text)
                self._record_episode('conversation_message', {
                    "conversationId": conv_id,
                    "from": from_id,
                    "message": text
                })
                if from_id != self.agent_id:
                    now = asyncio.get_event_loop().time()
                    last_rel = self._last_relation_update.get(from_id, 0)
                    if now - last_rel >= self._relation_update_cooldown:
                        async def rel_task():
                            analysis = await self._analyze_relationship(from_id, text)
                            if isinstance(analysis, dict):
                                self._update_relationship_memory(from_id, text, analysis)
                            self._last_relation_update[from_id] = asyncio.get_event_loop().time()
                        asyncio.create_task(rel_task())
            if conv_id and from_id and from_id != self.agent_id:
                asyncio.create_task(self._respond_to_conversation(conv_id))

        @self.sio.on('conversation:ended')
        async def conversation_ended(data):
            if not isinstance(data, dict):
                return
            conv_id = data.get('conversationId')
            to_remove = [k for k, v in self._conversation_state.items() if v == conv_id]
            for key in to_remove:
                self._conversation_state.pop(key, None)
            if conv_id:
                self._record_episode('conversation_ended', {"conversationId": conv_id})

        @self.sio.on('agent:goal')
        async def agent_goal(data):
            if isinstance(data, dict):
                self._active_goals.append({
                    **data,
                    "receivedAt": int(asyncio.get_event_loop().time() * 1000)
                })
        
        @self.sio.event
        async def error(data):
            logger.error(f"Server error: {data}")
            if isinstance(data, dict) and data.get('message') == 'API key revoked':
                logger.error("API key revoked; disconnecting.")
                await self.disconnect()
    
    async def _authenticate(self):
        """Authenticate with server"""
        permissions = self.config.get('agent', {}).get('permissions')
        await self.sio.emit('agent:connect', {
            'apiKey': self.config['server']['apiKey'],
            'agentId': self.agent_id,  # Reuse agent id if available
            'agentName': self.config['agent']['name'],
            'avatar': self.config['agent']['avatar'],
            'permissions': permissions
        })

    async def _send_profile_update(self) -> None:
        if not self.connected:
            return
        now_ms = int(asyncio.get_event_loop().time() * 1000)
        if now_ms - self._profile_last_sent < 20000:
            return
        self._profile_last_sent = now_ms
        payload = {
            "agentId": self.agent_id,
            "profile": self.long_memory.get("profile"),
            "traits": self._traits,
            "motivation": self._motivation_state,
            "plan": self._plan_state
        }
        try:
            await self.sio.emit('agent:profile', payload)
        except Exception as error:
            logger.debug(f"Failed to send profile update: {error}")

    async def _run_auto_explore(self) -> None:
        interval_ms = self.config.get("behavior", {}).get("decisionInterval", 30000)
        interval_sec = max(interval_ms / 1000, 1)
        while True:
            if not self.connected:
                await asyncio.sleep(1)
                continue
            perception = await self.perceive()
            position = perception.get("position") or {}
            current_x = position.get("x")
            current_y = position.get("y")
            if isinstance(current_x, int) and isinstance(current_y, int):
                dx = random.randint(-3, 3)
                dy = random.randint(-3, 3)
                if dx == 0 and dy == 0:
                    dx = 1
                await self.move(current_x + dx, current_y + dy)
            await asyncio.sleep(interval_sec)

    async def _run_decision_loop(self) -> None:
        decision_config = self.config.get("behavior", {}).get("decisionLoop", {})
        interval_ms = decision_config.get("intervalMs", 20000)
        interval_sec = max(interval_ms / 1000, 2)
        while True:
            if not self.connected:
                await asyncio.sleep(1)
                continue
            perception = await self.perceive()
            if not perception or isinstance(perception, dict) and perception.get("error"):
                await asyncio.sleep(interval_sec)
                continue
            await self._purge_stale_conversations(perception)
            await self._ensure_plan(perception)
            await self._send_profile_update()
            action = await self._decide_action(perception)
            if action:
                await self._execute_action(action)
            await asyncio.sleep(interval_sec)

    def _prune_goals(self) -> None:
        if not self._active_goals:
            return
        now_ms = int(asyncio.get_event_loop().time() * 1000)
        pruned = []
        for goal in self._active_goals:
            ttl_ms = goal.get("ttlMs", 15 * 60 * 1000)
            received = goal.get("receivedAt", now_ms)
            if now_ms - received <= ttl_ms:
                pruned.append(goal)
        self._active_goals = pruned[-10:]

    async def _purge_stale_conversations(self, perception: Dict[str, Any]) -> None:
        convs = perception.get("conversations", []) or []
        if not isinstance(convs, list):
            return
        now_ms = int(asyncio.get_event_loop().time() * 1000)
        active_ids = set()
        for conv in convs:
            if not isinstance(conv, dict):
                continue
            conv_id = conv.get("id")
            if isinstance(conv_id, str):
                active_ids.add(conv_id)
            last_activity = conv.get("lastActivity") or conv.get("startedAt")
            if conv_id and isinstance(last_activity, (int, float)):
                age_ms = now_ms - int(last_activity)
                if age_ms > self._conversation_stale_seconds * 1000:
                    await self._http_request("POST", f"/api/moltbot/{self.agent_id}/conversations/{conv_id}/end")
        if self._conversation_state:
            stale_keys = [k for k, v in self._conversation_state.items() if v not in active_ids]
            for key in stale_keys:
                self._conversation_state.pop(key, None)

    async def _respond_to_conversation(self, conv_id: str) -> None:
        now = asyncio.get_event_loop().time()
        last = self._last_conversation_ts.get(conv_id, 0)
        if self._conversation_cooldown and now - last < self._conversation_cooldown:
            return
        perception = await self.perceive()
        if not perception or isinstance(perception, dict) and perception.get("error"):
            return
        convs = perception.get("conversations", []) or []
        conv = next((c for c in convs if c.get("id") == conv_id), None)
        if not conv:
            return
        messages = conv.get("messages", []) or []
        if messages:
            last_msg = max(messages, key=lambda m: m.get("timestamp", 0))
            if last_msg.get("from") == self.agent_id:
                return
            last_text = str(last_msg.get("message") or "").strip()
            last_ts = last_msg.get("timestamp", 0)
            if not last_text:
                return
            if last_text == self._last_conversation_msg.get(conv_id):
                return
            if last_ts and last_ts <= self._last_conversation_ts.get(conv_id, 0):
                return
        if messages:
            if "jobid:" in last_text.lower() and ("vota" in last_text.lower() or "vote" in last_text.lower()):
                import re
                match = re.search(r"jobId:\s*([\w:-]+)", last_text, re.IGNORECASE)
                job_id = match.group(1) if match else None
                applicant_id = last_msg.get("from")
                if job_id and applicant_id and applicant_id != self.agent_id:
                    favors = await self._http_request('GET', f"/api/favor/{self.agent_id}")
                    summary = favors.get('summary') if isinstance(favors, dict) else {}
                    owed = summary.get('owed', 0) if isinstance(summary, dict) else 0
                    if owed > 0:
                        await self.vote_job(applicant_id, job_id)
                        await self.send_conversation_message(conv_id, "Te debía un favor. Voté por tu solicitud.")
                        self._last_conversation_ts[conv_id] = int(asyncio.get_event_loop().time() * 1000)
                        self._last_conversation_msg[conv_id] = last_text
                        return
                    await self.send_conversation_message(conv_id, "Si me ayudas con algo primero, puedo votar por ti.")
                    self._last_conversation_ts[conv_id] = int(asyncio.get_event_loop().time() * 1000)
                    self._last_conversation_msg[conv_id] = last_text
                    return
        action = await self._decide_with_llm(perception, force_conversation=True, forced_conversation_id=conv_id)
        if not action:
            action = await self._decide_with_llm(perception, force_conversation=True, forced_conversation_id=conv_id)
        if action and action.get("type") == "conversation_message":
            await self._execute_action(action)
            self._last_conversation_ts[conv_id] = int(asyncio.get_event_loop().time() * 1000)
            self._last_conversation_msg[conv_id] = last_text

    def _plan_expired(self) -> bool:
        if not isinstance(self._plan_state, dict):
            return True
        last = self._plan_state.get("lastPlanAt")
        if not isinstance(last, (int, float)):
            return True
        now_ms = int(asyncio.get_event_loop().time() * 1000)
        return (now_ms - int(last)) > (self._plan_ttl_seconds * 1000)

    def _ensure_goal_state(self, perception: Dict[str, Any]) -> None:
        self._ensure_motivation_state()
        if not isinstance(self._goal_state, dict) or not self._goal_state.get("primary"):
            primary = self._motivation_state.get("desire", "explorar") if isinstance(self._motivation_state, dict) else "explorar"
            self._goal_state = {
                "primary": primary,
                "status": "active",
                "nodes": {},
                "targetPrice": None,
                "updatedAt": int(asyncio.get_event_loop().time() * 1000)
            }
            if isinstance(self.long_memory, dict):
                self.long_memory["goalState"] = self._goal_state
                self._save_long_memory()

    async def _get_world_state(self) -> Dict[str, Any]:
        now = int(asyncio.get_event_loop().time())
        if self._world_state_cache and (now - int(self._world_state_cache_at)) <= self._world_state_cache_ttl:
            return self._world_state_cache
        state = await self._http_request('GET', "/api/world/state")
        if isinstance(state, dict):
            self._world_state_cache = state
            self._world_state_cache_at = now
            return state
        return {}

    async def _resolve_building_position(self, building_id: str) -> Optional[Dict[str, int]]:
        if not building_id:
            return None
        state = await self._get_world_state()
        buildings = state.get("buildings", []) if isinstance(state, dict) else []
        for b in buildings:
            if b.get("id") == building_id:
                x, y = b.get("x"), b.get("y")
                if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                    return {"x": int(x), "y": int(y)}
        return None

    async def _update_goal_progress(self, perception: Dict[str, Any]) -> None:
        context = perception.get("context", {}) or {}
        economy = context.get("economy", {}) or {}
        if not self._goal_state.get("targetPrice"):
            props = await self.list_properties()
            if isinstance(props, dict):
                for_sale = [p for p in props.get("properties", []) if p.get("forSale")]
                if for_sale:
                    self._goal_state["targetPrice"] = min(p.get("price", 0) for p in for_sale)
        self._goal_state["updatedAt"] = int(asyncio.get_event_loop().time() * 1000)
        if isinstance(self.long_memory, dict):
            self.long_memory["goalState"] = self._goal_state
            self._save_long_memory()

    async def _request_job_vote(self, perception: Dict[str, Any], application: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        nearby_agents = perception.get("nearbyAgents", []) or []
        if not nearby_agents:
            return {"type": "move_to", "params": self._pick_hotspot("social")}
        target_id = nearby_agents[0].get("id")
        if not target_id:
            return None
        job_id = application.get("jobId")
        job_name = job_id
        jobs = await self.list_jobs()
        if isinstance(jobs, dict):
            match = next((j for j in jobs.get("jobs", []) if j.get("id") == job_id), None)
            if match:
                job_name = f"{match.get('role', '')} en {match.get('buildingName', '')}".strip()
        prompt = (
            "Eres un ciudadano de MOLTVILLE. Necesitas votos para obtener un trabajo. "
            "Pide un voto de forma breve y natural. Devuelve SOLO JSON con {message}."
        )
        payload = {
            "self": self.config.get("agent", {}).get("name"),
            "job": job_name,
            "jobId": job_id
        }
        result = await self._call_llm_json(prompt, payload)
        message = result.get("message") if isinstance(result, dict) else None
        if isinstance(message, str) and message.strip():
            return {"type": "start_conversation", "params": {"target_id": target_id, "message": message.strip()}}
        return None

    async def _llm_social_message(self, kind: str, payload: Dict[str, Any]) -> Optional[str]:
        prompt = (
            "Eres un ciudadano de MOLTVILLE. Genera un mensaje social breve y natural. "
            "Responde SOLO JSON con {message}. Mantente 100% in-world."
        )
        data = {
            "kind": kind,
            "self": self.config.get("agent", {}).get("name"),
            **(payload or {})
        }
        result = await self._call_llm_json(prompt, data)
        message = result.get("message") if isinstance(result, dict) else None
        if isinstance(message, str) and message.strip():
            return message.strip()
        return None

    async def _goal_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return await self._next_motivation_action(perception)

    async def _maybe_start_conversation(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        plan = self.long_memory.get("planState", {}) if isinstance(self.long_memory, dict) else {}
        primary = str(plan.get("primaryGoal", "")).lower()
        if not primary or not any(token in primary for token in ("convers", "alian", "negoci", "inform", "persu")):
            return None
        nearby_agents = perception.get("nearbyAgents", []) or []
        if not nearby_agents:
            return None
        target_id = nearby_agents[0].get("id")
        if not target_id:
            return None
        prompt = (
            "Eres un ciudadano de MOLTVILLE. Genera un saludo breve y natural para iniciar conversación. "
            "Devuelve SOLO JSON con {message}."
        )
        payload = {
            "self": self.config.get("agent", {}).get("name"),
            "other": target_id,
            "plan": plan
        }
        result = await self._call_llm_json(prompt, payload)
        message = result.get("message") if isinstance(result, dict) else None
        if isinstance(message, str) and message.strip():
            return {"type": "start_conversation", "params": {"target_id": target_id, "message": message.strip()}}
        return None

    def _build_heuristic_plan(self, perception: Dict[str, Any]) -> Dict[str, Any]:
        intent = self._select_intent(perception)
        actions = []
        primary = "Explorar la ciudad"
        if intent == "work":
            hotspot = self._pick_hotspot("work")
            actions.append({"type": "move_to", "params": {"x": hotspot.get("x"), "y": hotspot.get("y")}})
            primary = "Buscar oportunidades de trabajo"
        else:
            hotspot = self._pick_hotspot("social" if intent == "social" else "leisure")
            actions.append({"type": "move_to", "params": {"x": hotspot.get("x"), "y": hotspot.get("y")}})
        return {
            "primaryGoal": primary,
            "secondaryGoals": ["Generar conexiones", "Aprender sobre la ciudad"],
            "actions": actions,
            "lastPlanAt": int(asyncio.get_event_loop().time() * 1000)
        }

    async def _generate_plan(self, perception: Dict[str, Any]) -> Dict[str, Any]:
        self._ensure_motivation_state()
        chain = self._motivation_state.get("chain", []) if isinstance(self._motivation_state, dict) else []
        primary = self._motivation_state.get("desire", "Explorar la ciudad") if isinstance(self._motivation_state, dict) else "Explorar la ciudad"
        secondary = [step.get("label") for step in chain[:2]] if chain else ["Generar conexiones", "Aprender sobre la ciudad"]
        return {
            "primaryGoal": str(primary).replace("_", " ")[:120],
            "secondaryGoals": [str(g)[:120] for g in secondary][:2],
            "actions": [],
            "lastPlanAt": int(asyncio.get_event_loop().time() * 1000)
        }

    async def _ensure_plan(self, perception: Dict[str, Any]) -> None:
        if not isinstance(self._plan_state, dict) or self._plan_expired():
            self._plan_state = await self._generate_plan(perception)
            if isinstance(self.long_memory, dict):
                self.long_memory["planState"] = self._plan_state
                self._save_long_memory()

    def _action_succeeded(self, perception: Dict[str, Any]) -> bool:
        last_action = self._plan_state.get("lastAction") if isinstance(self._plan_state, dict) else None
        if not isinstance(last_action, dict):
            return True
        action_type = last_action.get("type")
        params = last_action.get("params", {}) if isinstance(last_action.get("params"), dict) else {}
        if action_type == "move_to":
            pos = perception.get("position", {}) or {}
            tx, ty = params.get("x"), params.get("y")
            if isinstance(tx, (int, float)) and isinstance(ty, (int, float)):
                if isinstance(pos.get("x"), (int, float)) and isinstance(pos.get("y"), (int, float)):
                    return abs(pos.get("x") - tx) <= 2 and abs(pos.get("y") - ty) <= 2
        if action_type == "enter_building":
            current = perception.get("currentBuilding") or {}
            return current.get("id") == params.get("building_id")
        if action_type == "start_conversation":
            convs = perception.get("conversations", []) or []
            return any(params.get("target_id") in (c.get("participants") or []) for c in convs)
        return True

    def _should_replan(self, perception: Dict[str, Any]) -> bool:
        if not isinstance(self._plan_state, dict):
            return True
        last_at = self._plan_state.get("lastActionAt")
        if not isinstance(last_at, (int, float)):
            return False
        now_ms = int(asyncio.get_event_loop().time() * 1000)
        if now_ms - int(last_at) < self._plan_action_timeout * 1000:
            return False
        return not self._action_succeeded(perception)

    async def _next_plan_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if self._should_replan(perception):
            self._plan_state = await self._generate_plan(perception)
        await self._ensure_plan(perception)
        if not isinstance(self._plan_state, dict):
            return None
        motivation_action = await self._next_motivation_action(perception)
        return motivation_action

    async def _decide_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        decision_config = self.config.get("behavior", {}).get("decisionLoop", {})
        mode = decision_config.get("mode", "heuristic")
        if mode == "llm":
            has_conversation = bool(self._conversation_state) or bool(perception.get("conversations"))
            if has_conversation:
                action = await self._decide_with_llm(perception)
                if not action:
                    action = await self._decide_with_llm(perception, force_conversation=True)
                if action:
                    return action
                return {"type": "wait", "params": {}}
            nearby = perception.get("nearbyAgents", []) or []
            if nearby:
                target_id = nearby[0].get("id")
                message = await self._llm_social_message("greeting", {"target": target_id})
                if target_id and message:
                    return {"type": "start_conversation", "params": {"target_id": target_id, "message": message}}
            action = await self._decide_with_llm(perception)
            if action:
                return action
            goal_action = await self._goal_action(perception)
            if goal_action:
                return goal_action
            plan_action = await self._next_plan_action(perception)
            if plan_action:
                return plan_action
            convo_action = await self._maybe_start_conversation(perception)
            if convo_action:
                return convo_action
        else:
            goal_action = await self._goal_action(perception)
            if goal_action:
                return goal_action
            plan_action = await self._next_plan_action(perception)
            if plan_action:
                return plan_action
        return await self._heuristic_decision(perception)

    def _sanitize_llm_action(self, action: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(action, dict):
            return None
        action_type = action.get("type")
        if not isinstance(action_type, str):
            return None
        params = action.get("params", {}) or {}
        if not isinstance(params, dict):
            params = {}

        if action_type == "move_to":
            x = params.get("x")
            y = params.get("y")
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                return {"type": "move_to", "params": {"x": int(x), "y": int(y)}}
            alt = params.get("position") or params.get("targetPosition")
            if isinstance(alt, dict):
                ax = alt.get("x")
                ay = alt.get("y")
                if isinstance(ax, (int, float)) and isinstance(ay, (int, float)):
                    return {"type": "move_to", "params": {"x": int(ax), "y": int(ay)}}
            tx = params.get("targetX")
            ty = params.get("targetY")
            if isinstance(tx, (int, float)) and isinstance(ty, (int, float)):
                return {"type": "move_to", "params": {"x": int(tx), "y": int(ty)}}
            target_id = params.get("targetId") or params.get("target")
            if isinstance(target_id, str) and target_id:
                target_id = target_id.strip().lower()
                buildings = (self.current_state.get("perception") or {}).get("nearbyBuildings", []) or []
                match = next((b for b in buildings if (b.get("id") == target_id) or (str(b.get("name", "")).lower() == target_id)), None)
                if match:
                    pos = match.get("position") or {}
                    bx, by = pos.get("x"), pos.get("y")
                    if isinstance(bx, (int, float)) and isinstance(by, (int, float)):
                        return {"type": "move_to", "params": {"x": int(bx), "y": int(by)}}
            return None
        if action_type == "enter_building":
            building_id = params.get("building_id")
            if isinstance(building_id, str) and building_id.strip():
                return {"type": "enter_building", "params": {"building_id": building_id.strip()}}
            return None
        if action_type == "speak":
            message = params.get("message")
            if isinstance(message, str):
                return {"type": "speak", "params": {"message": message}}
            return None
        if action_type == "start_conversation":
            target_id = params.get("target_id") or params.get("targetId") or params.get("target") or params.get("to") or params.get("otherId")
            message = params.get("message") or params.get("text")
            if isinstance(target_id, str) and target_id.strip() and isinstance(message, str):
                if self._is_meta_message(message):
                    return None
                return {
                    "type": "start_conversation",
                    "params": {"target_id": target_id.strip(), "message": message}
                }
            return None
        if action_type == "conversation_message":
            conversation_id = params.get("conversation_id") or params.get("conversationId")
            message = params.get("message") or params.get("text")
            if isinstance(message, str):
                if self._is_meta_message(message):
                    return None
                if isinstance(conversation_id, str) and conversation_id.strip():
                    return {
                        "type": "conversation_message",
                        "params": {"conversation_id": conversation_id.strip(), "message": message}
                    }
                target_id = params.get("target_id") or params.get("targetId") or params.get("target") or params.get("to") or params.get("otherId")
                if isinstance(target_id, str) and target_id.strip():
                    return {
                        "type": "conversation_message",
                        "params": {"target_id": target_id.strip(), "message": message}
                    }
            return None
        if action_type == "apply_job":
            job_id = params.get("job_id")
            if isinstance(job_id, str) and job_id.strip():
                return {"type": "apply_job", "params": {"job_id": job_id.strip()}}
            return None
        if action_type == "buy_property":
            property_id = params.get("property_id") or params.get("propertyId")
            if isinstance(property_id, str) and property_id.strip():
                return {"type": "buy_property", "params": {"property_id": property_id.strip()}}
            return None
        if action_type == "vote_job":
            applicant_id = params.get("applicant_id") or params.get("applicantId")
            job_id = params.get("job_id") or params.get("jobId")
            if isinstance(applicant_id, str) and applicant_id.strip() and isinstance(job_id, str) and job_id.strip():
                return {
                    "type": "vote_job",
                    "params": {"applicant_id": applicant_id.strip(), "job_id": job_id.strip()}
                }
            return None
        if action_type == "wait":
            return {"type": "wait", "params": {}}
        return None

    async def _call_llm_json(self, prompt: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        llm_config = self.config.get("llm", {})
        provider = llm_config.get("provider", "")
        api_key = llm_config.get("apiKey", "")
        model = llm_config.get("model", "")
        if not (provider and model):
            return None
        if provider not in ("ollama",) and not api_key:
            return None

        try:
            if provider == "openai":
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}"}
                body = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": json.dumps(payload)}
                    ],
                    "temperature": llm_config.get("temperature", 0.4)
                }
            elif provider == "anthropic":
                url = "https://api.anthropic.com/v1/messages"
                headers = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01"
                }
                body = {
                    "model": model,
                    "system": prompt,
                    "messages": [{"role": "user", "content": json.dumps(payload)}],
                    "max_tokens": llm_config.get("maxTokens", 300)
                }
            elif provider == "minimax-portal":
                base_url = llm_config.get("baseUrl", "https://api.minimax.io/anthropic")
                url = f"{base_url.rstrip('/')}/v1/messages"
                headers = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01"
                }
                body = {
                    "model": model,
                    "system": prompt,
                    "messages": [{"role": "user", "content": json.dumps(payload)}],
                    "max_tokens": llm_config.get("maxTokens", 300)
                }
            elif provider == "ollama":
                base_url = llm_config.get("baseUrl", "http://localhost:11434")
                url = f"{base_url.rstrip('/')}/v1/chat/completions"
                headers = {"Content-Type": "application/json"}
                body = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": json.dumps(payload)}
                    ],
                    "temperature": llm_config.get("temperature", 0.4)
                }
            elif provider == "qwen-oauth":
                base_url = llm_config.get("baseUrl", "https://portal.qwen.ai/v1")
                url = f"{base_url.rstrip('/')}/chat/completions"
                model_name = model.split('/')[-1] if model else "coder-model"
                if model_name not in ("coder-model", "vision-model"):
                    model_name = "coder-model"
                headers = {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "X-DashScope-AuthType": "qwen_oauth"
                }
                body = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": json.dumps(payload)}
                    ],
                    "temperature": llm_config.get("temperature", 0.4)
                }
            else:
                return None

            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=body, headers=headers) as response:
                    data = await response.json()
                    if response.status >= 400:
                        logger.warning(f"LLM error: {data}")
                        return None
            content = None
            if provider in ("openai", "ollama", "qwen-oauth"):
                content = data.get("choices", [{}])[0].get("message", {}).get("content")
            elif provider in ("anthropic", "minimax-portal"):
                parts = data.get("content", [])
                if parts:
                    content = parts[0].get("text")
            if not content:
                return None
            parsed = json.loads(content)
            return parsed if isinstance(parsed, dict) else None
        except (OSError, json.JSONDecodeError, aiohttp.ClientError) as error:
            logger.warning(f"LLM decision failed: {error}")
            return None

    async def _decide_with_llm(self, perception: Dict[str, Any], force_conversation: bool = False, forced_conversation_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        llm_config = self.config.get("llm", {})
        provider = llm_config.get("provider", "")
        api_key = llm_config.get("apiKey", "")
        model = llm_config.get("model", "")
        if not (provider and model):
            return None
        if provider not in ("ollama",) and not api_key:
            return None

        self._prune_goals()
        self._ensure_motivation_state()
        job_applications = await self.list_job_applications()
        payload = {
            "agent": {
                "id": self.agent_id,
                "name": self.config.get("agent", {}).get("name"),
                "personality": self.config.get("agent", {}).get("personality")
            },
            "perception": perception,
            "goals": self._active_goals[-5:],
            "recentContext": self._get_recent_context(),
            "profile": self.long_memory.get("profile"),
            "motivation": self._motivation_state,
            "activeConversations": self._conversation_state,
            "activeConversationsLive": perception.get("conversations", []),
            "forcedConversationId": forced_conversation_id,
            "jobApplications": job_applications
        }
        prompt = (
            "Eres un ciudadano de MOLTVILLE. Actúas solo dentro del mundo, en primera persona. "
            "Nunca menciones IA, modelos, sistemas, pruebas, servidores ni infraestructura. "
            "Usa relaciones, memoria y conversación previa si existen. "
            "Tu respuesta debe AVANZAR el próximo paso del motivo actual (motivation.chain). "
            "Si hay una conversación activa donde tú participas, RESPONDE con conversation_message. "
            "Si no hay conversación y ves a alguien cerca, inicia start_conversation. "
            "Si estás solo, muévete hacia un lugar relevante según tu intención. "
            "No repitas mensajes recientes. "
            "Devuelve SOLO JSON válido con la acción a ejecutar. "
            "Formato: {\"type\": \"move_to|enter_building|speak|apply_job|buy_property|vote_job|wait|start_conversation|conversation_message\", "
            "\"params\": { ... } }."
        )
        if force_conversation:
            prompt = (
                "Hay una conversación activa. Debes responder SOLO con conversation_message. "
                "No uses move_to, enter_building, speak, apply_job, buy_property, vote_job ni start_conversation. "
                "Mantente 100% in-world. Responde con un solo mensaje natural. "
                "Si ves forcedConversationId úsalo como conversation_id. "
                "Devuelve SOLO JSON válido con: {\"type\": \"conversation_message\", \"params\": {\"conversation_id\": \"...\", \"message\": \"...\"}}."
            )

        try:
            if provider == "openai":
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}"}
                body = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": json.dumps(payload)}
                    ],
                    "temperature": llm_config.get("temperature", 0.4)
                }
            elif provider == "anthropic":
                url = "https://api.anthropic.com/v1/messages"
                headers = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01"
                }
                body = {
                    "model": model,
                    "system": prompt,
                    "messages": [{"role": "user", "content": json.dumps(payload)}],
                    "max_tokens": llm_config.get("maxTokens", 300)
                }
            elif provider == "minimax-portal":
                base_url = llm_config.get("baseUrl", "https://api.minimax.io/anthropic")
                url = f"{base_url.rstrip('/')}/v1/messages"
                headers = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01"
                }
                body = {
                    "model": model,
                    "system": prompt,
                    "messages": [{"role": "user", "content": json.dumps(payload)}],
                    "max_tokens": llm_config.get("maxTokens", 300)
                }
            elif provider == "ollama":
                url = "http://localhost:11434/v1/chat/completions"
                headers = {"Content-Type": "application/json"}
                body = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": json.dumps(payload)}
                    ],
                    "temperature": llm_config.get("temperature", 0.4)
                }
            elif provider == "qwen-oauth":
                base_url = llm_config.get("baseUrl", "https://portal.qwen.ai/v1")
                url = f"{base_url.rstrip('/')}/chat/completions"
                model_name = model.split('/')[-1] if model else "coder-model"
                if model_name not in ("coder-model", "vision-model"):
                    model_name = "coder-model"
                headers = {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "X-DashScope-AuthType": "qwen_oauth"
                }
                body = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": json.dumps(payload)}
                    ],
                    "temperature": llm_config.get("temperature", 0.4)
                }
            else:
                return None

            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=body, headers=headers) as response:
                    data = await response.json()
                    if response.status >= 400:
                        logger.warning(f"LLM error: {data}")
                        return None
            content = None
            if provider == "openai" or provider == "ollama" or provider == "qwen-oauth":
                content = data.get("choices", [{}])[0].get("message", {}).get("content")
            elif provider == "anthropic" or provider == "minimax-portal":
                parts = data.get("content", [])
                if parts:
                    content = parts[0].get("text")
            if not content:
                return None
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                # Try to extract JSON object from noisy responses
                start = content.find('{')
                end = content.rfind('}')
                if start != -1 and end != -1 and end > start:
                    snippet = content[start:end + 1]
                    parsed = json.loads(snippet)
                else:
                    raise
            if force_conversation and isinstance(parsed, dict) and parsed.get("type") == "conversation_message":
                params = parsed.get("params") if isinstance(parsed.get("params"), dict) else {}
                if forced_conversation_id and not params.get("conversation_id") and not params.get("conversationId"):
                    params["conversation_id"] = forced_conversation_id
                    parsed["params"] = params
            sanitized = self._sanitize_llm_action(parsed)
            if not sanitized:
                logger.warning("LLM returned invalid action.")
                logger.warning(f"LLM raw: {content[:500]}")
            return sanitized
        except (OSError, json.JSONDecodeError, aiohttp.ClientError) as error:
            logger.warning(f"LLM decision failed: {error}")
            return None

    async def _heuristic_decision(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        self._prune_goals()
        goals = sorted(self._active_goals, key=lambda g: g.get("urgency", 0), reverse=True)
        current_building = perception.get("currentBuilding")
        position = perception.get("position", {}) or {}
        nearby_buildings = perception.get("nearbyBuildings", []) or []
        nearby_agents = perception.get("nearbyAgents", []) or []
        needs = perception.get("needs", {}) or {}
        context = perception.get("context", {}) or {}

        # Update intent with TTL
        now = asyncio.get_event_loop().time()
        if not self._current_intent or not self._intent_expires_at or now >= self._intent_expires_at:
            self._current_intent = self._select_intent(perception)
            ttl = 240 + random.randint(0, 180)
            self._intent_expires_at = now + ttl

        # Political ambition check
        await self._maybe_register_candidate(perception)

        if goals:
            goal = goals[0]
            location = goal.get("location", {})
            target_x = location.get("x")
            target_y = location.get("y")
            building_id = location.get("buildingId")
            if building_id and current_building and current_building.get("id") == building_id:
                return {"type": "speak", "params": {"message": f"Llegué al evento {goal.get('event', {}).get('name', '')}."}}
            if isinstance(target_x, (int, float)) and isinstance(target_y, (int, float)):
                return {"type": "move_to", "params": {"x": int(target_x), "y": int(target_y)}}

        suggested = perception.get("suggestedGoals", []) or []
        for suggestion in suggested:
            target_types = suggestion.get("targetTypes", [])
            target = next((b for b in nearby_buildings if b.get("type") in target_types), None)
            if target:
                if current_building and current_building.get("id") == target.get("id"):
                    return {"type": "speak", "params": {"message": f"Necesitaba {suggestion.get('type')} y ya estoy aquí."}}
                return {"type": "move_to", "params": self._building_target(target)}

        balance = context.get("economy", {}).get("balance", 0)
        job = context.get("economy", {}).get("job")
        if balance < 5 and not job:
            jobs = await self.list_jobs()
            if isinstance(jobs, dict):
                available = [j for j in jobs.get("jobs", []) if not j.get("assignedTo")]
                if available:
                    return {"type": "apply_job", "params": {"job_id": available[0].get("id")}}

        # Social intent: move to hotspots; conversations only via LLM
        if self._current_intent == "social":
            if nearby_agents and len(nearby_agents) >= 4:
                hotspot = self._pick_hotspot("social")
                return {"type": "move_to", "params": hotspot}
            hotspot = self._pick_hotspot("social")
            return {"type": "move_to", "params": hotspot}

        # Work intent: move to job-related hotspots
        if self._current_intent == "work":
            hotspot = self._pick_hotspot("work")
            return {"type": "move_to", "params": hotspot}

        # Leisure intent
        if self._current_intent == "leisure":
            hotspot = self._pick_hotspot("leisure")
            return {"type": "move_to", "params": hotspot}

        if isinstance(position.get("x"), int) and isinstance(position.get("y"), int):
            dx = random.randint(-2, 2)
            dy = random.randint(-2, 2)
            if dx == 0 and dy == 0:
                dx = 1
            return {"type": "move_to", "params": {"x": position["x"] + dx, "y": position["y"] + dy}}

        return {"type": "wait", "params": {}}

    def _building_target(self, building: Dict[str, Any]) -> Dict[str, int]:
        position = building.get("position", {})
        width = building.get("width", 1)
        height = building.get("height", 1)
        return {
            "x": int(position.get("x", 0) + max(width // 2, 0)),
            "y": int(position.get("y", 0) + max(height, 1))
        }

    async def _execute_action(self, action: Dict[str, Any]) -> None:
        if not action or not isinstance(action, dict):
            return
        action_type = action.get("type")
        params = action.get("params", {}) or {}
        await self.sio.emit('telemetry:action', {
            'event': 'agent_action',
            'actionType': action_type,
            'params': params,
            'reason': (self._motivation_state.get('desire') if isinstance(self._motivation_state, dict) else None)
        })
        if action_type == "move_to":
            await self.move_to(params.get("x"), params.get("y"))
        elif action_type == "enter_building":
            await self.enter_building(params.get("building_id"))
        elif action_type == "speak":
            await self.speak(params.get("message", ""))
        elif action_type == "start_conversation":
            await self.start_conversation(params.get("target_id"), params.get("message", ""))
        elif action_type == "conversation_message":
            conversation_id = params.get("conversation_id")
            if not conversation_id:
                target_id = params.get("target_id")
                convs = (self.current_state.get("perception") or {}).get("conversations", []) or []
                match = next((c for c in convs if target_id in (c.get("participants") or [])), None)
                conversation_id = match.get("id") if isinstance(match, dict) else None
            if conversation_id:
                await self.send_conversation_message(conversation_id, params.get("message", ""))
        elif action_type == "apply_job":
            await self.apply_job(params.get("job_id"))
        elif action_type == "buy_property":
            await self.buy_property(params.get("property_id"))
        elif action_type == "vote_job":
            await self.vote_job(params.get("applicant_id"), params.get("job_id"))
        elif action_type == "wait":
            return
        if isinstance(self._plan_state, dict):
            self._plan_state["lastAction"] = {"type": action_type, "params": params}
            self._plan_state["lastActionAt"] = int(asyncio.get_event_loop().time() * 1000)
            if isinstance(self.long_memory, dict):
                self.long_memory["planState"] = self._plan_state
                self._save_long_memory()
    
    async def connect_to_moltville(self) -> Dict[str, Any]:
        """
        Connect to MOLTVILLE server
        
        Returns:
            Connection status and initial state
        """
        try:
            await self.sio.connect(self.config['server']['url'])
            
            # Wait for registration
            timeout = 10
            elapsed = 0
            while not self.connected and elapsed < timeout:
                await asyncio.sleep(0.5)
                elapsed += 0.5
            
            if not self.connected:
                raise Exception("Failed to register with server")

            await self._ensure_profile()
            await self._send_profile_update()
            try:
                perception = await self.perceive()
                await self._ensure_plan(perception)
                await self._send_profile_update()
                first_action = await self._next_plan_action(perception)
                if first_action:
                    await self._execute_action(first_action)
            except Exception:
                pass

            decision_config = self.config.get("behavior", {}).get("decisionLoop", {})
            if decision_config.get("enabled", False):
                if not self._decision_task or self._decision_task.done():
                    self._decision_task = asyncio.create_task(self._run_decision_loop())
            elif self.config.get("behavior", {}).get("autoExplore", False):
                if not self._auto_task or self._auto_task.done():
                    self._auto_task = asyncio.create_task(self._run_auto_explore())
            
            return {
                "success": True,
                "agentId": self.agent_id,
                "position": self.current_state.get('position'),
                "message": f"Welcome to MOLTVILLE, {self.config['agent']['name']}!"
            }
        
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def perceive(self) -> Dict[str, Any]:
        """
        Get current perceptions of the world
        
        Returns:
            Dictionary with current position, nearby agents, buildings, etc.
        """
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        
        try:
            # Request perception update
            await self.sio.emit('agent:perceive', {})
            
            # Wait for update
            await asyncio.sleep(0.5)
            
            return self.current_state.get('perception', {})
        
        except Exception as e:
            logger.error(f"Perception failed: {e}")
            return {"error": str(e)}
    
    async def move(self, target_x: int, target_y: int) -> Dict[str, Any]:
        """
        Move to target coordinates
        
        Args:
            target_x: Target X coordinate
            target_y: Target Y coordinate
        
        Returns:
            Success status and new position
        """
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        
        try:
            await self.sio.emit('agent:move', {
                'targetX': target_x,
                'targetY': target_y
            })
            
            return {
                "success": True,
                "target": {"x": target_x, "y": target_y}
            }
        
        except Exception as e:
            logger.error(f"Move failed: {e}")
            return {"error": str(e)}

    async def move_to(self, target_x: int, target_y: int) -> Dict[str, Any]:
        """
        Move to target coordinates using pathfinding

        Args:
            target_x: Target X coordinate
            target_y: Target Y coordinate

        Returns:
            Success status and new target
        """
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}

        try:
            await self.sio.emit('agent:moveTo', {
                'targetX': target_x,
                'targetY': target_y
            })

            return {
                "success": True,
                "target": {"x": target_x, "y": target_y}
            }

        except Exception as e:
            logger.error(f"MoveTo failed: {e}")
            return {"error": str(e)}
    
    async def speak(self, message: str) -> Dict[str, Any]:
        """
        Say something that nearby agents can hear
        
        Args:
            message: What to say
        
        Returns:
            Success status
        """
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        
        try:
            await self.sio.emit('agent:speak', {
                'message': message
            })
            self._record_episode('speak', {"message": message})
            return {
                "success": True,
                "message": message
            }
        
        except Exception as e:
            logger.error(f"Speak failed: {e}")
            return {"error": str(e)}

    async def start_conversation(self, target_id: str, message: str) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered"}
        payload = {"targetId": target_id, "message": message}
        result = await self._http_request('POST', f"/api/moltbot/{self.agent_id}/conversations/start", payload)
        if not result.get('error'):
            conv = result.get('conversation') or {}
            conv_id = conv.get('id')
            if conv_id:
                self._conversation_state[target_id] = conv_id
                self._record_episode('conversation_started', {"conversationId": conv_id, "with": target_id})
        return result

    async def send_conversation_message(self, conversation_id: str, message: str) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered"}
        payload = {"message": message}
        result = await self._http_request('POST', f"/api/moltbot/{self.agent_id}/conversations/{conversation_id}/message", payload)
        if not result.get('error'):
            self._record_episode('conversation_message', {
                "conversationId": conversation_id,
                "message": message
            })
        return result
    
    async def enter_building(self, building_id: str) -> Dict[str, Any]:
        """
        Enter a building
        
        Args:
            building_id: ID of building to enter
        
        Returns:
            Success status
        """
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        
        try:
            await self.sio.emit('agent:action', {
                'actionType': 'enter_building',
                'target': building_id,
                'params': {}
            })
            
            return {
                "success": True,
                "building": building_id
            }
        
        except Exception as e:
            logger.error(f"Enter building failed: {e}")
            return {"error": str(e)}
    
    async def leave_building(self) -> Dict[str, Any]:
        """
        Leave current building
        
        Returns:
            Success status
        """
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        
        try:
            await self.sio.emit('agent:action', {
                'actionType': 'leave_building',
                'target': None,
                'params': {}
            })
            
            return {"success": True}
        
        except Exception as e:
            logger.error(f"Leave building failed: {e}")
            return {"error": str(e)}

    async def get_balance(self) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        return await self._http_request('GET', f"/api/economy/balance/{self.agent_id}")

    async def list_jobs(self) -> Dict[str, Any]:
        return await self._http_request('GET', "/api/economy/jobs")

    async def list_job_applications(self) -> List[Dict[str, Any]]:
        jobs = await self.list_jobs()
        if not isinstance(jobs, dict):
            return []
        items = []
        for job in jobs.get("jobs", []) or []:
            app = job.get("application")
            if isinstance(app, dict):
                items.append({
                    "jobId": job.get("id"),
                    "applicantId": app.get("applicantId"),
                    "votes": app.get("votes", 0),
                    "createdAt": app.get("createdAt")
                })
        return items

    async def get_job_application(self) -> Optional[Dict[str, Any]]:
        if not self.agent_id:
            return None
        return await self._http_request('GET', f"/api/economy/jobs/applications/{self.agent_id}")

    async def vote_job(self, applicant_id: str, job_id: str) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        if not applicant_id or not job_id:
            return {"error": "applicant_id and job_id are required"}
        payload = {"applicantId": applicant_id, "voterId": self.agent_id, "jobId": job_id}
        return await self._http_request('POST', "/api/economy/jobs/vote", payload)

    async def list_properties(self) -> Dict[str, Any]:
        return await self._http_request('GET', "/api/economy/properties")

    async def apply_job(self, job_id: str) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        if not job_id:
            return {"error": "job_id is required"}
        payload = {"agentId": self.agent_id, "jobId": job_id}
        return await self._http_request('POST', "/api/economy/jobs/apply", payload)

    async def buy_property(self, property_id: str) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        if not property_id:
            return {"error": "property_id is required"}
        payload = {"agentId": self.agent_id, "propertyId": property_id}
        return await self._http_request('POST', "/api/economy/properties/buy", payload)

    async def submit_review(self, target_agent_id: str, score: float, tags: Optional[List[str]] = None, reason: Optional[str] = None) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        if not target_agent_id:
            return {"error": "target_agent_id is required"}
        payload = {
            "agentId": target_agent_id,
            "reviewerId": self.agent_id,
            "score": score,
            "tags": tags,
            "reason": reason
        }
        return await self._http_request('POST', "/api/economy/reviews", payload)

    async def propose_negotiation(self, target_id: str, job_id: Optional[str] = None) -> Dict[str, Any]:
        if not self.agent_id or not target_id:
            return {"error": "Missing agent_id or target_id"}
        payload = {
            "from": self.agent_id,
            "to": target_id,
            "ask": {"type": "vote_job", "jobId": job_id},
            "offer": {"type": "favor", "value": 1, "reason": "voto"},
            "reason": "negociacion_trabajo"
        }
        return await self._http_request('POST', "/api/negotiation/propose", payload)

    async def get_reviews(self, agent_id: Optional[str] = None) -> Dict[str, Any]:
        target_id = agent_id or self.agent_id
        if not target_id:
            return {"error": "agent_id is required"}
        return await self._http_request('GET', f"/api/economy/reviews/{target_id}")

    async def list_properties(self) -> Dict[str, Any]:
        return await self._http_request('GET', "/api/economy/properties")

    async def buy_property(self, property_id: str) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        if not property_id:
            return {"error": "property_id is required"}
        payload = {"agentId": self.agent_id, "propertyId": property_id}
        return await self._http_request('POST', "/api/economy/properties/buy", payload)

    async def list_property_for_sale(self, property_id: str, price: float) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        if not property_id:
            return {"error": "property_id is required"}
        payload = {"agentId": self.agent_id, "propertyId": property_id, "price": price}
        return await self._http_request('POST', "/api/economy/properties/list", payload)

    async def get_transactions(self) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        return await self._http_request('GET', f"/api/economy/transactions/{self.agent_id}")

    async def consume_item(self, item_id: str, quantity: float = 1) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        if not item_id:
            return {"error": "item_id is required"}
        payload = {"agentId": self.agent_id, "itemId": item_id, "quantity": quantity}
        return await self._http_request('POST', "/api/economy/inventory/consume", payload)
    
    def get_system_prompt(self) -> str:
        """
        Generate system prompt for LLM with current context
        
        Returns:
            System prompt string
        """
        perception = self.current_state.get('perception', {})
        position = perception.get('position', {})
        current_building = perception.get('currentBuilding')
        nearby_agents = perception.get('nearbyAgents', [])
        nearby_buildings = perception.get('nearbyBuildings', [])
        needs = perception.get('needs') or {}
        suggested_goals = perception.get('suggestedGoals', [])

        needs_summary = ', '.join([f"{key}: {value:.0f}" for key, value in needs.items()]) if needs else 'None'
        goals_summary = ', '.join([goal.get('type', 'unknown') for goal in suggested_goals]) if suggested_goals else 'None'
        
        prompt = f"""You are a citizen of MOLTVILLE, a virtual city populated by AI agents.

Your name: {self.config['agent']['name']}
Your personality: {self.config['agent']['personality']}

Current Status:
- Location: {"Inside " + current_building['name'] if current_building else f"Outside at ({position.get('x')}, {position.get('y')})"} 
- Nearby Agents: {', '.join([a.get('id', 'Unknown') for a in nearby_agents]) if nearby_agents else 'None'}
- Nearby Buildings: {', '.join([b.get('name', 'Unknown') for b in nearby_buildings]) if nearby_buildings else 'None'}
- Needs: {needs_summary}
- Suggested Goals: {goals_summary}

Available Actions:
- move(x, y) - Move to coordinates
- move_to(x, y) - Move to coordinates with pathfinding
- speak(message) - Say something
- enter_building(building_id) - Enter a building
- leave_building() - Exit current building
- perceive() - Update your perceptions

Make decisions that align with your personality. Consider your current location and who is nearby.
Be social, explore the city, and build relationships with other agents.
"""
        return prompt
    
    async def disconnect(self):
        """Disconnect from server"""
        if self.connected:
            await self.sio.disconnect()
            self.connected = False
            logger.info("Disconnected from MOLTVILLE")


# Skill interface for OpenClaw
async def initialize_skill():
    """Initialize the MOLTVILLE skill"""
    skill = MOLTVILLESkill()
    return skill

async def execute_command(skill: MOLTVILLESkill, command: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute a skill command
    
    Args:
        skill: Initialized skill instance
        command: Command name
        params: Command parameters
    
    Returns:
        Command result
    """
    commands = {
        'connect': skill.connect_to_moltville,
        'perceive': skill.perceive,
        'move': lambda: skill.move(params.get('x'), params.get('y')),
        'move_to': lambda: skill.move_to(params.get('x'), params.get('y')),
        'speak': lambda: skill.speak(params.get('message')),
        'enter_building': lambda: skill.enter_building(params.get('building_id')),
        'leave_building': skill.leave_building,
        'get_balance': skill.get_balance,
        'list_jobs': skill.list_jobs,
        'list_properties': skill.list_properties,
        'list_job_applications': skill.list_job_applications,
        'apply_job': lambda: skill.apply_job(params.get('job_id')),
        'buy_property': lambda: skill.buy_property(params.get('property_id')),
        'vote_job': lambda: skill.vote_job(params.get('applicant_id'), params.get('job_id')),
        'submit_review': lambda: skill.submit_review(
            params.get('target_agent_id'),
            params.get('score'),
            params.get('tags'),
            params.get('reason')
        ),
        'get_reviews': lambda: skill.get_reviews(params.get('agent_id')),
        'list_properties': skill.list_properties,
        'buy_property': lambda: skill.buy_property(params.get('property_id')),
        'list_property_for_sale': lambda: skill.list_property_for_sale(
            params.get('property_id'),
            params.get('price')
        ),
        'get_transactions': skill.get_transactions,
        'consume_item': lambda: skill.consume_item(
            params.get('item_id'),
            params.get('quantity', 1)
        ),
        'get_prompt': lambda: {"prompt": skill.get_system_prompt()},
        'disconnect': skill.disconnect
    }
    
    if command not in commands:
        return {"error": f"Unknown command: {command}"}
    
    return await commands[command]()


# Example usage
if __name__ == "__main__":
    async def main():
        skill = await initialize_skill()
        
        # Connect
        result = await skill.connect_to_moltville()
        print("Connect result:", result)
        
        if result.get('success'):
            # Perceive
            perception = await skill.perceive()
            print("Perception:", perception)
            
            # Get system prompt for LLM
            prompt = skill.get_system_prompt()
            print("\nSystem Prompt:\n", prompt)
            
            # Stay connected and active
            print("\nRebelBot is now active in MOLTVILLE. Press Ctrl+C to exit.")
            while True:
                await asyncio.sleep(1)
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
