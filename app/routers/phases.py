import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Goal, Milestone, Phase, User

router = APIRouter()


# ── Pydantic schemas ───────────────────────────────────────────

class PhaseCreate(BaseModel):
    title: str
    phase_order: int
    status: Optional[str] = "pending"


class PhaseUpdate(BaseModel):
    title: Optional[str] = None
    phase_order: Optional[int] = None
    status: Optional[str] = None


class PhaseResponse(BaseModel):
    id: uuid.UUID
    goal_id: uuid.UUID
    title: str
    phase_order: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MilestoneCreate(BaseModel):
    title: str
    milestone_order: Optional[int] = None
    status: Optional[str] = "pending"
    target_date: Optional[date] = None


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    milestone_order: Optional[int] = None
    status: Optional[str] = None
    target_date: Optional[date] = None
    completed_at: Optional[datetime] = None


class MilestoneResponse(BaseModel):
    id: uuid.UUID
    phase_id: uuid.UUID
    title: str
    milestone_order: int
    status: str
    target_date: Optional[date]
    completed_at: Optional[datetime]
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


async def _get_phase_or_404(
    db: AsyncSession, phase_id: uuid.UUID, goal_id: uuid.UUID
) -> Phase:
    result = await db.execute(
        select(Phase).where(Phase.id == phase_id, Phase.goal_id == goal_id)
    )
    phase = result.scalar_one_or_none()
    if phase is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase not found")
    return phase


async def _get_milestone_or_404(
    db: AsyncSession, milestone_id: uuid.UUID, phase_id: uuid.UUID
) -> Milestone:
    result = await db.execute(
        select(Milestone).where(
            Milestone.id == milestone_id, Milestone.phase_id == phase_id
        )
    )
    milestone = result.scalar_one_or_none()
    if milestone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")
    return milestone


# ── phase routes ───────────────────────────────────────────────

@router.get("/goals/{goal_id}/phases", response_model=list[PhaseResponse])
async def list_phases(
    goal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    await _get_goal_or_404(db, goal_id, org_id)
    result = await db.execute(
        select(Phase).where(Phase.goal_id == goal_id).order_by(Phase.phase_order)
    )
    return result.scalars().all()


@router.post(
    "/goals/{goal_id}/phases",
    response_model=PhaseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_phase(
    goal_id: uuid.UUID,
    body: PhaseCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    await _get_goal_or_404(db, goal_id, org_id)

    phase = Phase(
        goal_id=goal_id,
        title=body.title,
        phase_order=body.phase_order,
        status=body.status or "pending",
    )
    db.add(phase)
    await db.commit()
    await db.refresh(phase)
    return phase


@router.patch("/goals/{goal_id}/phases/{phase_id}", response_model=PhaseResponse)
async def update_phase(
    goal_id: uuid.UUID,
    phase_id: uuid.UUID,
    body: PhaseUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    await _get_goal_or_404(db, goal_id, org_id)
    phase = await _get_phase_or_404(db, phase_id, goal_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(phase, field, value)

    await db.commit()
    await db.refresh(phase)
    return phase


@router.delete("/goals/{goal_id}/phases/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(
    goal_id: uuid.UUID,
    phase_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    await _get_goal_or_404(db, goal_id, org_id)
    phase = await _get_phase_or_404(db, phase_id, goal_id)
    await db.delete(phase)
    await db.commit()


# ── milestone routes ───────────────────────────────────────────

@router.get("/phases/{phase_id}/milestones", response_model=list[MilestoneResponse])
async def list_milestones(
    phase_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify caller belongs to the org that owns the phase's goal
    org_id = await _get_org_id(db, current_user["clerk_id"])
    result = await db.execute(
        select(Phase)
        .join(Goal, Phase.goal_id == Goal.id)
        .where(Phase.id == phase_id, Goal.org_id == org_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase not found")

    result = await db.execute(
        select(Milestone)
        .where(Milestone.phase_id == phase_id)
        .order_by(Milestone.milestone_order)
    )
    return result.scalars().all()


@router.post(
    "/phases/{phase_id}/milestones",
    response_model=MilestoneResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_milestone(
    phase_id: uuid.UUID,
    body: MilestoneCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    result = await db.execute(
        select(Phase)
        .join(Goal, Phase.goal_id == Goal.id)
        .where(Phase.id == phase_id, Goal.org_id == org_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase not found")

    if body.milestone_order is None:
        count_result = await db.execute(
            select(Milestone).where(Milestone.phase_id == phase_id)
        )
        milestone_order = len(count_result.scalars().all())
    else:
        milestone_order = body.milestone_order

    milestone = Milestone(
        phase_id=phase_id,
        title=body.title,
        milestone_order=milestone_order,
        status=body.status or "pending",
        target_date=body.target_date,
    )
    db.add(milestone)
    await db.commit()
    await db.refresh(milestone)
    return milestone


@router.patch(
    "/phases/{phase_id}/milestones/{milestone_id}",
    response_model=MilestoneResponse,
)
async def update_milestone(
    phase_id: uuid.UUID,
    milestone_id: uuid.UUID,
    body: MilestoneUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    result = await db.execute(
        select(Phase)
        .join(Goal, Phase.goal_id == Goal.id)
        .where(Phase.id == phase_id, Goal.org_id == org_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase not found")

    milestone = await _get_milestone_or_404(db, milestone_id, phase_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(milestone, field, value)

    await db.commit()
    await db.refresh(milestone)
    return milestone


@router.delete(
    "/phases/{phase_id}/milestones/{milestone_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_milestone(
    phase_id: uuid.UUID,
    milestone_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = await _get_org_id(db, current_user["clerk_id"])
    result = await db.execute(
        select(Phase)
        .join(Goal, Phase.goal_id == Goal.id)
        .where(Phase.id == phase_id, Goal.org_id == org_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase not found")

    milestone = await _get_milestone_or_404(db, milestone_id, phase_id)
    await db.delete(milestone)
    await db.commit()