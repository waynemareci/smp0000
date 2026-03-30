from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user

router = APIRouter()

@router.post("/seed")
def run_day_zero_seed(current_user=Depends(get_current_user)):
    """
    Seed endpoint disabled post-deployment.
    Day 0 data was seeded directly via Supabase SQL Editor.
    """
    raise HTTPException(status_code=410, detail="Seed endpoint disabled — data already seeded.")
