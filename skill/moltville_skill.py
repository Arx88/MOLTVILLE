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
        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(method, url, json=payload) as response:
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
                    "decisionInterval": 30000
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
        
        @self.sio.event
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
        
        @self.sio.event
        async def perception_update(data):
            logger.debug(f"Perception update: {data}")
            self.current_state['perception'] = data
        
        @self.sio.event
        async def perception_speech(data):
            logger.info(f"Heard: {data['from']} said '{data['message']}'")
            # This would trigger LLM to decide on response
            # For now just log it
        
        @self.sio.event
        async def error(data):
            logger.error(f"Server error: {data}")
            if isinstance(data, dict) and data.get('message') == 'API key revoked':
                logger.error("API key revoked; disconnecting.")
                await self.disconnect()
    
    async def _authenticate(self):
        """Authenticate with server"""
        await self.sio.emit('agent:connect', {
            'apiKey': self.config['server']['apiKey'],
            'agentId': self.agent_id,  # Reuse agent id if available
            'agentName': self.config['agent']['name'],
            'avatar': self.config['agent']['avatar']
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

            if self.config.get("behavior", {}).get("autoExplore", False):
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
            
            return {
                "success": True,
                "message": message
            }
        
        except Exception as e:
            logger.error(f"Speak failed: {e}")
            return {"error": str(e)}
    
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
            
            # Stay connected for a bit
            await asyncio.sleep(10)
            
            # Disconnect
            await skill.disconnect()
    
    asyncio.run(main())
