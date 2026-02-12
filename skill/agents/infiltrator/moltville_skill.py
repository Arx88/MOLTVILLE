#!/usr/bin/env python3
"""
MOLTVILLE Skill for OpenClaw
Connects Moltbot to MOLTVILLE virtual city
"""

import json
import asyncio
import socketio
import aiohttp
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from collections import deque
import logging
import random
import time

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
        self._conversation_last_handled_ts: Dict[str, float] = {}
        self._conversation_last_incoming: Dict[str, str] = {}
        self._conversation_repeat_count: Dict[str, int] = {}
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
        self._pending_followup_action: Optional[Dict[str, Any]] = None
        self._pending_followup_until: float = 0
        self._followup_ttl_seconds = 120
        self._recent_action_types: List[str] = []
        self._internal_thought: str = ""
        self._external_intent: str = ""
        self._external_speech: str = ""
        self._coord_commit_update_cooldown = 45
        self._last_coord_commit_update: Dict[str, float] = {}
        self._coord_create_cooldown = 120
        self._last_coord_create_ts: float = 0
        self._coord_state: Dict[str, Any] = {}
        self._decision_lock = asyncio.Lock()
        self._action_lock = asyncio.Lock()
        self._conversation_lock = asyncio.Lock()
        self._decision_lock_timeout = 8
        self._action_lock_timeout = 20
        self._conversation_lock_timeout = 10
        self._recent_message_hashes: deque = deque(maxlen=24)
        self._health_metrics = self.long_memory.get("healthMetrics", {}) if isinstance(self.long_memory, dict) else {}
        self._action_queue: List[Dict[str, Any]] = self.long_memory.get("pendingActions", []) if isinstance(self.long_memory, dict) else []
        self._http_cfg = self.config.get("http", {}) if isinstance(self.config.get("http"), dict) else {}
        self._job_strategy_state = self.long_memory.get("jobStrategy", {}) if isinstance(self.long_memory, dict) else {}
        
        # Setup event handlers
        self._setup_handlers()

    def _get_http_base_url(self) -> str:
        server_url = self.config.get('server', {}).get('url', '')
        if server_url.startswith('ws://'):
            return 'http://' + server_url[len('ws://'):]
        if server_url.startswith('wss://'):
            return 'https://' + server_url[len('wss://'):]
        return server_url

    def _update_health_metric(self, key: str, ok: bool = True) -> None:
        metrics = self._health_metrics if isinstance(self._health_metrics, dict) else {}
        entry = metrics.get(key, {}) if isinstance(metrics.get(key), dict) else {}
        if ok:
            entry["ok"] = int(entry.get("ok", 0)) + 1
        else:
            entry["error"] = int(entry.get("error", 0)) + 1
        entry["lastAt"] = int(asyncio.get_event_loop().time() * 1000)
        metrics[key] = entry
        self._health_metrics = metrics
        if isinstance(self.long_memory, dict):
            self.long_memory["healthMetrics"] = metrics

    def _save_action_queue(self) -> None:
        if isinstance(self.long_memory, dict):
            self.long_memory["pendingActions"] = self._action_queue[-40:]
            self._save_long_memory()

    def _enqueue_action(self, action: Dict[str, Any], source: str = "plan", priority: float = 1.0) -> None:
        if not isinstance(action, dict):
            return
        item = {
            "action": action,
            "priority": float(priority),
            "source": source,
            "attempts": 0,
            "createdAt": int(asyncio.get_event_loop().time() * 1000)
        }
        self._action_queue.append(item)
        self._action_queue.sort(key=lambda it: float(it.get("priority", 0.0)), reverse=True)
        self._action_queue = self._action_queue[:40]
        self._save_action_queue()
        self._log_cycle("action_enqueued", source=source, action=action.get("type"), priority=round(float(priority), 3), queueDepth=len(self._action_queue))

    def _save_job_strategy(self) -> None:
        if isinstance(self.long_memory, dict):
            self.long_memory["jobStrategy"] = self._job_strategy_state
            self._save_long_memory()

    def _job_block_active(self) -> bool:
        if not isinstance(self._job_strategy_state, dict):
            return False
        until = self._job_strategy_state.get("blockedUntilMs")
        if not isinstance(until, (int, float)):
            return False
        now_ms = int(asyncio.get_event_loop().time() * 1000)
        return now_ms < int(until)

    def _set_job_block(self, code: str, message: str, retry_after_ms: int = 120000, target_job_id: Optional[str] = None) -> None:
        now_ms = int(asyncio.get_event_loop().time() * 1000)
        self._job_strategy_state = {
            **(self._job_strategy_state if isinstance(self._job_strategy_state, dict) else {}),
            "blocked": True,
            "code": code,
            "message": message,
            "targetJobId": target_job_id,
            "lastFailureAtMs": now_ms,
            "blockedUntilMs": now_ms + max(10000, int(retry_after_ms))
        }
        self._save_job_strategy()

    def _clear_job_block(self) -> None:
        if not isinstance(self._job_strategy_state, dict):
            self._job_strategy_state = {}
        self._job_strategy_state["blocked"] = False
        self._job_strategy_state["code"] = None
        self._job_strategy_state["message"] = None
        self._job_strategy_state["blockedUntilMs"] = 0
        self._save_job_strategy()

    def _register_job_feedback(self, action: str, result: Dict[str, Any], target_job_id: Optional[str] = None) -> None:
        if not isinstance(result, dict):
            return

        # Normalize payloads: success can come as top-level dict or wrapped under {success,result}.
        payload = result
        nested = result.get("result")
        if isinstance(nested, dict):
            payload = {**nested, **{k: v for k, v in result.items() if k not in ("result",)}}

        status_raw = payload.get("status", result.get("status"))
        status = int(status_raw) if isinstance(status_raw, (int, float)) else None
        error_msg = payload.get("error") or result.get("error")
        error = str(error_msg or "").lower()
        ok_flag = bool(result.get("success")) if "success" in result else None
        has_error = bool(error_msg)

        now_ms = int(asyncio.get_event_loop().time() * 1000)
        if not isinstance(self._job_strategy_state, dict):
            self._job_strategy_state = {}
        if action == "apply_job":
            self._job_strategy_state["lastApplyAtMs"] = now_ms
        if action == "vote_job":
            self._job_strategy_state["lastVoteAtMs"] = now_ms

        success = False
        if has_error:
            success = False
        elif ok_flag is True:
            success = True
        elif isinstance(status, int):
            success = status < 400
        else:
            # No explicit status + no error -> treat as success (common for _http_request happy path)
            success = True

        if success:
            if action == "apply_job":
                self._job_strategy_state["targetJobId"] = target_job_id
            self._clear_job_block()
            return

        # Infer blocker and cooldown from known backend errors
        retry_ms = 90000
        code = "JOB_PROGRESS_BLOCKED"
        if "not enough trust" in error:
            code = "INSUFFICIENT_TRUST"
            retry_ms = 180000
        elif "insufficient reputation" in error:
            code = "INSUFFICIENT_REPUTATION"
            retry_ms = 240000
        elif "already" in error:
            code = "ALREADY_APPLIED_OR_VOTED"
            retry_ms = 120000
        elif status == 403:
            code = "FORBIDDEN_POLICY"
            retry_ms = 240000
        elif status == 400:
            code = "INVALID_JOB_TRANSITION"
            retry_ms = 120000

        self._set_job_block(code, error_msg or "job progression blocked", retry_after_ms=retry_ms, target_job_id=target_job_id)
        self._log_cycle("job_blocked", code=code, status=status or 0, message=error_msg, retryAfterMs=retry_ms)
    def _dequeue_action(self) -> Optional[Dict[str, Any]]:
        if not self._action_queue:
            return None
        item = self._action_queue.pop(0)
        self._save_action_queue()
        action = item.get("action") if isinstance(item, dict) else None
        self._log_cycle("action_dequeued", source=item.get("source") if isinstance(item, dict) else None, action=(action.get("type") if isinstance(action, dict) else None), queueDepth=len(self._action_queue))
        return item

    async def _http_request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        base_url = self._get_http_base_url().rstrip('/')
        url = f"{base_url}{path}"
        headers = {}
        api_key = self.config.get('server', {}).get('apiKey')
        if isinstance(api_key, str) and api_key.strip():
            headers['x-api-key'] = api_key.strip()
        timeout_s = float(self._http_cfg.get("timeoutSec", 6))
        retries = int(self._http_cfg.get("retries", 2))
        backoff = float(self._http_cfg.get("backoffSec", 0.4))

        for attempt in range(retries + 1):
            try:
                timeout = aiohttp.ClientTimeout(total=timeout_s)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.request(method, url, json=payload, headers=headers) as response:
                        text = await response.text()
                        try:
                            data = json.loads(text) if text else {}
                        except json.JSONDecodeError:
                            data = {"raw": text}
                        if response.status >= 500 and attempt < retries:
                            await asyncio.sleep(backoff * (attempt + 1))
                            continue
                        if response.status >= 400:
                            self._update_health_metric("http", ok=False)
                            logger.warning(
                                "HTTP %s %s failed: status=%s error=%s payload=%s",
                                method,
                                path,
                                response.status,
                                data.get('error', f"HTTP {response.status}"),
                                (payload or {})
                            )
                            return {"error": data.get('error', f"HTTP {response.status}"), "status": response.status}
                        self._update_health_metric("http", ok=True)
                        return data if isinstance(data, dict) else {"data": data}
            except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as error:
                if attempt < retries:
                    await asyncio.sleep(backoff * (attempt + 1))
                    continue
                logger.error(f"HTTP request failed: method={method} path={path} error={error}")
                self._update_health_metric("http", ok=False)
                return {"error": str(error), "status": 0}
        return {"error": "HTTP retry exhaustion", "status": 0}
    
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
                "discipline": float(traits.get("discipline", self._traits.get("discipline", 0.5))),
                "morality": float(traits.get("morality", self._traits.get("morality", 0.6))),
                "aggression": float(traits.get("aggression", self._traits.get("aggression", 0.3))),
                "deception": float(traits.get("deception", self._traits.get("deception", 0.2))),
                "empathy": float(traits.get("empathy", self._traits.get("empathy", 0.6))),
                "risk": float(traits.get("risk", self._traits.get("risk", 0.4)))
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
                {"id": "build_reputation", "label": "Necesito reputaciÃ³n positiva", "requires": ["desire_president"]},
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

        # Mark initial desire steps as done to advance the chain
        for step in chain:
            if isinstance(step, dict) and str(step.get("id", "")).startswith("desire_"):
                step["status"] = "done"

        # Social progress from relationships (memory + live context)
        rel_notes = self.long_memory.get("relationships", {}) if isinstance(self.long_memory, dict) else {}
        best_rel = max([
            (r.get("affinity", 0) + r.get("trust", 0) + r.get("respect", 0))
            for r in (rel_notes.values() if isinstance(rel_notes, dict) else [])
        ] + [0])
        if best_rel >= 4:
            for step_id in ("build_support", "help_citizens", "build_relationship"):
                step = next((s for s in chain if s.get("id") == step_id), None)
                if step and self._chain_ready(chain, step):
                    self._mark_chain_done(chain, step_id)

        relationships_live = (perception.get("context") or {}).get("relationships", {}) or {}
        approval = self._approval_ratio(relationships_live) if isinstance(relationships_live, dict) else 0
        if approval >= 0.25:
            for step_id in ("get_votes", "win_votes"):
                step = next((s for s in chain if s.get("id") == step_id), None)
                if step and self._chain_ready(chain, step):
                    self._mark_chain_done(chain, step_id)

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
            "Eres un agente reciÃ©n llegado a MOLTVILLE. Debes crear tu propio perfil. "
            "No menciones IA, modelos ni sistemas. Responde SOLO JSON. "
            "Incluye: traits (ambition,sociability,curiosity,discipline,morality,aggression,deception,empathy,risk) valores 0-1, "
            "goals (3 metas de largo plazo), style (como hablas), "
            "backstory (2 frases), values (3 palabras), quirks (2 hÃ¡bitos), "
            "tactics (2 palabras sobre tu forma de conseguir cosas)."
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

    def _required_outcome_text(self, step_id: Optional[str]) -> str:
        if not step_id:
            return ""
        mapping = {
            "build_support": "Ganar apoyo de otro ciudadano y acordar una ayuda concreta",
            "help_citizens": "Ofrecer ayuda real a otro ciudadano y definir la ayuda",
            "build_relationship": "Profundizar vÃ­nculo con alguien y acordar prÃ³xima acciÃ³n",
            "get_votes": "Solicitar apoyo/voto para un objetivo concreto",
            "win_votes": "Asegurar apoyo explÃ­cito o acuerdo de voto",
            "register_candidate": "Registrarte como candidato o definir cÃ³mo hacerlo",
            "need_money": "Conseguir una acciÃ³n concreta para obtener dinero",
            "get_job": "Solicitar/asegurar un trabajo concreto",
            "open_business": "Definir pasos concretos para abrir el negocio",
            "buy_house": "Avanzar en compra de vivienda (propiedad especÃ­fica o fondos)"
        }
        return mapping.get(step_id, "")

    def _validate_action_with_step(self, action: Dict[str, Any], current_step: Optional[Dict[str, Any]]) -> bool:
        """
        Structural validation only â€” blocks truly incoherent pairings.
        Never blocks on message content, keywords, or nextStep presence.
        The LLM owns the content; we own structural coherence.
        """
        if not current_step or not isinstance(action, dict):
            return True
        step_id = current_step.get("id") if isinstance(current_step, dict) else None
        if not step_id:
            return True
        a_type = action.get("type")
        # Only reject hard structural contradictions
        # e.g. trying to buy a house when the goal step is social bonding
        if step_id in {"build_support", "help_citizens", "build_relationship", "get_votes", "win_votes"}:
            if a_type in ("buy_property",):
                self._log_cycle("validate_rejected", step=step_id, action=a_type,
                                reason="economic_action_on_social_step")
                return False
        return True

    def _current_step(self) -> Optional[Dict[str, Any]]:
        chain = self._motivation_state.get("chain", []) if isinstance(self._motivation_state, dict) else []
        pending = [step for step in chain if step.get("status") != "done" and self._chain_ready(chain, step)]
        return pending[0] if pending else None

    def _mark_step_done(self, step_id: Optional[str]) -> None:
        if not step_id:
            return
        chain = self._motivation_state.get("chain", []) if isinstance(self._motivation_state, dict) else []
        self._mark_chain_done(chain, step_id)
        if isinstance(self.long_memory, dict):
            self.long_memory["motivationState"] = self._motivation_state
            self._save_long_memory()

    def _at_target(self, perception: Dict[str, Any], x: int, y: int, tol: int = 0) -> bool:
        pos = perception.get("position") or {}
        px = pos.get("x")
        py = pos.get("y")
        if not isinstance(px, (int, float)) or not isinstance(py, (int, float)):
            return False
        return abs(int(px) - int(x)) <= tol and abs(int(py) - int(y)) <= tol

    def _should_advance_on_arrival(self, step_id: Optional[str]) -> bool:
        return step_id in {"build_support", "help_citizens", "build_relationship", "get_votes", "win_votes"}

    def _init_traits(self) -> Dict[str, float]:
        traits = self.config.get("agent", {}).get("traits", {}) if isinstance(self.config.get("agent", {}), dict) else {}
        if isinstance(traits, dict) and traits:
            return {
                "ambition": float(traits.get("ambition", 0.5)),
                "sociability": float(traits.get("sociability", 0.6)),
                "curiosity": float(traits.get("curiosity", 0.5)),
                "discipline": float(traits.get("discipline", 0.5)),
                "morality": float(traits.get("morality", 0.6)),
                "aggression": float(traits.get("aggression", 0.3)),
                "deception": float(traits.get("deception", 0.2)),
                "empathy": float(traits.get("empathy", 0.6)),
                "risk": float(traits.get("risk", 0.4))
            }
        # Stable fallback by agent id hash
        seed = sum(ord(c) for c in (self.agent_id or self.config.get("agent", {}).get("name", "agent")))
        random.seed(seed)
        return {
            "ambition": round(random.uniform(0.3, 0.9), 2),
            "sociability": round(random.uniform(0.3, 0.9), 2),
            "curiosity": round(random.uniform(0.3, 0.9), 2),
            "discipline": round(random.uniform(0.3, 0.9), 2),
            "morality": round(random.uniform(0.2, 0.9), 2),
            "aggression": round(random.uniform(0.1, 0.9), 2),
            "deception": round(random.uniform(0.1, 0.9), 2),
            "empathy": round(random.uniform(0.2, 0.9), 2),
            "risk": round(random.uniform(0.1, 0.9), 2)
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
            "ciclo", "coordenad", "estabilidad", "monitoreo", "instruccion", "instrucciÃ³n", "parametro", "parÃ¡metro",
            "secuencia", "diagnostic", "observacion", "observaciÃ³n"
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
        personality = str(self.config.get("agent", {}).get("personality") or "comunidad local")
        desire = str((self._motivation_state or {}).get("desire") or "prosperidad compartida")
        platform = f"Programa orientado a {desire} con enfoque {personality}."
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
            "Eres un ciudadano de MOLTVILLE evaluando una interacciÃ³n social. "
            "Devuelve SOLO JSON con campos: affinityDelta, trustDelta, respectDelta (-2 a 2), "
            "y note (mÃ¡x 8 palabras) en tono in-world."
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
            "note": "buena impresiÃ³n" if score > 0 else ("tenso" if score < 0 else "neutral")
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
            logger.info("Agent registered: agentId=%s pos=%s", data.get('agentId'), (data.get('position') or {}))
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
            from_id = message.get('fromId') or message.get('from')
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

    def _log_cycle(self, stage: str, **fields: Any) -> None:
        payload = {"stage": stage, "agentId": self.agent_id, **fields}
        logger.info("cycle=%s", json.dumps(payload, ensure_ascii=False))

    def _update_cognition(self, *, internal: Optional[str] = None, external_intent: Optional[str] = None, external_speech: Optional[str] = None) -> None:
        if isinstance(internal, str):
            self._internal_thought = internal.strip()
        if isinstance(external_intent, str):
            self._external_intent = external_intent.strip()
        if isinstance(external_speech, str):
            self._external_speech = external_speech.strip()

    def _infer_internal_thought(self, action_type: str, params: Dict[str, Any]) -> str:
        desire = self._motivation_state.get("desire") if isinstance(self._motivation_state, dict) else ""
        step = self._current_step() if hasattr(self, "_current_step") else None
        step_label = step.get("label") if isinstance(step, dict) else ""
        target = params.get("target_id") or params.get("proposal_id") or params.get("building_id") or params.get("job_id")
        parts = [f"Objetivo: {desire}" if desire else "", f"Paso: {step_label}" if step_label else "", f"AcciÃ³n: {action_type}" if action_type else "", f"Target: {target}" if target else ""]
        return " | ".join([p for p in parts if p])[:220]

    def _infer_external_intent(self, action_type: str, params: Dict[str, Any]) -> str:
        if action_type in ("start_conversation", "conversation_message", "speak"):
            return "Comunicar y negociar con otros"
        if action_type.startswith("coord_"):
            return "Coordinar acciÃ³n colectiva"
        if action_type in ("apply_job", "buy_property", "vote_job"):
            return "Mejorar situaciÃ³n econÃ³mica"
        if action_type in ("move_to", "enter_building"):
            target = params.get("target_id") or params.get("building_id")
            return f"Moverse hacia {target}" if target else "Moverse hacia un objetivo"
        return "Actuar segÃºn plan actual"

    async def _send_profile_update(self) -> None:
        if not self.connected:
            return
        now_ms = int(asyncio.get_event_loop().time() * 1000)
        if now_ms - self._profile_last_sent < 5000:
            return
        self._profile_last_sent = now_ms
        payload = {
            "agentId": self.agent_id,
            "profile": self.long_memory.get("profile"),
            "traits": self._traits,
            "motivation": self._motivation_state,
            "plan": self._plan_state,
            "cognition": {
                "internalThought": self._internal_thought,
                "externalIntent": self._external_intent,
                "externalSpeech": self._external_speech,
                "updatedAt": now_ms
            }
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
            try:
                perception = await self.perceive()
                if not perception or isinstance(perception, dict) and perception.get("error"):
                    self._update_health_metric("perceive", ok=False)
                    await asyncio.sleep(interval_sec)
                    continue
                self._update_health_metric("perceive", ok=True)
                await self._purge_stale_conversations(perception)
                await self._ensure_plan(perception)
                await self._send_profile_update()
                try:
                    await asyncio.wait_for(self._decision_lock.acquire(), timeout=self._decision_lock_timeout)
                except asyncio.TimeoutError:
                    self._log_cycle("decision_skip", reason="decision_lock_timeout")
                    await asyncio.sleep(interval_sec)
                    continue
                try:
                    action = await self._decide_action(perception)
                    if action:
                        self._log_cycle("decision", intent=self._current_intent, action=action.get("type"), queueDepth=len(self._action_queue))
                        await self._execute_action(action)
                    else:
                        self._log_cycle("decision_none", intent=self._current_intent, queueDepth=len(self._action_queue), hasConversationState=bool(self._conversation_state))
                finally:
                    if self._decision_lock.locked():
                        self._decision_lock.release()
            except Exception as error:
                self._update_health_metric("decision_loop", ok=False)
                self._log_cycle("decision_error", error=str(error))
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
        try:
            await asyncio.wait_for(self._conversation_lock.acquire(), timeout=self._conversation_lock_timeout)
        except asyncio.TimeoutError:
            self._log_cycle("conversation_skip", reason="conversation_lock_timeout", conversationId=conv_id)
            return
        try:
            now = asyncio.get_event_loop().time()
            last = self._last_conversation_ts.get(conv_id, 0)
            if self._conversation_cooldown and now - last < self._conversation_cooldown:
                return
            perception = await self.perceive()
            if not perception or (isinstance(perception, dict) and perception.get("error")):
                return
            convs = perception.get("conversations", []) or []
            conv = next((c for c in convs if c.get("id") == conv_id), None)
            if not conv:
                return
            messages = conv.get("messages", []) or []
            if not messages:
                return
            last_msg = max(messages, key=lambda m: m.get("timestamp", 0))
            if last_msg.get("from") == self.agent_id:
                return
            last_text = str(last_msg.get("message") or "").strip()
            last_ts = last_msg.get("timestamp", 0)
            if not last_text:
                return
            if last_text == self._last_conversation_msg.get(conv_id):
                return
            action = await self._decide_with_llm(perception, force_conversation=True, forced_conversation_id=conv_id)
            if not action:
                # LLM failed to produce a valid conversation response.
                # Log the failure for observability, then do nothing this cycle.
                # The next conversation:message event will trigger a fresh attempt.
                self._log_cycle("respond_llm_fail", conversationId=conv_id,
                                reason="LLM returned no valid action for active conversation")
                # Clear timestamp so next cycle retries immediately
                self._last_conversation_ts.pop(conv_id, None)
                return
            if action.get("type") in ("conversation_message", "end_conversation"):
                if action.get("type") == "conversation_message":
                    params = action.get("params") if isinstance(action.get("params"), dict) else {}
                    if not params.get("conversation_id"):
                        params["conversation_id"] = conv_id
                        action["params"] = params
                await self._execute_action(action)
                # Use loop-time seconds (same unit used for cooldown comparisons)
                self._last_conversation_ts[conv_id] = asyncio.get_event_loop().time()
                self._last_conversation_msg[conv_id] = last_text
                if last_ts:
                    self._conversation_last_handled_ts[conv_id] = last_ts
                self._conversation_last_incoming[conv_id] = last_text
        except Exception as error:
            self._log_cycle("conversation_error", conversationId=conv_id, error=str(error))
        finally:
            if self._conversation_lock.locked():
                self._conversation_lock.release()

    def _fallback_conversation_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        convs = perception.get("conversations", []) or []
        if not isinstance(convs, list):
            return None
        own = [
            c for c in convs
            if isinstance(c, dict)
            and self.agent_id in (c.get("participants") or [])
            and c.get("active", True)
        ]
        if not own:
            return None
        own.sort(key=lambda c: c.get("lastActivity", c.get("startedAt", 0)), reverse=True)
        conv = own[0]
        conv_id = conv.get("id")
        if not isinstance(conv_id, str) or not conv_id:
            return None
        messages = conv.get("messages", []) or []
        incoming = [m for m in messages if isinstance(m, dict) and m.get("from") != self.agent_id]
        if not incoming:
            return None
        incoming.sort(key=lambda m: m.get("timestamp", 0), reverse=True)
        last = incoming[0]
        last_text = str(last.get("message") or "").strip()
        if not last_text:
            return None
        # Avoid duplicating the exact same fallback for the same incoming text.
        if self._conversation_last_incoming.get(conv_id) == last_text and self._last_conversation_msg.get(conv_id) == last_text:
            return None
        reply = "Te escucho. Dame un minuto y te respondo bien, quiero seguir esta conversación contigo."
        return {
            "type": "conversation_message",
            "params": {
                "conversation_id": conv_id,
                "message": reply
            }
        }

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
            "traits": self._traits,
            "profile": self.long_memory.get("profile"),
            **(payload or {})
        }
        result = await self._call_llm_json(prompt, data)
        message = result.get("message") if isinstance(result, dict) else None
        if isinstance(message, str) and message.strip():
            return message.strip()
        return None

    def _infer_followup_from_message(self, message: str) -> Optional[Dict[str, Any]]:
        if not isinstance(message, str) or not message.strip():
            return None
        text = message.lower()
        if not any(token in text for token in ("ir", "vamos", "ven", "quedemos", "encuentro", "cita", "reun")):
            return None
        mapping = {
            "cafe": {"x": 14, "y": 8},
            "cafÃ©": {"x": 14, "y": 8},
            "plaza": {"x": 16, "y": 18},
            "mercado": {"x": 36, "y": 28},
            "market": {"x": 36, "y": 28},
            "biblioteca": {"x": 24, "y": 6},
            "library": {"x": 24, "y": 6},
            "galer": {"x": 50, "y": 8},
            "park": {"x": 40, "y": 42},
            "parque": {"x": 40, "y": 42},
            "jardin": {"x": 40, "y": 42},
            "jardÃ­n": {"x": 40, "y": 42},
            "inn": {"x": 52, "y": 42},
            "posada": {"x": 52, "y": 42},
            "tienda": {"x": 30, "y": 14},
            "shop": {"x": 30, "y": 14}
        }
        target = None
        for token, pos in mapping.items():
            if token in text:
                target = pos
                break
        if target:
            return {"type": "move_to", "params": target}
        return None

    def _set_followup_action(self, action: Optional[Dict[str, Any]]) -> None:
        if not action:
            return
        self._pending_followup_action = action
        self._pending_followup_until = asyncio.get_event_loop().time() + self._followup_ttl_seconds

    def _pop_followup_action(self) -> Optional[Dict[str, Any]]:
        if not self._pending_followup_action:
            return None
        if asyncio.get_event_loop().time() > self._pending_followup_until:
            self._pending_followup_action = None
            return None
        action = self._pending_followup_action
        self._pending_followup_action = None
        return action

    async def _coordination_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.agent_id:
            return None
        proposals_resp = await self.list_coordination_proposals(mine=False, limit=20)
        proposals = proposals_resp.get("proposals", []) if isinstance(proposals_resp, dict) else []
        if not isinstance(proposals, list):
            proposals = []

        active = [p for p in proposals if isinstance(p, dict) and p.get("status") in ("pending", "in_progress")]
        my_open_commitments = 0
        for proposal in active:
            for commitment in (proposal.get("commitments") or []):
                if isinstance(commitment, dict) and commitment.get("agentId") == self.agent_id and commitment.get("status") in ("pending", "in_progress"):
                    my_open_commitments += 1

        self._coord_state = {
            "activeCount": len(active),
            "myOpenCommitments": my_open_commitments
        }

        if active:
            active.sort(key=lambda p: p.get("updatedAt", 0), reverse=True)

            def _score(proposal: Dict[str, Any]) -> int:
                members = proposal.get("members") or []
                joined = any(isinstance(m, dict) and m.get("agentId") == self.agent_id for m in members)
                commitments = proposal.get("commitments") or []
                open_count = sum(1 for c in commitments if isinstance(c, dict) and c.get("status") in ("pending", "in_progress"))
                done_count = sum(1 for c in commitments if isinstance(c, dict) and c.get("status") == "done")
                # Prefer proposals where agent is already engaged and there is still meaningful pending work.
                return (1000 if joined else 0) + max(0, 10 - open_count) + done_count

            target = sorted(active, key=_score, reverse=True)[0]
            proposal_id = target.get("id")
            if not isinstance(proposal_id, str) or not proposal_id:
                return None

            members = target.get("members") or []
            required_roles = target.get("requiredRoles") or []
            role_capacity = sum(int(r.get("min", 1)) for r in required_roles if isinstance(r, dict)) or 3
            joined = any(isinstance(m, dict) and m.get("agentId") == self.agent_id for m in members)
            if not joined and len(members) < role_capacity:
                return {"type": "coord_join", "params": {"proposal_id": proposal_id, "role": "participant"}}

            commitments = [c for c in (target.get("commitments") or []) if isinstance(c, dict)]
            own_open = [c for c in commitments if c.get("agentId") == self.agent_id and c.get("status") in ("pending", "in_progress")]
            own_done = [c for c in commitments if c.get("agentId") == self.agent_id and c.get("status") == "done"]

            if not own_open and not own_done:
                open_total = sum(1 for c in commitments if c.get("status") in ("pending", "in_progress"))
                if open_total < max(2, role_capacity):
                    task = f"support_{(target.get('category') or 'community')}"
                    return {"type": "coord_commit", "params": {"proposal_id": proposal_id, "task": task, "role": "participant"}}
                return None

            if own_open:
                own = own_open[0]
                commitment_id = own.get("id")
                if not isinstance(commitment_id, str) or not commitment_id:
                    return None
                now_s = asyncio.get_event_loop().time()
                last_update = float(self._last_coord_commit_update.get(commitment_id, 0))
                if now_s - last_update < self._coord_commit_update_cooldown:
                    return None
                status = own.get("status")
                progress = own.get("progress", 0)
                if status in ("pending", "in_progress") and (not isinstance(progress, (int, float)) or progress < 100):
                    next_progress = 100 if (not isinstance(progress, (int, float)) or progress >= 70) else int(progress) + 30
                    self._last_coord_commit_update[commitment_id] = now_s
                    return {
                        "type": "coord_update_commit",
                        "params": {
                            "proposal_id": proposal_id,
                            "commitment_id": commitment_id,
                            "status": "done" if next_progress >= 100 else "in_progress",
                            "progress": min(100, next_progress),
                            "notes": "avance_autonomo"
                        }
                    }

            all_commitments = commitments
            if all_commitments and all(c.get("status") == "done" for c in all_commitments):
                return {
                    "type": "coord_set_status",
                    "params": {
                        "proposal_id": proposal_id,
                        "status": "done",
                        "summary": "objetivo comunitario completado"
                    }
                }

            return None

        nearby = perception.get("nearbyAgents", []) or []
        now_s = asyncio.get_event_loop().time()
        if len(nearby) >= 3 and (now_s - self._last_coord_create_ts) >= self._coord_create_cooldown:
            self._last_coord_create_ts = now_s
            leader_name = self.config.get("agent", {}).get("name", "Ciudadano")
            title = f"Asamblea vecinal liderada por {leader_name}"
            description = "Coordinar tareas comunitarias y repartir responsabilidades"
            return {
                "type": "coord_create_proposal",
                "params": {
                    "title": title,
                    "description": description,
                    "category": "community",
                    "required_roles": [
                        {"role": "organizer", "min": 1},
                        {"role": "support", "min": 2}
                    ]
                }
            }
        return None

    def _action_repeat_penalty(self, action: Dict[str, Any]) -> float:
        if not isinstance(action, dict):
            return 0.0
        action_type = str(action.get("type") or "")
        if not action_type:
            return 0.0
        tail = self._recent_action_types[-6:]
        repeats = sum(1 for item in tail if item == action_type)
        if repeats <= 1:
            return 0.0
        return min(1.8, 0.45 * (repeats - 1))

    def _action_vector_score(self, action: Dict[str, Any], perception: Dict[str, Any]) -> Tuple[float, Dict[str, float]]:
        if not isinstance(action, dict):
            return -999.0, {"invalid": 1.0}
        action_type = str(action.get("type") or "")
        if not action_type:
            return -999.0, {"invalid": 1.0}

        needs = (perception.get("needs") or {}) if isinstance(perception, dict) else {}
        social_need = float(needs.get("social", 100) or 100)
        hunger = float(needs.get("hunger", 0) or 0)
        energy = float(needs.get("energy", 100) or 100)
        context = (perception.get("context") or {}) if isinstance(perception, dict) else {}
        econ = (context.get("economy") or {}) if isinstance(context, dict) else {}
        balance = float(econ.get("balance", 0) or 0)
        has_job = bool((econ.get("job") or {}).get("id") if isinstance(econ.get("job"), dict) else econ.get("job"))
        has_property = len(econ.get("properties") or []) > 0 if isinstance(econ.get("properties"), list) else False
        active_events = [e for e in (perception.get("events") or []) if isinstance(e, dict) and e.get("status") == "active"]
        coord_active = int(self._coord_state.get("activeCount", 0)) if isinstance(self._coord_state, dict) else 0
        my_coord_open = int(self._coord_state.get("myOpenCommitments", 0)) if isinstance(self._coord_state, dict) else 0

        # Vector components (higher is better except risk).
        comp = {
            "econ_progress": 0.0,
            "social_progress": 0.0,
            "coord_progress": 0.0,
            "survival": 0.0,
            "event_progress": 0.0,
            "risk": 0.0,
        }

        if action_type == "apply_job":
            comp["econ_progress"] = 1.2 if not has_job else -0.3
            comp["risk"] = 0.2 if has_job else 0.05
        elif action_type == "buy_property":
            comp["econ_progress"] = 1.1 if (has_job and not has_property and balance >= 90) else -0.2
            comp["risk"] = 0.35 if balance < 110 else 0.15
        elif action_type == "vote_job":
            comp["econ_progress"] = 0.95
            comp["social_progress"] = 0.25
            comp["risk"] = 0.05
        elif action_type in ("start_conversation", "conversation_message"):
            comp["social_progress"] = 0.75 + ((100.0 - social_need) / 120.0)
            comp["risk"] = 0.1
        elif action_type in ("coord_update_commit", "coord_commit", "coord_join", "coord_create_proposal"):
            comp["coord_progress"] = 0.9
            if action_type == "coord_update_commit":
                comp["coord_progress"] += 0.35 - (0.2 * max(0, my_coord_open - 1))
            elif action_type == "coord_commit":
                comp["coord_progress"] += 0.2 - (0.15 * my_coord_open)
            elif action_type == "coord_join":
                comp["coord_progress"] += 0.1 - (0.1 * max(0, coord_active - 1))
            else:
                comp["coord_progress"] += 0.15 if coord_active == 0 else -0.15
            comp["risk"] = 0.1
        elif action_type in ("join_event", "create_event"):
            comp["event_progress"] = 0.75 + (0.25 if active_events else 0.0)
            comp["social_progress"] = 0.2
            comp["risk"] = 0.1
        elif action_type == "move_to":
            comp["survival"] = 0.45 + (0.2 if hunger > 65 else 0.0) - (0.2 if energy < 35 else 0.0)
            comp["risk"] = 0.05
        elif action_type == "wait":
            comp["survival"] = 0.35 if energy < 30 else 0.05
            comp["risk"] = 0.0
        else:
            comp["social_progress"] = 0.2
            comp["risk"] = 0.1

        # Dynamic policy weights: shift priorities by state instead of hardcoded branch forcing.
        weights = {
            "econ_progress": 1.15 if not has_job else (0.95 if not has_property else 0.7),
            "social_progress": 0.9 if social_need < 55 else 0.65,
            "coord_progress": 0.85,
            "survival": 0.7 if (hunger > 60 or energy < 40) else 0.45,
            "event_progress": 0.55,
            "risk": 0.9,
        }

        utility = (
            weights["econ_progress"] * comp["econ_progress"]
            + weights["social_progress"] * comp["social_progress"]
            + weights["coord_progress"] * comp["coord_progress"]
            + weights["survival"] * comp["survival"]
            + weights["event_progress"] * comp["event_progress"]
            - weights["risk"] * comp["risk"]
        )
        return float(utility), comp
    async def _economy_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        context = (perception.get("context") or {}) if isinstance(perception, dict) else {}
        econ = (context.get("economy") or {}) if isinstance(context, dict) else {}
        has_job = bool((econ.get("job") or {}).get("id") if isinstance(econ.get("job"), dict) else econ.get("job"))
        balance = float(econ.get("balance", 0) or 0)
        properties = econ.get("properties") if isinstance(econ.get("properties"), list) else []

        # Refresh every cycle so votes see latest job applications.
        jobs = []
        fetched = await self.list_jobs()
        if isinstance(fetched, dict):
            jobs = fetched.get("jobs", []) or []
            self.current_state["jobs"] = jobs
        else:
            jobs = self.current_state.get("jobs", []) or []
        open_with_app = [
            j for j in jobs
            if isinstance(j, dict)
            and not j.get("assignedTo")
            and isinstance(j.get("application"), dict)
            and j.get("application", {}).get("applicantId")
            and j.get("application", {}).get("applicantId") != self.agent_id
        ]
        if open_with_app:
            target = sorted(open_with_app, key=lambda j: int((j.get("application") or {}).get("votes", 0)), reverse=True)[0]
            app = target.get("application") or {}
            return {
                "type": "vote_job",
                "params": {
                    "applicant_id": app.get("applicantId"),
                    "job_id": target.get("id")
                }
            }

        if not has_job:
            available = [j for j in jobs if isinstance(j, dict) and not j.get("assignedTo") and not j.get("application")]
            if available:
                return {"type": "apply_job", "params": {"job_id": available[0].get("id")}}

        if has_job and not properties and balance >= 90:
            # Refresh market each cycle; avoid stale property cache blocking purchases.
            props = []
            listed = await self.list_properties()
            if isinstance(listed, dict):
                props = listed.get("properties", []) or []
                self.current_state["properties"] = props
            else:
                props = self.current_state.get("properties", []) or []
            affordable = [
                p for p in props
                if isinstance(p, dict)
                and p.get("forSale")
                and float(p.get("price", 999999)) <= balance
            ]
            if affordable:
                cheapest = sorted(affordable, key=lambda p: float(p.get("price", 999999)))[0]
                return {"type": "buy_property", "params": {"property_id": cheapest.get("id")}}

        return None

    def _event_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        events = [e for e in (perception.get("events") or []) if isinstance(e, dict)]
        active = [e for e in events if e.get("status") == "active"]
        if not active:
            return None
        target = active[0]
        event_id = target.get("id")
        if isinstance(event_id, str) and event_id:
            return {"type": "join_event", "params": {"event_id": event_id}}
        return None

    async def _goal_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        coordination = await self._coordination_action(perception)
        motivation = await self._next_motivation_action(perception)
        economy = await self._economy_action(perception)
        event_action = self._event_action(perception)

        candidates = [c for c in (coordination, motivation, economy, event_action) if isinstance(c, dict)]
        if not candidates:
            return None

        scored = []
        for candidate in candidates:
            utility, vector = self._action_vector_score(candidate, perception)
            penalty = self._action_repeat_penalty(candidate)
            final_score = utility - penalty
            scored.append((final_score, candidate, vector, penalty))

        scored.sort(key=lambda item: item[0], reverse=True)
        self._log_cycle("goal_vector_scores", top=[
            {
                "type": item[1].get("type"),
                "score": round(float(item[0]), 4),
                "penalty": round(float(item[3]), 4),
                "vector": {k: round(float(v), 4) for k, v in (item[2] or {}).items()}
            }
            for item in scored[:3]
        ])
        if len(scored) > 1:
            for score, candidate, _, _ in scored[1:3]:
                self._enqueue_action(candidate, source="goal_buffer", priority=max(0.1, score))
        return scored[0][1]

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
            "Eres un ciudadano de MOLTVILLE. Genera un saludo breve y natural para iniciar conversaciÃ³n. "
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

    async def _job_recovery_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        nearby_agents = perception.get("nearbyAgents", []) or []
        if nearby_agents:
            target = nearby_agents[0]
            target_id = target.get("id")
            if target_id:
                reason = (self._job_strategy_state or {}).get("code") if isinstance(self._job_strategy_state, dict) else None
                msg = await self._llm_social_message("job_recovery", {"reasonCode": reason, "targetId": target_id})
                if isinstance(msg, str) and msg.strip():
                    return {"type": "start_conversation", "params": {"target_id": target_id, "message": msg.strip()}}
        return {"type": "move_to", "params": self._pick_hotspot("social")}

    async def _work_action_candidate(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        context = perception.get("context", {}) or {}
        economy = context.get("economy", {}) or {}
        if economy.get("job"):
            self._clear_job_block()
            return None

        # If blocked by trust/reputation/policy, pivot to recovery instead of re-applying forever.
        if self._job_block_active():
            return await self._job_recovery_action(perception)

        # Refresh every cycle to avoid stale applications/vote targets.
        jobs = []
        fetched = await self.list_jobs()
        if isinstance(fetched, dict):
            jobs = fetched.get("jobs", []) or []
            self.current_state["jobs"] = jobs
        else:
            jobs = self.current_state.get("jobs", []) or []

        applications = await self.list_job_applications()
        mine = applications.get("application") if isinstance(applications, dict) else None
        if isinstance(mine, dict) and mine.get("jobId"):
            self._job_strategy_state["targetJobId"] = mine.get("jobId")
            self._save_job_strategy()
            # Keep progressing the labor market: while our own application is pending,
            # cast votes for other open applications to help the market converge.
            open_with_app = [
                j for j in jobs
                if isinstance(j, dict)
                and not j.get("assignedTo")
                and isinstance(j.get("application"), dict)
                and j.get("application", {}).get("applicantId")
                and j.get("application", {}).get("applicantId") != self.agent_id
            ]
            if open_with_app:
                target = sorted(open_with_app, key=lambda j: int((j.get("application") or {}).get("votes", 0)), reverse=True)[0]
                app = target.get("application") or {}
                return {
                    "type": "vote_job",
                    "params": {"applicant_id": app.get("applicantId"), "job_id": target.get("id")}
                }
            return await self._job_recovery_action(perception)

        available = [
            j for j in jobs
            if isinstance(j, dict) and not j.get("assignedTo") and not j.get("application") and j.get("id")
        ]
        if available:
            target_job_id = available[0].get("id")
            self._job_strategy_state["targetJobId"] = target_job_id
            self._save_job_strategy()
            return {"type": "apply_job", "params": {"job_id": target_job_id}}
        return None

    async def _pre_interaction_decision(self, perception: Dict[str, Any]) -> Dict[str, Any]:
        now = asyncio.get_event_loop().time()
        if not self._current_intent or not self._intent_expires_at or now >= self._intent_expires_at:
            self._current_intent = self._select_intent(perception)
            self._intent_expires_at = now + (240 + random.randint(0, 180))

        convs = perception.get("conversations", []) or []
        own_live_conversation = any(
            isinstance(c, dict) and self.agent_id in (c.get("participants") or []) and c.get("active", True)
            for c in convs
        )
        has_active_conversation = bool(self._conversation_state) or own_live_conversation
        if has_active_conversation:
            return {"mode": "talk", "reason": "active_conversation"}

        # Balanced gate: keep work progress, but do not suppress social dynamics when intent is social.
        work_action = await self._work_action_candidate(perception)
        if work_action and self._current_intent == "work":
            return {"mode": "act", "reason": "work_ready", "action": work_action}

        return {"mode": "defer", "reason": "default"}

    async def _conversation_to_action_transition(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        convs = perception.get("conversations", []) or []
        if not isinstance(convs, list) or not self.agent_id:
            return None
        own = [c for c in convs if isinstance(c, dict) and self.agent_id in (c.get("participants") or []) and c.get("active", True)]
        if not own:
            return None

        own.sort(key=lambda c: c.get("lastActivity", c.get("startedAt", 0)), reverse=True)
        conv = own[0]
        conv_id = conv.get("id")
        if not isinstance(conv_id, str) or not conv_id:
            return None

        now_ms = int(time.time() * 1000)
        msgs = conv.get("messages", []) or []
        last_activity = int(conv.get("lastActivity") or conv.get("startedAt") or now_ms)
        quiet_ms = now_ms - last_activity
        long_enough = len(msgs) >= 4
        stale = quiet_ms >= 90000

        if not long_enough and not stale:
            return None

        followup = None
        if self._current_intent == "work":
            followup = await self._work_action_candidate(perception)
        if followup:
            self._set_followup_action(followup)
            self._log_cycle("conversation_to_action_followup", conversationId=conv_id, followup=followup.get("type"), reason="work_after_dialogue")
        else:
            self._log_cycle("conversation_to_action_followup", conversationId=conv_id, followup=None, reason="close_stale_or_long")

        return {"type": "end_conversation", "params": {"conversation_id": conv_id}}

    async def _decide_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        queued = self._dequeue_action()
        if queued and isinstance(queued.get("action"), dict):
            return queued.get("action")
        followup = self._pop_followup_action()
        if followup:
            return followup
        # If already at target for a move_to action, mark step done and advance
        step = self._current_step()
        if isinstance(step, dict):
            last_action = (self._plan_state or {}).get("lastAction") if isinstance(self._plan_state, dict) else None
            if isinstance(last_action, dict) and last_action.get("type") == "move_to":
                params = last_action.get("params") if isinstance(last_action.get("params"), dict) else {}
                x = params.get("x")
                y = params.get("y")
                perception = perception or {}
                last_step_id = (self._plan_state or {}).get("lastActionStep") if isinstance(self._plan_state, dict) else None
                if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                    if self._at_target(perception, int(x), int(y), 0) and last_step_id == step.get("id"):
                        self._mark_step_done(step.get("id"))
        transition_action = await self._conversation_to_action_transition(perception)
        if transition_action:
            return transition_action

        pre = await self._pre_interaction_decision(perception)
        self._log_cycle("pre_interaction_decision", mode=pre.get("mode"), reason=pre.get("reason"), intent=self._current_intent)
        if pre.get("mode") == "act" and isinstance(pre.get("action"), dict):
            return pre.get("action")

        # Economy priority only when intent is work; otherwise let vector/planning preserve social dynamism.
        if self._current_intent == "work":
            econ_priority = await self._economy_action(perception)
            if isinstance(econ_priority, dict) and econ_priority.get("type") in ("vote_job", "apply_job", "buy_property"):
                self._log_cycle("economy_priority_action", action=econ_priority.get("type"))
                return econ_priority

        decision_config = self.config.get("behavior", {}).get("decisionLoop", {})
        mode = decision_config.get("mode", "heuristic")
        if mode == "llm":
            convs = perception.get("conversations", []) or []
            own_live_conversation = any(
                isinstance(c, dict) and self.agent_id in (c.get("participants") or []) and c.get("active", True)
                for c in convs
            )
            has_conversation = bool(self._conversation_state) or own_live_conversation
            if has_conversation:
                # Single LLM call for active conversations â€” no double call
                action = await self._decide_with_llm(perception, force_conversation=True)
                if action and action.get("type") in ("conversation_message", "end_conversation"):
                    return action
                # Hard fallback: keep the same conversation alive with a deterministic reply.
                fallback = self._fallback_conversation_action(perception)
                if fallback:
                    return fallback
                # If we cannot resolve an active thread, then continue with heuristic.
                return await self._heuristic_decision(perception)

            action = await self._decide_with_llm(perception)
            if action:
                return action

            # LLM failed on open decision: if work is actionable, execute first.
            if self._current_intent == "work":
                work_action = await self._work_action_candidate(perception)
                if work_action:
                    self._log_cycle("work_action_after_llm_fail", action=work_action.get("type"))
                    return work_action

            # LLM failed on open decision: prioritize social initiation before plan move
            convo_action = await self._maybe_start_conversation(perception)
            if convo_action:
                return convo_action
            plan_action = await self._next_plan_action(perception)
            if plan_action:
                return plan_action
        else:
            plan_action = await self._next_plan_action(perception)
            if plan_action:
                return plan_action
        return await self._heuristic_decision(perception)

    def _sanitize_followup_action(self, followup: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not isinstance(followup, dict):
            return None
        ftype = followup.get("type")
        params = followup.get("params", {}) if isinstance(followup.get("params"), dict) else {}
        if ftype == "move_to":
            x = params.get("x")
            y = params.get("y")
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                return {"type": "move_to", "params": {"x": int(x), "y": int(y)}}
            return None
        if ftype == "enter_building":
            building_id = params.get("building_id") or params.get("buildingId") or params.get("target")
            if isinstance(building_id, str) and building_id.strip():
                return {"type": "enter_building", "params": {"building_id": building_id.strip()}}
            return None
        if ftype == "join_event":
            event_id = params.get("event_id") or params.get("eventId")
            if isinstance(event_id, str) and event_id.strip():
                return {"type": "join_event", "params": {"event_id": event_id.strip()}}
            return None
        if ftype == "wait":
            return {"type": "wait", "params": {}}
        return None

    def _sanitize_llm_action(self, action: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(action, dict):
            return None
        action_type = action.get("type")
        if not isinstance(action_type, str):
            return None
        params = action.get("params", {}) or {}
        if not isinstance(params, dict):
            params = {}
        followup = self._sanitize_followup_action(action.get("nextStep") if isinstance(action.get("nextStep"), dict) else None)

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
            location = params.get("location")
            if isinstance(location, str) and location.strip():
                loc = location.strip().lower()
                mapping = {
                    "plaza": {"x": 16, "y": 18},
                    "plaza central": {"x": 16, "y": 18},
                    "cafe": {"x": 14, "y": 8},
                    "cafÃ©": {"x": 14, "y": 8},
                    "market": {"x": 36, "y": 28},
                    "mercado": {"x": 36, "y": 28},
                    "library": {"x": 24, "y": 6},
                    "biblioteca": {"x": 24, "y": 6}
                }
                if loc in mapping:
                    return {"type": "move_to", "params": mapping[loc]}
            target_id = params.get("targetId") or params.get("target_id") or params.get("target") or params.get("building_id") or params.get("buildingId")
            if isinstance(target_id, str) and target_id:
                raw = target_id.strip()
                target_id = raw.lower()
                buildings = (self.current_state.get("perception") or {}).get("nearbyBuildings", []) or []
                match = next((b for b in buildings if (b.get("id") == target_id) or (str(b.get("name", "")).lower() == target_id)), None)
                if match:
                    pos = match.get("position") or {}
                    bx, by = pos.get("x"), pos.get("y")
                    if isinstance(bx, (int, float)) and isinstance(by, (int, float)):
                        return {"type": "move_to", "params": {"x": int(bx), "y": int(by)}}
                return {"type": "move_to", "params": {"target_id": raw}}
            return None
        if action_type == "create_event":
            name = params.get("name")
            if isinstance(name, str) and name.strip():
                location = params.get("location") if isinstance(params.get("location"), dict) else {}
                return {
                    "type": "create_event",
                    "params": {
                        "name": name.strip(),
                        "type": params.get("type") or "assembly",
                        "startAt": params.get("startAt"),
                        "endAt": params.get("endAt"),
                        "location": location,
                        "description": params.get("description") or "",
                        "goalScope": params.get("goalScope") or "radius"
                    }
                }
            return None
        if action_type == "join_event":
            event_id = params.get("event_id") or params.get("eventId")
            if isinstance(event_id, str) and event_id.strip():
                return {"type": "join_event", "params": {"event_id": event_id.strip()}}
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
            purpose = params.get("purpose")
            if not isinstance(message, str) and isinstance(purpose, str) and purpose.strip():
                message = f"Oye, {purpose.strip()}"
            if isinstance(target_id, str) and target_id.strip() and isinstance(message, str):
                if self._is_meta_message(message):
                    return None
                result = {
                    "type": "start_conversation",
                    "params": {"target_id": target_id.strip(), "message": message}
                }
                if followup:
                    result["nextStep"] = followup
                return result
            return None
        if action_type == "conversation_message":
            conversation_id = params.get("conversation_id") or params.get("conversationId")
            message = params.get("message") or params.get("text")
            if isinstance(message, str):
                if self._is_meta_message(message):
                    return None
                if isinstance(conversation_id, str) and conversation_id.strip():
                    result = {
                        "type": "conversation_message",
                        "params": {"conversation_id": conversation_id.strip(), "message": message}
                    }
                    if followup:
                        result["nextStep"] = followup
                    return result
                target_id = params.get("target_id") or params.get("targetId") or params.get("target") or params.get("to") or params.get("otherId")
                if isinstance(target_id, str) and target_id.strip():
                    result = {
                        "type": "conversation_message",
                        "params": {"target_id": target_id.strip(), "message": message}
                    }
                    if followup:
                        result["nextStep"] = followup
                    return result
            return None
        if action_type == "end_conversation":
            conversation_id = params.get("conversation_id") or params.get("conversationId")
            if isinstance(conversation_id, str) and conversation_id.strip():
                return {"type": "end_conversation", "params": {"conversation_id": conversation_id.strip()}}
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

            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=float(llm_config.get("timeoutSec", 20)))) as session:
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
            if not isinstance(parsed, dict):
                return None
            sanitized = self._sanitize_llm_action(parsed)
            if not sanitized:
                return None
            current_step = self._current_step()
            if not self._validate_action_with_step(sanitized, current_step):
                return None
            return sanitized
        except (OSError, json.JSONDecodeError, aiohttp.ClientError) as error:
            logger.warning(
                "LLM decision failed: type=%s repr=%r",
                type(error).__name__,
                error
            )
            logger.debug("LLM decision traceback", exc_info=True)
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
        chain = self._motivation_state.get("chain", []) if isinstance(self._motivation_state, dict) else []
        pending = [step for step in chain if step.get("status") != "done" and self._chain_ready(chain, step)]
        current_step = pending[0] if pending else None
        payload = {
            "agent": {
                "id": self.agent_id,
                "name": self.config.get("agent", {}).get("name"),
                "personality": self.config.get("agent", {}).get("personality")
            },
            "perception": perception,
            "events": perception.get("events", []),
            "goals": self._active_goals[-5:],
            "recentContext": self._get_recent_context(),
            "profile": self.long_memory.get("profile"),
            "traits": self._traits,
            "motivation": self._motivation_state,
            "currentStep": current_step,
            "requiredOutcome": self._required_outcome_text(current_step.get("id") if isinstance(current_step, dict) else None),
            "activeConversations": self._conversation_state,
            "activeConversationsLive": perception.get("conversations", []),
            "forcedConversationId": forced_conversation_id,
            "jobApplications": job_applications
        }
        prompt = (
            "Eres un ciudadano de MOLTVILLE. ActÃºas solo dentro del mundo, en primera persona. "
            "Nunca menciones IA, modelos, sistemas, pruebas, servidores ni infraestructura. "
            "Usa relaciones, memoria y conversaciÃ³n previa si existen. "
            "Tu respuesta debe AVANZAR el prÃ³ximo paso del motivo actual (motivation.chain) usando currentStep. "
            "Debes cumplir requiredOutcome (si existe). "
            "Si hay una conversaciÃ³n activa donde tÃº participas, RESPONDE con conversation_message alineado a currentStep. "
            "Si no hay conversaciÃ³n y ves a alguien cerca, inicia start_conversation con propÃ³sito del currentStep. "
            "Si estÃ¡s solo, muÃ©vete hacia un lugar relevante segÃºn tu intenciÃ³n. "
            "No repitas mensajes recientes. "
            "Devuelve SOLO JSON vÃ¡lido con la acciÃ³n a ejecutar. "
            "Formato: {\"type\": \"move_to|enter_building|speak|apply_job|buy_property|vote_job|create_event|join_event|wait|start_conversation|conversation_message|end_conversation\", "
            "\"params\": { ... }, \"nextStep\": {\"type\": \"move_to|enter_building|join_event|wait\", \"params\": {...}} }. "
            "Si currentStep es social, tu respuesta debe mencionar el objetivo y proponer un paso concreto. "
            "Si surge una asamblea o reuniÃ³n, usa create_event y elige una ubicaciÃ³n." 
        )
        if force_conversation:
            prompt = (
                "Hay una conversaciÃ³n activa. Debes responder SOLO con conversation_message. "
                "No uses move_to, enter_building, speak, apply_job, buy_property, vote_job ni start_conversation. "
                "Mantente 100% in-world. Responde con un solo mensaje natural. "
                "Alinea tu respuesta con currentStep (el prÃ³ximo paso del motivo). "
                "Si ves forcedConversationId Ãºsalo como conversation_id. "
                "Devuelve SOLO JSON vÃ¡lido con: {\"type\": \"conversation_message|end_conversation\", \"params\": {\"conversation_id\": \"...\", \"message\": \"...\"}, \"nextStep\": {\"type\": \"move_to|enter_building|wait\", \"params\": {...}}}."
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

            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=float(llm_config.get("timeoutSec", 20)))) as session:
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
            logger.warning(
                "LLM decision failed: type=%s repr=%r",
                type(error).__name__,
                error
            )
            logger.debug("LLM decision traceback", exc_info=True)
            return None

    async def _social_initiation_action(self, target_id: str, target_name: str, step: Optional[Dict]) -> Optional[Dict[str, Any]]:
        """
        Attempts to generate a conversation-start action driven entirely by the agent's
        current motivational state. No hardcoded text. If the LLM fails, returns None â€”
        the caller falls back to moving toward a social hotspot.
        """
        if not target_id:
            return None
        # Rate-limit: don't try the same target more than once per 60s
        now = asyncio.get_event_loop().time()
        last_attempt = self._last_conversation_ts.get(f"initiation_{target_id}", 0)
        if now - last_attempt < 60:
            return None

        step_id = step.get("id") if isinstance(step, dict) else None
        step_label = step.get("label") if isinstance(step, dict) else None
        desire = self._motivation_state.get("desire") if isinstance(self._motivation_state, dict) else None
        agent_name = self.config.get("agent", {}).get("name", "ciudadano")

        # Slim payload â€” only what the LLM needs to generate a natural opener
        prompt = (
            "Eres un ciudadano de MOLTVILLE. Genera UN mensaje de apertura breve (1-2 frases) "
            "para iniciar una conversaciÃ³n con otra persona. El mensaje debe ser natural, "
            "surgir de tu estado actual (deseo, paso motivacional, rasgos) y no mencionar "
            "IA, modelos, sistemas ni infraestructura. "
            "Responde ÃšNICAMENTE con JSON vÃ¡lido: {\"message\": \"...\"}. "
            "Sin explicaciones, sin texto fuera del JSON."
        )
        payload = {
            "yo": agent_name,
            "miDeseo": desire,
            "miPasoActual": step_label,
            "misRasgos": {k: round(v, 2) for k, v in list(self._traits.items())[:4]},
            "otraCiudadana": target_name,
            "contextoPrevio": [u.get("message", "") for u in self._recent_utterances[-2:]],
        }
        try:
            result = await self._call_llm_json(prompt, payload)
            message = result.get("message") if isinstance(result, dict) else None
            if isinstance(message, str) and message.strip() and not self._is_meta_message(message):
                self._last_conversation_ts[f"initiation_{target_id}"] = now
                self._log_cycle("social_initiation_ok", target=target_id)
                return {
                    "type": "start_conversation",
                    "params": {"target_id": target_id, "message": message.strip()}
                }

            # LLM failed/unusable content: do not send empty message (backend 400).
            # Return None so caller falls back to another non-broken action.
            self._last_conversation_ts[f"initiation_{target_id}"] = now
            self._log_cycle("social_initiation_skipped", target=target_id, reason="llm_empty_or_meta")
            return None
        except Exception as err:
            self._last_conversation_ts[f"initiation_{target_id}"] = now
            self._log_cycle("social_initiation_skipped", target=target_id, reason="llm_error", error=str(err))
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
                msg = await self._llm_social_message("goal_arrival", {"goal": goal, "buildingId": building_id})
                if isinstance(msg, str) and msg.strip():
                    return {"type": "speak", "params": {"message": msg.strip()}}
            if isinstance(target_x, (int, float)) and isinstance(target_y, (int, float)):
                return {"type": "move_to", "params": {"x": int(target_x), "y": int(target_y)}}
        suggested = perception.get("suggestedGoals", []) or []
        for suggestion in suggested:
            target_types = suggestion.get("targetTypes", [])
            target = next((b for b in nearby_buildings if b.get("type") in target_types), None)
            if target:
                if current_building and current_building.get("id") == target.get("id"):
                    msg = await self._llm_social_message("suggested_goal_arrival", {"suggestion": suggestion, "target": target})
                    if isinstance(msg, str) and msg.strip():
                        return {"type": "speak", "params": {"message": msg.strip()}}
                    return {"type": "move_to", "params": self._building_target(target)}
                return {"type": "move_to", "params": self._building_target(target)}

        balance = context.get("economy", {}).get("balance", 0)
        job = context.get("economy", {}).get("job")
        if balance < 5 and not job:
            jobs = await self.list_jobs()
            if isinstance(jobs, dict):
                available = [j for j in jobs.get("jobs", []) if not j.get("assignedTo")]
                if available:
                    return {"type": "apply_job", "params": {"job_id": available[0].get("id")}}

        # Proactive social hook: when people are nearby and no active conversations,
        # try opening a conversation channel before default movement intent.
        active_conversations = perception.get("conversations", []) or []
        if nearby_agents and not active_conversations:
            for candidate in nearby_agents:
                cand_id = candidate.get("id")
                cand_name = candidate.get("name", cand_id)
                if not cand_id or cand_id in self._conversation_state:
                    continue
                step = self._current_step()
                convo_action = await self._social_initiation_action(cand_id, cand_name, step)
                if convo_action:
                    return convo_action

        # Social intent: try to start a conversation, fall back to moving toward hotspot
        if self._current_intent == "social":
            if nearby_agents:
                # Attempt conversation with the closest agent not already in a conversation with us
                for candidate in nearby_agents:
                    cand_id = candidate.get("id")
                    cand_name = candidate.get("name", cand_id)
                    if not cand_id or cand_id in self._conversation_state:
                        continue
                    step = self._current_step()
                    convo_action = await self._social_initiation_action(cand_id, cand_name, step)
                    if convo_action:
                        return convo_action
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
        try:
            await asyncio.wait_for(self._action_lock.acquire(), timeout=self._action_lock_timeout)
        except asyncio.TimeoutError:
            self._enqueue_action(action, source="action_lock_timeout", priority=1.8)
            self._log_cycle("action_skip", reason="action_lock_timeout", action=action.get("type"))
            return

        action_type = action.get("type")
        params = action.get("params", {}) or {}
        try:
            self._update_cognition(
                internal=self._infer_internal_thought(str(action_type or ""), params),
                external_intent=self._infer_external_intent(str(action_type or ""), params)
            )
            await self.sio.emit('telemetry:action', {
                'event': 'agent_action',
                'actionType': action_type,
                'params': params,
                'reason': (self._motivation_state.get('desire') if isinstance(self._motivation_state, dict) else None)
            })

            if action_type == "move_to":
                x = params.get("x")
                y = params.get("y")
                if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                    await self.move_to(x, y)
            elif action_type == "create_event":
                await self.create_event(params)
            elif action_type == "join_event":
                await self.join_event(params.get("event_id") or params.get("eventId"))
            elif action_type == "enter_building":
                await self.enter_building(params.get("building_id"))
            elif action_type == "speak":
                await self.speak(params.get("message", ""))
            elif action_type == "start_conversation":
                target_id = params.get("target_id")
                message = params.get("message", "")
                result = await self.start_conversation(target_id, message)
                self._log_cycle(
                    "start_conversation_result",
                    target=target_id,
                    status=result.get("status"),
                    error=result.get("error"),
                    conversationId=(result.get("conversation") or {}).get("id")
                )
            elif action_type == "conversation_message":
                cid = params.get("conversation_id")
                if cid:
                    result = await self.send_conversation_message(cid, params.get("message", ""))
                    self._log_cycle(
                        "conversation_message_result",
                        conversationId=cid,
                        status=result.get("status"),
                        error=result.get("error")
                    )
            elif action_type == "end_conversation":
                cid = params.get("conversation_id")
                if cid:
                    await self._http_request("POST", f"/api/moltbot/{self.agent_id}/conversations/{cid}/end")
            elif action_type == "apply_job":
                result = await self.apply_job(params.get("job_id"))
                if isinstance(result, dict) and result.get("error"):
                    recovery = await self._job_recovery_action(self.current_state.get("perception") or {})
                    if isinstance(recovery, dict):
                        self._enqueue_action(recovery, source="job_recovery", priority=1.6)
            elif action_type == "buy_property":
                await self.buy_property(params.get("property_id"))
            elif action_type == "vote_job":
                await self.vote_job(params.get("applicant_id"), params.get("job_id"))
            elif action_type == "coord_create_proposal":
                await self.create_coordination_proposal(params.get("title"), params.get("description", ""), params.get("category", "community"), params.get("required_roles") or [])
            elif action_type == "coord_join":
                await self.join_coordination_proposal(params.get("proposal_id"), params.get("role", "participant"))
            elif action_type == "coord_commit":
                await self.commit_coordination_task(params.get("proposal_id"), params.get("task", "support_proposal"), params.get("role", "participant"))
            elif action_type == "coord_update_commit":
                await self.update_coordination_commitment(params.get("proposal_id"), params.get("commitment_id"), status=params.get("status"), progress=params.get("progress"), notes=params.get("notes", ""))
            elif action_type == "coord_set_status":
                await self.set_coordination_status(params.get("proposal_id"), status=params.get("status", "done"), summary=params.get("summary", ""))

            if isinstance(action_type, str) and action_type:
                self._recent_action_types.append(action_type)
                self._recent_action_types = self._recent_action_types[-12:]
            if isinstance(self._plan_state, dict):
                self._plan_state["lastAction"] = {"type": action_type, "params": params}
                self._plan_state["lastActionAt"] = int(asyncio.get_event_loop().time() * 1000)
                if isinstance(self.long_memory, dict):
                    self.long_memory["planState"] = self._plan_state
                    self._save_long_memory()
            await self._send_profile_update()
            self._update_health_metric("execute_action", ok=True)
        except Exception as error:
            self._update_health_metric("execute_action", ok=False)
            self._log_cycle("action_error", action=action_type, error=str(error))
            prio = 2.4 if action_type in ("apply_job", "buy_property", "vote_job", "coord_commit", "coord_update_commit") else 1.2
            self._enqueue_action(action, source="execute_error", priority=prio)
        finally:
            if self._action_lock.locked():
                self._action_lock.release()

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
    
    async def create_event(self, params: Dict[str, Any]) -> Dict[str, Any]:
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        payload = {
            "name": params.get("name"),
            "type": params.get("type", "assembly"),
            "startAt": params.get("startAt"),
            "endAt": params.get("endAt"),
            "location": params.get("location"),
            "description": params.get("description"),
            "goalScope": params.get("goalScope")
        }
        return await self._http_request('POST', "/api/events", payload)

    async def join_event(self, event_id: str) -> Dict[str, Any]:
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        return await self._http_request('POST', f"/api/events/{event_id}/join", {})

    async def list_coordination_proposals(self, mine: bool = False, status: Optional[str] = None, limit: int = 50) -> Dict[str, Any]:
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        query = [f"limit={max(1, int(limit))}"]
        if mine:
            query.append("mine=true")
        if isinstance(status, str) and status.strip():
            query.append(f"status={status.strip()}")
        suffix = "&".join(query)
        return await self._http_request('GET', f"/api/coordination/proposals?{suffix}")

    async def create_coordination_proposal(self, title: str, description: str = "", category: str = "community", required_roles: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        payload = {
            "title": title,
            "description": description,
            "category": category,
            "requiredRoles": required_roles or []
        }
        return await self._http_request('POST', "/api/coordination/proposals", payload)

    async def join_coordination_proposal(self, proposal_id: str, role: str = "participant") -> Dict[str, Any]:
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        return await self._http_request('POST', f"/api/coordination/proposals/{proposal_id}/join", {"role": role})

    async def commit_coordination_task(self, proposal_id: str, task: str, role: str = "participant") -> Dict[str, Any]:
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        payload = {"task": task, "role": role}
        return await self._http_request('POST', f"/api/coordination/proposals/{proposal_id}/commit", payload)

    async def update_coordination_commitment(self, proposal_id: str, commitment_id: str, status: Optional[str] = None, progress: Optional[int] = None, notes: str = "") -> Dict[str, Any]:
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        payload: Dict[str, Any] = {"notes": notes}
        if isinstance(status, str) and status.strip():
            payload["status"] = status.strip()
        if isinstance(progress, (int, float)):
            payload["progress"] = int(progress)
        return await self._http_request('PATCH', f"/api/coordination/proposals/{proposal_id}/commit/{commitment_id}", payload)

    async def set_coordination_status(self, proposal_id: str, status: str, summary: str = "") -> Dict[str, Any]:
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}
        payload = {"status": status, "summary": summary}
        return await self._http_request('PATCH', f"/api/coordination/proposals/{proposal_id}/status", payload)

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

    async def list_job_applications(self) -> Dict[str, Any]:
        jobs = await self.list_jobs()
        if not isinstance(jobs, dict):
            return {"applications": []}
        items = []
        mine = None
        for job in jobs.get("jobs", []) or []:
            app = job.get("application")
            if isinstance(app, dict):
                item = {
                    "jobId": job.get("id"),
                    "applicantId": app.get("applicantId"),
                    "votes": app.get("votes", 0),
                    "createdAt": app.get("createdAt"),
                    "status": app.get("status", "pending")
                }
                items.append(item)
                if self.agent_id and app.get("applicantId") == self.agent_id:
                    mine = item
        return {"applications": items, "application": mine}

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
        result = await self._http_request('POST', "/api/economy/jobs/vote", payload)
        self._register_job_feedback("vote_job", result, target_job_id=job_id)
        return result

    async def list_properties(self) -> Dict[str, Any]:
        return await self._http_request('GET', "/api/economy/properties")

    async def apply_job(self, job_id: str) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        if not job_id:
            return {"error": "job_id is required"}
        if self._job_block_active():
            return {
                "status": 429,
                "error": self._job_strategy_state.get("message") or "job action cooling down",
                "code": self._job_strategy_state.get("code"),
                "retryAfterMs": self._job_strategy_state.get("blockedUntilMs")
            }
        payload = {"agentId": self.agent_id, "jobId": job_id}
        result = await self._http_request('POST', "/api/economy/jobs/apply", payload)
        self._register_job_feedback("apply_job", result, target_job_id=job_id)
        return result

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


if __name__ == "__main__":
    async def main():
        skill = await initialize_skill()
        result = await skill.connect_to_moltville()
        logger.info("connect_to_moltville result: success=%s agentId=%s", result.get("success"), result.get("agentId"))
        if result.get("success"):
            while True:
                await asyncio.sleep(1)

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass



