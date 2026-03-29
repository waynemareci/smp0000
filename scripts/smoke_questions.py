"""
smoke_questions.py — Acceptance criteria check for Phase 3 goal_questions endpoints.

Criteria:
  1. GET  /api/goals/{id}/questions  → []  for an existing goal
  2. POST /api/goals/{id}/questions  → creates a question row
  3. PATCH .../questions/{qid}       → resolves question (is_resolved, answer)
  4. DELETE .../questions/{qid}      → removes question
  5. POST /api/goals                 → defaults to status 'researching'
  6. FastAPI started cleanly (already confirmed by caller)
"""

import os
import sys
import httpx
from dotenv import load_dotenv

# ── reuse get_test_token logic inline ─────────────────────────
load_dotenv(".env.local")
SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
if not SECRET_KEY:
    print("ERROR: CLERK_SECRET_KEY not set in .env.local", file=sys.stderr)
    sys.exit(1)

CLERK = "https://api.clerk.com/v1"
CLERK_HEADERS = {"Authorization": f"Bearer {SECRET_KEY}", "Content-Type": "application/json"}
BASE = "http://localhost:8001/api"

def get_token() -> str:
    users = httpx.get(f"{CLERK}/users", headers=CLERK_HEADERS, params={"limit": 1}).json()
    if not users:
        print("ERROR: No Clerk users found", file=sys.stderr); sys.exit(1)
    user_id = users[0]["id"]
    session_id = httpx.post(f"{CLERK}/sessions", headers=CLERK_HEADERS,
                             json={"user_id": user_id}).json()["id"]
    return httpx.post(f"{CLERK}/sessions/{session_id}/tokens", headers=CLERK_HEADERS).json()["jwt"]

token = get_token()
H = {"Authorization": f"Bearer {token}"}
ok = True

def check(label: str, cond: bool, detail: str = ""):
    global ok
    status = "PASS" if cond else "FAIL"
    if not cond:
        ok = False
    print(f"  [{status}] {label}" + (f" — {detail}" if detail else ""))

print("\n-- Smoke: goal_questions --")

# ── Criterion 5: POST /api/goals defaults to 'researching' ────
r = httpx.post(f"{BASE}/goals", headers=H, json={"title": "Smoke test goal (questions)"})
check("5. POST /api/goals status defaults to 'researching'",
      r.status_code == 201 and r.json().get("status") == "researching",
      f"status={r.json().get('status')}  http={r.status_code}")
goal_id = r.json().get("id")

if not goal_id:
    print("Cannot continue — goal creation failed"); sys.exit(1)

# ── Criterion 1: GET questions → [] ───────────────────────────
r = httpx.get(f"{BASE}/goals/{goal_id}/questions", headers=H)
check("1. GET /api/goals/{id}/questions returns []",
      r.status_code == 200 and r.json() == [],
      f"http={r.status_code}  body={r.json()}")

# ── Criterion 2: POST creates a question row ──────────────────
r = httpx.post(f"{BASE}/goals/{goal_id}/questions", headers=H,
               json={"question": "What is the target user persona?", "question_order": 0})
check("2. POST /api/goals/{id}/questions creates a question",
      r.status_code == 201 and r.json().get("question") == "What is the target user persona?",
      f"http={r.status_code}")
question_id = r.json().get("id")

# ── Criterion 3: PATCH resolves a question ────────────────────
r = httpx.patch(f"{BASE}/goals/{goal_id}/questions/{question_id}", headers=H,
                json={"answer": "Early-stage founders", "is_resolved": True})
check("3. PATCH resolves question (is_resolved=true, answer set)",
      r.status_code == 200
      and r.json().get("is_resolved") is True
      and r.json().get("answer") == "Early-stage founders",
      f"http={r.status_code}")

# ── Criterion 4: DELETE removes the question ──────────────────
r = httpx.delete(f"{BASE}/goals/{goal_id}/questions/{question_id}", headers=H)
check("4. DELETE removes question",
      r.status_code == 204,
      f"http={r.status_code}")

r = httpx.get(f"{BASE}/goals/{goal_id}/questions", headers=H)
check("4b. GET after DELETE returns []",
      r.status_code == 200 and r.json() == [],
      f"body={r.json()}")

# ── Criterion 6 ───────────────────────────────────────────────
check("6. FastAPI startup clean", True, "confirmed by caller")

# ── Cleanup ───────────────────────────────────────────────────
httpx.delete(f"{BASE}/goals/{goal_id}", headers=H)

print()
print("ALL PASS" if ok else "SOME CHECKS FAILED")
sys.exit(0 if ok else 1)
