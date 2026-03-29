import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Goal, User

router = APIRouter()


# ── Pydantic schemas ───────────────────────────────────────────

class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    target_date: Optional[date] = None
    status: Optional[str] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[date] = None


class GoalResponse(BaseModel):
    id: uuid.UUID
    org_id: Optional[uuid.UUID]
    owner_id: Optional[uuid.UUID]
    title: str
    description: Optional[str]
    status: str
    target_date: Optional[date]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── helpers ────────────────────────────────────────────────────

async def _resolve_user_org(
    db: AsyncSession,
    clerk_id: str,
) -> tuple[Optional[uuid.UUID], Optional[uuid.UUID]]:
    """Return (user.id, user.org_id) for a given clerk_id, or (None, None)."""
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    if user is None:
        return None, None
    return user.id, user.org_id


async def _get_goal_or_404(
    db: AsyncSession,
    goal_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Goal:
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == org_id)
    )
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


# ── routes ─────────────────────────────────────────────────────

@router.get("/goals", response_model=list[GoalResponse])
async def list_goals(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, org_id = await _resolve_user_org(db, current_user["clerk_id"])
    if org_id is None:
        return []
    result = await db.execute(select(Goal).where(Goal.org_id == org_id))
    return result.scalars().all()


@router.get("/goals/{goal_id}", response_model=GoalResponse)
async def get_goal(
    goal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, org_id = await _resolve_user_org(db, current_user["clerk_id"])
    if org_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return await _get_goal_or_404(db, goal_id, org_id)


@router.post("/goals", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: GoalCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id, org_id = await _resolve_user_org(db, current_user["clerk_id"])

    goal = Goal(
        org_id=org_id,
        owner_id=user_id,
        title=body.title,
        description=body.description,
        target_date=body.target_date,
        status=body.status or "researching",
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.patch("/goals/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: uuid.UUID,
    body: GoalUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, org_id = await _resolve_user_org(db, current_user["clerk_id"])
    if org_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    goal = await _get_goal_or_404(db, goal_id, org_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)

    await db.commit()
    await db.refresh(goal)
    return goal


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Soft delete: set status = 'archived' until a migration adds deleted_at
    _, org_id = await _resolve_user_org(db, current_user["clerk_id"])
    if org_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    goal = await _get_goal_or_404(db, goal_id, org_id)
    goal.status = "archived"
    await db.commit()