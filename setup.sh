#!/bin/bash
# MOLTVILLE - One-Click Setup Script

set -e

echo "🏙️  MOLTVILLE Setup Script"
echo "=========================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

command -v node >/dev/null 2>&1 || {
    echo -e "${RED}❌ Node.js is required but not installed. Install from https://nodejs.org${NC}"
    exit 1
}

command -v python3 >/dev/null 2>&1 || {
    echo -e "${RED}❌ Python 3 is required but not installed.${NC}"
    exit 1
}

echo -e "${GREEN}✅ Node.js $(node --version)${NC}"
echo -e "${GREEN}✅ Python $(python3 --version)${NC}"
echo ""

# Setup backend
echo "📦 Setting up backend..."
cd backend

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Created .env file. Please edit with your settings!${NC}"
fi

npm install
echo -e "${GREEN}✅ Backend dependencies installed${NC}"
echo ""

# Setup skill
echo "🔌 Setting up MOLTVILLE skill..."
cd ../skill

pip3 install python-socketio aiohttp --break-system-packages 2>/dev/null || pip3 install python-socketio aiohttp

if [ ! -f "config.json" ]; then
    cat > config.json <<EOF
{
  "server": {
    "url": "ws://localhost:3001",
    "apiKey": "GENERATE_KEY_FIRST"
  },
  "agent": {
    "name": "MoltbotCitizen",
    "avatar": "char1",
    "personality": "friendly and curious"
  },
  "behavior": {
    "autoExplore": true,
    "conversationInitiation": "moderate",
    "decisionInterval": 30000
  }
}
EOF
    echo -e "${YELLOW}⚠️  Created config.json. Update apiKey after generating one!${NC}"
fi

echo -e "${GREEN}✅ Skill setup complete${NC}"
echo ""

# Setup frontend (optional)
if [ -d "../frontend" ]; then
    echo "🎨 Setting up frontend..."
    cd ../frontend
    npm install
    echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
    echo ""
fi

cd ..

# Create start script
cat > start.sh <<'EOF'
#!/bin/bash
# Start all MOLTVILLE services

echo "🏙️  Starting MOLTVILLE..."
echo ""

# Start backend in background
echo "Starting backend server..."
cd backend
npm start &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend if exists
if [ -d "../frontend" ]; then
    echo "Starting frontend..."
    cd ../frontend
    npm run dev &
    FRONTEND_PID=$!
fi

echo ""
echo "✅ MOLTVILLE is running!"
echo ""
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for Ctrl+C
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
EOF

chmod +x start.sh

# Create API key generator script
cat > generate-api-key.sh <<'EOF'
#!/bin/bash
# Generate API key for new Moltbot

echo "🔑 Generating API key for MOLTVILLE..."
echo ""
read -p "Enter Moltbot name: " MOLTBOT_NAME

RESPONSE=$(curl -s -X POST http://localhost:3001/api/moltbot/generate-key \
  -H "Content-Type: application/json" \
  -d "{\"moltbotName\": \"$MOLTBOT_NAME\"}")

echo ""
echo "✅ API Key generated!"
echo ""
echo "$RESPONSE" | python3 -m json.tool
echo ""
echo "Copy the 'apiKey' value and paste it in skill/config.json"
EOF

chmod +x generate-api-key.sh

# Summary
echo ""
echo "========================================="
echo -e "${GREEN}✨ Setup complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Start the server:"
echo "   ./start.sh"
echo ""
echo "2. Generate an API key (in new terminal):"
echo "   ./generate-api-key.sh"
echo ""
echo "3. Update skill/config.json with the API key"
echo ""
echo "4. Connect your Moltbot:"
echo "   cd skill && python3 moltville_skill.py"
echo ""
echo "5. View the city (optional):"
echo "   Open http://localhost:5173 in your browser"
echo ""
echo "📚 Documentation: README.md"
echo "🐛 Issues: Report on GitHub"
echo ""
echo -e "${YELLOW}⚠️  Don't forget to:${NC}"
echo "   - Edit backend/.env with your settings"
echo "   - Generate and set API key in skill/config.json"
echo ""
