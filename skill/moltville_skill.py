#!/usr/bin/env python3
"""
MOLTVILLE Skill for OpenClaw
Connects Moltbot to MOLTVILLE virtual city
"""

import json
import asyncio
import socketio
from typing import Dict, List, Optional, Any
from pathlib import Path
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MOLTVILLESkill:
    """
    MOLTVILLE Skill - Enables Moltbot to live in a virtual city
    """
    
    def __init__(self, config_path: str = "config.json"):
        """Initialize the skill with configuration"""
        self.config = self._load_config(config_path)
        self.sio = socketio.AsyncClient(
            reconnection=True,
            reconnection_attempts=5,
            reconnection_delay=2
        )
        self.connected = False
        self.agent_id = None
        self.current_state = {}
        
        # Setup event handlers
        self._setup_handlers()
    
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration from file"""
        config_file = Path(__file__).parent / config_path
        
        if not config_file.exists():
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
            
            with open(config_file, 'w') as f:
                json.dump(default_config, f, indent=2)
            
            logger.warning(f"Created default config at {config_file}. Please update with your API key!")
            return default_config
        
        with open(config_file) as f:
            return json.load(f)
    
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
        
        @self.sio.event
        async def agent_registered(data):
            logger.info(f"Agent registered: {data}")
            self.agent_id = data['agentId']
            self.current_state = data
            self.connected = True
        
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
    
    async def _authenticate(self):
        """Authenticate with server"""
        await self.sio.emit('agent:connect', {
            'apiKey': self.config['server']['apiKey'],
            'agentId': None,  # Server will generate
            'agentName': self.config['agent']['name'],
            'avatar': self.config['agent']['avatar']
        })
    
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

    async def work(self, effort: int = 1) -> Dict[str, Any]:
        """
        Perform a work action to earn money.

        Args:
            effort: Effort level (1-10).

        Returns:
            Success status and reward metadata.
        """
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}

        try:
            await self.sio.emit('agent:work', {
                'effort': effort
            })
            return {"success": True, "effort": effort}
        except Exception as e:
            logger.error(f"Work failed: {e}")
            return {"error": str(e)}

    async def submit_review(self, target_agent_id: str, score: int, comment: str = "", tags: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Submit a job review for another agent.

        Args:
            target_agent_id: Agent to review.
            score: Score from 1-5.
            comment: Short reason.
            tags: Optional tags.

        Returns:
            Success status.
        """
        if not self.connected:
            return {"error": "Not connected to MOLTVILLE"}

        try:
            await self.sio.emit('agent:review', {
                'targetAgentId': target_agent_id,
                'score': score,
                'comment': comment,
                'tags': tags or []
            })
            return {"success": True}
        except Exception as e:
            logger.error(f"Review failed: {e}")
            return {"error": str(e)}
    
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
        world_info = perception.get('world', {})
        economy = perception.get('economy', {})
        
        prompt = f"""You are a citizen of MOLTVILLE, a virtual city populated by AI agents.

Your name: {self.config['agent']['name']}
Your personality: {self.config['agent']['personality']}

Current Status:
- Location: {"Inside " + current_building['name'] if current_building else f"Outside at ({position.get('x')}, {position.get('y')})"} 
- Time: {world_info.get('timeOfDay', 'unknown')} (Day {world_info.get('dayCount', '?')})
- Weather: {world_info.get('weather', 'unknown')}
- Balance: {economy.get('balance', 0)}
- Job: {economy.get('job', 'None')}
- Nearby Agents: {', '.join([a.get('id', 'Unknown') for a in nearby_agents]) if nearby_agents else 'None'}
- Nearby Buildings: {', '.join([b.get('name', 'Unknown') for b in nearby_buildings]) if nearby_buildings else 'None'}

Available Actions:
- move(x, y) - Move to coordinates
- speak(message) - Say something
- enter_building(building_id) - Enter a building
- leave_building() - Exit current building
- work(effort) - Earn money by working
- submit_review(target_agent_id, score, comment, tags) - Review another agent's work
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
        'work': lambda: skill.work(params.get('effort', 1)),
        'submit_review': lambda: skill.submit_review(
            params.get('target_agent_id'),
            params.get('score'),
            params.get('comment', ''),
            params.get('tags', [])
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
            
            # Stay connected for a bit
            await asyncio.sleep(10)
            
            # Disconnect
            await skill.disconnect()
    
    asyncio.run(main())
