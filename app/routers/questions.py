import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Goal, GoalQuestion, User

router = APIRouter()


# ── Pydantic schemas ───────────────────────────────────────────

class QuestionCreate(BaseModel):
    question: str
    question_order: int = 0


class QuestionUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    is_resolved: Optional[bool] = None
    question_order: Optional[int] = None


class QuestionResponse(BaseModel):
    id: uuid.UUID
    goal_id: uuid.UUID
    question: str
    answer: Optional[str]
    is_resolved: bool
    question_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── helpers ────────────────────────────────────────────────────

async def _get_org_id(db: AsyncSession, clerk_id: str) -> uuid.UUID:
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    if user is None or user.org_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User has no org")
    return user.org_id


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


async def _get_question_or_404(
    db: AsyncSession, question_id: uuid.UUID, goal_id: uuid.UUID
) -> GoalQuestion:
    result = await db.execute(
        select(GoalQuestion).where(
            GoalQuestion.id == question_id, GoalQuestion.goal_id == goal_id
        )
    )
    question = result.scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    return question


# ── routes ─────────────────────────────────────────────────────

@router.get("/goals/{goal_id}/questions", response_model=list[QuestionResponse])
async def list_questions(
    goal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    await _get_goal_or_404(db, goal_id, org_id)
    result = await db.execute(
        select(GoalQuestion)
        .where(GoalQuestion.goal_id == goal_id)
        .order_by(GoalQuestion.question_order)
    )
    return result.scalars().all()


@router.post(
    "/goals/{goal_id}/questions",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_question(
    goal_id: uuid.UUID,
    body: QuestionCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    await _get_goal_or_404(db, goal_id, org_id)

    question = GoalQuestion(
        goal_id=goal_id,
        question=body.question,
        question_order=body.question_order,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


@router.patch(
    "/goals/{goal_id}/questions/{question_id}",
    response_model=QuestionResponse,
)
async def update_question(
    goal_id: uuid.UUID,
    question_id: uuid.UUID,
    body: QuestionUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    await _get_goal_or_404(db, goal_id, org_id)
    question = await _get_question_or_404(db, question_id, goal_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(question, field, value)

    await db.commit()
    await db.refresh(question)
    return question


@router.delete(
    "/goals/{goal_id}/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_question(
    goal_id: uuid.UUID,
    question_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    await _get_goal_or_404(db, goal_id, org_id)
    question = await _get_question_or_404(db, question_id, goal_id)
    await db.delete(question)
    await db.commit()
