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

    def _remember_utterance(self, speaker_id: str, message: str) -> None:
        if not speaker_id or not message:
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

    def _get_recent_context(self) -> Dict[str, Any]:
        return {
            "recentUtterances": list(self._recent_utterances),
            "episodes": self.long_memory.get("episodes", [])[-10:],
            "relationshipNotes": self.long_memory.get("relationships", {})
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

    async def _decide_action(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        decision_config = self.config.get("behavior", {}).get("decisionLoop", {})
        mode = decision_config.get("mode", "heuristic")
        if mode == "llm":
            action = await self._decide_with_llm(perception)
            if action:
                return action
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
            target_id = params.get("target_id")
            message = params.get("message")
            if isinstance(target_id, str) and target_id.strip() and isinstance(message, str):
                return {
                    "type": "start_conversation",
                    "params": {"target_id": target_id.strip(), "message": message}
                }
            return None
        if action_type == "conversation_message":
            conversation_id = params.get("conversation_id")
            message = params.get("message")
            if isinstance(conversation_id, str) and conversation_id.strip() and isinstance(message, str):
                return {
                    "type": "conversation_message",
                    "params": {"conversation_id": conversation_id.strip(), "message": message}
                }
            return None
        if action_type == "apply_job":
            job_id = params.get("job_id")
            if isinstance(job_id, str) and job_id.strip():
                return {"type": "apply_job", "params": {"job_id": job_id.strip()}}
            return None
        if action_type == "wait":
            return {"type": "wait", "params": {}}
        return None

    async def _decide_with_llm(self, perception: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        llm_config = self.config.get("llm", {})
        provider = llm_config.get("provider", "")
        api_key = llm_config.get("apiKey", "")
        model = llm_config.get("model", "")
        if not (provider and model):
            return None
        if provider not in ("ollama",) and not api_key:
            return None

        self._prune_goals()
        payload = {
            "agent": {
                "id": self.agent_id,
                "name": self.config.get("agent", {}).get("name"),
                "personality": self.config.get("agent", {}).get("personality")
            },
            "perception": perception,
            "goals": self._active_goals[-5:],
            "recentContext": self._get_recent_context(),
            "activeConversations": self._conversation_state,
            "activeConversationsLive": perception.get("conversations", [])
        }
        prompt = (
            "Eres el motor de decisiones de un agente en MOLTVILLE. "
            "Contexto crítico: usa relaciones, memoria y conversación previa si existen. "
            "Si hay una conversación activa donde tú participas, RESPONDE con conversation_message. "
            "Si no hay conversación y ves a alguien cerca, inicia start_conversation. "
            "Si estás solo, ve a la plaza central para encontrar a otros. "
            "No repitas mensajes recientes. "
            "Devuelve SOLO JSON válido con la acción a ejecutar. "
            "Formato: {\"type\": \"move_to|enter_building|speak|apply_job|wait|start_conversation|conversation_message\", "
            "\"params\": { ... } }."
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
            parsed = json.loads(content)
            sanitized = self._sanitize_llm_action(parsed)
            if not sanitized:
                logger.warning("LLM returned invalid action, falling back to heuristic.")
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

        if needs.get("social", 100) <= 40 and nearby_agents:
            target = min(nearby_agents, key=lambda a: a.get("distance", 999))
            target_id = target.get('id')
            conv_id = self._conversation_state.get(target_id)
            if conv_id:
                return {
                    "type": "conversation_message",
                    "params": {"conversation_id": conv_id, "message": "¿Cómo vas hoy?"}
                }
            return {
                "type": "start_conversation",
                "params": {"target_id": target_id, "message": "Hola, ¿cómo estás?"}
            }

        if isinstance(position.get("x"), int) and isinstance(position.get("y"), int):
            dx = random.randint(-3, 3)
            dy = random.randint(-3, 3)
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
        if action_type == "move_to":
            await self.move_to(params.get("x"), params.get("y"))
        elif action_type == "enter_building":
            await self.enter_building(params.get("building_id"))
        elif action_type == "speak":
            await self.speak(params.get("message", ""))
        elif action_type == "start_conversation":
            await self.start_conversation(params.get("target_id"), params.get("message", ""))
        elif action_type == "conversation_message":
            await self.send_conversation_message(params.get("conversation_id"), params.get("message", ""))
        elif action_type == "apply_job":
            await self.apply_job(params.get("job_id"))
        elif action_type == "wait":
            return
    
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

    async def apply_job(self, job_id: str) -> Dict[str, Any]:
        if not self.agent_id:
            return {"error": "Agent not registered yet"}
        if not job_id:
            return {"error": "job_id is required"}
        payload = {"agentId": self.agent_id, "jobId": job_id}
        return await self._http_request('POST', "/api/economy/jobs/apply", payload)

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
        'apply_job': lambda: skill.apply_job(params.get('job_id')),
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
            
            # Say hello
            await skill.speak("Hello MOLTVILLE!")
            
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
