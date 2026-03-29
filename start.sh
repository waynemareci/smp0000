#!/bin/bash

# Start FastAPI backend
source ~/miniconda3/etc/profile.d/conda.sh
conda activate base
cd "/d/Strategy Management Platform/smp000"
PYTHONIOENCODING=utf-8 python -m uvicorn app.main:app --port 8001 &

# Start Next.js frontend
cd "/d/Strategy Management Platform/smp000/frontend"
npm run dev &

wait
