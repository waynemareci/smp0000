"""
day_zero.py — SMP Phase 0 seed script

Inserts the two founding goals and their full phase/milestone structure.
Run against local Docker: python scripts/day_zero.py --env local
Run against cloud:        python scripts/day_zero.py --env cloud

Requires DATABASE_URL in .env.local (local) or environment (cloud).
"""

import os
import sys
import argparse
from datetime import date, timedelta
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

# ── seed data ─────────────────────────────────────────────────
TODAY = date.today()

SEED = {
    "org": {
        "name": "Personal",
        "slug": "personal"
    },
    # Note: no user row — Clerk handles auth; user row created on first login
    "goals": [
        {
            "title": "Build the Strategy Management Platform (SMP)",
            "description": (
                "Design and ship a SaaS-grade goal management system with AI "
                "co-pilot, decision log, and bullet-graph dashboard. "
                "The SMP manages its own development from Day 0 (dogfooding)."
            ),
            "target_date": TODAY + timedelta(days=180),
            "phases": [
                {
                    "title": "Phase 0 — Day 0 Seed",
                    "phase_order": 0,
                    "milestones": [
                        "Supabase project and local Docker Postgres running",
                        "Initial schema migrated via Supabase CLI",
                        "day_zero.py seeds both founding goals",
                        "FastAPI /health and /api/seed endpoints live",
                        "CLAUDE.md context document in repo root",
                    ]
                },
                {
                    "title": "Phase 1 — FastAPI Backend Scaffold",
                    "phase_order": 1,
                    "milestones": [
                        "Clerk JWT middleware wired into FastAPI",
                        "CRUD endpoints: goals, phases, milestones",
                        "Decision log endpoint (append-only POST)",
                        "AI prompt log endpoint",
                    ]
                },
                {
                    "title": "Phase 2 — Frontend Shell",
                    "phase_order": 2,
                    "milestones": [
                        "Next.js project scaffolded on Vercel",
                        "Clerk authentication flow (sign-in / sign-up)",
                        "Dashboard shell with goal list",
                        "Custom React bullet-graph component",
                    ]
                },
                {
                    "title": "Phase 3 — AI Co-pilot Integration",
                    "phase_order": 3,
                    "milestones": [
                        "Claude API wired to goal decomposition prompt",
                        "AI-prompted decision log capture",
                        "Prompt log stored in ai_prompt_log table",
                    ]
                },
                {
                    "title": "Phase 4 — Trading Agent Integration",
                    "phase_order": 4,
                    "milestones": [
                        "Trading agent P&L metric piped to metric_snapshots",
                        "Bullet graph renders live trading performance",
                        "End-to-end dogfood demo recorded",
                    ]
                },
            ]
        },
        {
            "title": "Build a Personal AI Trading Agent (Hang Seng)",
            "description": (
                "Develop a personal algorithmic trading agent targeting "
                "Far Eastern markets (Hang Seng Index). Serves as the first "
                "real use case and live demo for the SMP."
            ),
            "target_date": TODAY + timedelta(days=270),
            "phases": [
                {
                    "title": "Phase 0 — Research & Data Pipeline",
                    "phase_order": 0,
                    "milestones": [
                        "HSI historical data ingested via yfinance",
                        "Data pipeline runs on schedule (HKT timezone)",
                        "Exploratory analysis of regime changes completed",
                    ]
                },
                {
                    "title": "Phase 1 — Signal Model",
                    "phase_order": 1,
                    "milestones": [
                        "Feature engineering (RSI, MACD, volume, mainland proxies)",
                        "XGBoost baseline model trained and evaluated",
                        "Backtesting harness built (vectorbt)",
                    ]
                },
                {
                    "title": "Phase 2 — Paper Trading",
                    "phase_order": 2,
                    "milestones": [
                        "IBKR paper account connected via ib_insync",
                        "Live signals generated and logged",
                        "30-day paper trade evaluation complete",
                    ]
                },
                {
                    "title": "Phase 3 — Live Deployment",
                    "phase_order": 3,
                    "milestones": [
                        "Live account connected with small capital allocation",
                        "Risk controls validated (stop-loss, kill switch)",
                        "P&L metric piped to SMP dashboard",
                    ]
                },
            ]
        }
    ],
    "first_decision": {
        "goal_title": "Build the Strategy Management Platform (SMP)",
        "title": "Build SMP and Trading Agent in parallel from Day 0",
        "context": (
            "Considered whether to build the SMP first and add the trading "
            "agent later, or to develop both simultaneously."
        ),
        "options_considered": (
            "1. Build SMP fully first, then add trading agent.\n"
            "2. Build trading agent first as a standalone project.\n"
            "3. Build both in parallel, with SMP managing its own development."
        ),
        "decision_made": "Option 3 — parallel build with dogfooding from Day 0.",
        "rationale": (
            "Dogfooding creates authentic demo content, surfaces UX friction "
            "immediately, and keeps both projects honest about scope."
        ),
    }
}

