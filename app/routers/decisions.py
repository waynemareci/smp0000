# Decisions are APPEND-ONLY.
# There are intentionally no PATCH or DELETE routes in this file.
# Never add update or delete operations to this router — the decision log
# is an immutable audit trail. See CLAUDE.md Conventions and the schema comment
# on the decisions table.

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Decision, Goal, User

router = APIRouter()


# ── Pydantic schemas ───────────────────────────────────────────

class DecisionCreate(BaseModel):
    title: str
    context: str
    options_considered: Optional[str] = None
    decision_made: str
    rationale: Optional[str] = None


class DecisionResponse(BaseModel):
    id: uuid.UUID
    goal_id: uuid.UUID
    recorded_by: Optional[uuid.UUID]
    title: str
    context: Optional[str]
    options_considered: Optional[str]
    decision_made: str
    rationale: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── helpers ────────────────────────────────────────────────────

async def _resolve_user(db: AsyncSession, clerk_id: str) -> User:
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found")
    return user


async def _get_goal_or_404(
    db: AsyncSession, goal_id: uuid.UUID, org_id: uuid.UUID
) -> Goal:
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == org_id)
    )
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


# ── routes ─────────────────────────────────────────────────────

@router.get("/goals/{goal_id}/decisions", response_model=list[DecisionResponse])
async def list_decisions(
    goal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _resolve_user(db, current_user["clerk_id"])
    if user.org_id is None:
        return []
    await _get_goal_or_404(db, goal_id, user.org_id)

    result = await db.execute(
        select(Decision)
        .where(Decision.goal_id == goal_id)
        .order_by(Decision.created_at.asc())
    )
    return result.scalars().all()


@router.post(
    "/goals/{goal_id}/decisions",
    response_model=DecisionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_decision(
    goal_id: uuid.UUID,
    body: DecisionCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _resolve_user(db, current_user["clerk_id"])
    if user.org_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User has no org")
    await _get_goal_or_404(db, goal_id, user.org_id)

    decision = Decision(
        goal_id=goal_id,
        recorded_by=user.id,
        title=body.title,
        context=body.context,
        options_considered=body.options_considered,
        decision_made=body.decision_made,
        rationale=body.rationale,
    )
    db.add(decision)
    await db.commit()
    await db.refresh(decision)
    return decision