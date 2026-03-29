# AI prompt log is APPEND-ONLY.
# There are intentionally no PATCH or DELETE routes in this file.
# Never add update or delete operations to this router — the prompt log
# is an immutable audit trail of every AI interaction. See CLAUDE.md Conventions
# and the schema comment on the ai_prompt_log table.
#
# Column mapping (Pydantic field -> DB column):
#   rendered_prompt  -> prompt      (the fully rendered text sent to the model)
#   model_name       -> model
#   response_summary -> response
#   recorded_by      -> user_id     (auto-filled from JWT; never sent by caller)
# prompt_template has no dedicated DB column — it is not persisted separately.

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import AIPromptLog, User

router = APIRouter()


# ── Pydantic schemas ───────────────────────────────────────────

class AILogCreate(BaseModel):
    goal_id: Optional[uuid.UUID] = None
    prompt_template: str
    rendered_prompt: str
    model_name: str
    response_summary: Optional[str] = None
    tokens_used: Optional[int] = None


class AILogResponse(BaseModel):
    id: uuid.UUID
    goal_id: Optional[uuid.UUID]
    user_id: Optional[uuid.UUID]
    prompt: str
    response: Optional[str]
    model: Optional[str]
    tokens_used: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── helpers ────────────────────────────────────────────────────

async def _resolve_user(db: AsyncSession, clerk_id: str) -> User:
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found")
    return user


# ── routes ─────────────────────────────────────────────────────

@router.get("/ai-log", response_model=list[AILogResponse])
async def list_ai_log(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _resolve_user(db, current_user["clerk_id"])
    result = await db.execute(
        select(AIPromptLog)
        .where(AIPromptLog.user_id == user.id)
        .order_by(AIPromptLog.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.post("/ai-log", response_model=AILogResponse, status_code=status.HTTP_201_CREATED)
async def create_ai_log(
    body: AILogCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _resolve_user(db, current_user["clerk_id"])

    entry = AIPromptLog(
        goal_id=body.goal_id,
        user_id=user.id,
        prompt=body.rendered_prompt,
        response=body.response_summary,
        model=body.model_name,
        tokens_used=body.tokens_used,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry