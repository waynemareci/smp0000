"""
get_test_token.py — Obtain a short-lived Clerk JWT for smoke testing.

Flow (Clerk Backend API):
  1. GET  /v1/users              → find user by email, grab clerk user_id
  2. POST /v1/sessions           → create a session for that user_id
  3. POST /v1/sessions/{id}/tokens → exchange session for a signed JWT

The JWT is printed to stdout so you can:
  export TOKEN=$(python scripts/get_test_token.py)
  curl -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/goals

Requires in .env.local:
  CLERK_SECRET_KEY=sk_test_...
"""

import os
import sys
from dotenv import load_dotenv
import httpx

load_dotenv(".env.local")

SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
if not SECRET_KEY:
    print("ERROR: CLERK_SECRET_KEY not set in .env.local", file=sys.stderr)
    sys.exit(1)

BASE = "https://api.clerk.com/v1"
HEADERS = {
    "Authorization": f"Bearer {SECRET_KEY}",
    "Content-Type": "application/json",
}


def get_first_user() -> dict:
    resp = httpx.get(f"{BASE}/users", headers=HEADERS, params={"limit": 5})
    resp.raise_for_status()
    users = resp.json()
    if not users:
        print("ERROR: No users found in Clerk. Create a user via the dashboard first.",
              file=sys.stderr)
        sys.exit(1)
    user = users[0]
    print(f"[1] Found user: id={user['id']}  email={user.get('email_addresses', [{}])[0].get('email_address', 'n/a')}",
          file=sys.stderr)
    return user


def create_session(user_id: str) -> str:
    resp = httpx.post(
        f"{BASE}/sessions",
        headers=HEADERS,
        json={"user_id": user_id},
    )
    if not resp.is_success:
        print(f"ERROR creating session: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    session_id = resp.json()["id"]
    print(f"[2] Created session: {session_id}", file=sys.stderr)
    return session_id


def get_session_token(session_id: str) -> str:
    resp = httpx.post(
        f"{BASE}/sessions/{session_id}/tokens",
        headers=HEADERS,
    )
    if not resp.is_success:
        print(f"ERROR getting token: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    token = resp.json()["jwt"]
    print(f"[3] Token obtained (first 40 chars): {token[:40]}...", file=sys.stderr)
    return token


if __name__ == "__main__":
    user = get_first_user()
    session_id = create_session(user["id"])
    token = get_session_token(session_id)
    # Print only the token to stdout — clean for shell capture
    print(token)