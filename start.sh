#!/bin/bash

# Mission Control Dashboard — Quick Start
set -e

cd "$(dirname "$0")"

echo "🚀 Starting Mission Control..."

# Backend check
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "📦 Installing backend dependencies..."
    pip3 install -r backend/requirements.txt
fi

# Frontend check  
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Start backend in background
echo "🔧 Starting backend on port 5056..."
cd backend
python main.py &
BACKEND_PID=$!
cd ..

# Give backend a moment
sleep 2

# Start frontend dev server
echo "🎨 Starting frontend dev server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Mission Control is running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:5056"
echo "   API Docs: http://localhost:5056/docs"
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for both
wait $BACKEND_PID $FRONTEND_PID
