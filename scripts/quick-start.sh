#!/bin/bash

# Quick Start Script for Fristine Presales Portal
# This script sets up and runs the application

echo "=========================================="
echo "  Fristine Presales Portal - Quick Start"
echo "=========================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed. Please install Python 3.10+ first."
    echo "  Visit: https://www.python.org/downloads/"
    exit 1
fi
echo "Python found: $(python3 --version)"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js v18+ first."
    echo "  Visit: https://nodejs.org/"
    exit 1
fi
echo "Node.js found: $(node --version)"
echo ""

# Check for backend .env file
if [ ! -f "backend/.env" ]; then
    echo "No .env file found in backend/"
    echo "Creating from .env.example..."
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
    else
        cat > backend/.env << EOF
# Gemini AI API Key (Get from: https://ai.google.dev/)
GEMINI_API_KEY=your_gemini_api_key_here

# Server Port
PORT=3001

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Email (optional — leave blank for simulated mode)
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
EOF
    fi
    echo "Template .env created at backend/.env"
    echo ""
    echo "IMPORTANT: Edit backend/.env and add your Gemini API key!"
    echo "  Get your key from: https://ai.google.dev/"
    echo ""
    read -p "Press Enter after you've added your API key..."
fi

# Set up Python virtual environment
echo ""
echo "Setting up Python virtual environment..."
cd backend
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt --quiet
echo "Backend dependencies installed"
cd ..

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
cd frontend
npm install --silent
echo "Frontend dependencies installed"
cd ..

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "To start the application:"
echo ""
echo "1. Start Backend (in one terminal):"
echo "   cd backend && source .venv/bin/activate && python main.py"
echo ""
echo "2. Start Frontend (in another terminal):"
echo "   cd frontend && npm run dev"
echo ""
echo "3. Open browser:"
echo "   http://localhost:5173"
echo ""
echo "=========================================="
