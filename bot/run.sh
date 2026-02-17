#!/bin/bash
# Run the Revolutionary Scalper bot

cd "$(dirname "$0")"

echo "🚀 Starting Revolutionary Scalper v2.0..."
echo "Logs: tail -f logs/main.log"
echo ""

# Create directories if not exist
mkdir -p logs data config

# Install dependencies if needed
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install pandas numpy aiohttp websockets
else
    source venv/bin/activate
fi

# Run the bot
python3 main.py
