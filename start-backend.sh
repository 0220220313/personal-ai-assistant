#!/bin/bash
cd "$(dirname "$0")/backend"
source activate ai-assistant 2>/dev/null || conda activate ai-assistant 2>/dev/null || true
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
