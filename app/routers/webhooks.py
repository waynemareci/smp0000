import os
import uuid

from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select
from svix.webhooks import Webhook, WebhookVerificationError

from app.db import AsyncSessionLocal
from app.models import User

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

WEBHOOK_SECRET = os.getenv("CLERK_WEBHOOK_SECRET")
SEED_ORG_ID = os.getenv("SEED_ORG_ID")


@router.post("/clerk")
async def clerk_webhook(
    request: Request,
    svix_id: str = Header(None, alias="svix-id"),
    svix_timestamp: str = Header(None, alias="svix-timestamp"),
    svix_signature: str = Header(None, alias="svix-signature"),
):
    if not WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="CLERK_WEBHOOK_SECRET not configured")

    payload = await request.body()
    headers = {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
    }

    try:
        wh = Webhook(WEBHOOK_SECRET)
        event = wh.verify(payload, headers)
    except WebhookVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    if event["type"] == "user.created":
        data = event["data"]
        clerk_id = data["id"]
        emails = data.get("email_addresses", [])
        email = emails[0]["email_address"] if emails else ""
        first = data.get("first_name") or ""
        last = data.get("last_name") or ""
        display_name = f"{first} {last}".strip() or email

        async with AsyncSessionLocal() as session:
            # Idempotency: skip if clerk_id already exists
            existing = await session.execute(
                select(User).where(User.clerk_id == clerk_id)
            )
            if existing.scalar_one_or_none() is None:
                user = User(
                    id=uuid.uuid4(),
                    clerk_id=clerk_id,
                    org_id=uuid.UUID(SEED_ORG_ID),
                    email=email,
                    display_name=display_name,
                    role="member",
                )
                session.add(user)
                await session.commit()

    return {"status": "ok"}