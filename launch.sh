#!/bin/bash
# MyAgents - One-click launch script
# Double-click this file or run: ./launch.sh

cd "$(dirname "$0")"

echo "🤖 Starting MyAgents..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Start dev server in background
npm run dev &
DEV_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for server..."
for i in {1..30}; do
  if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Open browser
echo "🌐 Opening browser..."
if command -v open &> /dev/null; then
  open http://localhost:5173
elif command -v xdg-open &> /dev/null; then
  xdg-open http://localhost:5173
fi

echo ""
echo "✅ MyAgents is running!"
echo "   Dashboard: http://localhost:5173"
echo "   API:       http://localhost:3001"
echo ""
echo "   Press Ctrl+C to stop"

# Wait for the dev process
wait $DEV_PID
