from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user
from scripts.day_zero import run_seed

router = APIRouter()

@router.post("/seed")
def run_day_zero_seed(current_user=Depends(get_current_user)):
    """
    Idempotent: runs the Day 0 seed against the configured DATABASE_URL.
    Uses ON CONFLICT DO NOTHING / DO UPDATE so safe to call repeatedly.
    """
    try:
        counts = run_seed()
        return {"success": True, "inserted": counts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