# ── db operations ─────────────────────────────────────────────
def run_seed():
    load_dotenv(".env.local")
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL not set")
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor(cursor_factory=RealDictCursor)
    counts = {"orgs": 0, "goals": 0, "phases": 0, "milestones": 0, "decisions": 0}

    try:
        # Org
        cur.execute("""
            insert into orgs (name, slug)
            values (%s, %s)
            on conflict (slug) do update set name = excluded.name
            returning id
        """, (SEED["org"]["name"], SEED["org"]["slug"]))
        org_id = cur.fetchone()["id"]
        counts["orgs"] += 1
        print(f"  org:  {org_id}")

        goal_ids = {}
        for g in SEED["goals"]:
            cur.execute("""
                insert into goals (org_id, title, description, target_date)
                values (%s, %s, %s, %s)
                on conflict do nothing
                returning id
            """, (org_id, g["title"], g["description"], g["target_date"]))
            row = cur.fetchone()
            if row:
                goal_id = row["id"]
                counts["goals"] += 1
            else:
                cur.execute("select id from goals where title = %s", (g["title"],))
                goal_id = cur.fetchone()["id"]

            goal_ids[g["title"]] = goal_id
            print(f"  goal: {g['title'][:60]}  → {goal_id}")

            for ph in g["phases"]:
                cur.execute("""
                    insert into phases (goal_id, title, phase_order)
                    values (%s, %s, %s)
                    on conflict (goal_id, phase_order) do update set title = excluded.title
                    returning id
                """, (goal_id, ph["title"], ph["phase_order"]))
                phase_id = cur.fetchone()["id"]
                counts["phases"] += 1

                for i, ms_title in enumerate(ph["milestones"]):
                    cur.execute("""
                        insert into milestones (phase_id, title, milestone_order)
                        values (%s, %s, %s)
                        on conflict do nothing
                    """, (phase_id, ms_title, i))
                    counts["milestones"] += 1

        # First decision
        d = SEED["first_decision"]
        goal_id = goal_ids[d["goal_title"]]
        cur.execute("""
            insert into decisions
              (goal_id, title, context, options_considered, decision_made, rationale)
            values (%s, %s, %s, %s, %s, %s)
        """, (goal_id, d["title"], d["context"],
              d["options_considered"], d["decision_made"], d["rationale"]))
        counts["decisions"] += 1

        conn.commit()
        print(f"\n✓ Seed complete: {counts}")
        return counts

    except Exception as e:
        conn.rollback()
        print(f"✗ Seed failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", choices=["local", "cloud"], default="local")
    args = parser.parse_args()

    if args.env == "local":
        load_dotenv(".env.local")
    else:
        load_dotenv(".env.cloud")

    if not os.getenv("DATABASE_URL"):
        print("ERROR: DATABASE_URL not set"); sys.exit(1)

    run_seed()