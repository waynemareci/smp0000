import json
import os
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.models import User

router = APIRouter()

SYSTEM_PROMPT_FULL = """You are a strategic planning assistant. Given a goal description, you produce:
1. A list of 4–6 research questions the user must answer BEFORE executing — things they need to learn or validate first.
2. A proposed phased roadmap: 3–5 phases, each with a title and 3–5 milestone titles (strings only, no descriptions).

Respond ONLY with valid JSON. No preamble, no markdown fences.
Schema:
{
  "research_questions": ["string", ...],
  "phases": [
    {
      "title": "string",
      "milestones": ["string", ...]
    }
  ]
}"""

SYSTEM_PROMPT_QUESTIONS_ONLY = """You are a strategic planning assistant. Given a goal description, produce 4–6 research questions the user must answer BEFORE defining any roadmap — things they need to learn, validate, or decide first.

Respond ONLY with valid JSON. No preamble, no markdown fences.
Schema:
{
  "research_questions": ["string", ...]
}"""

SYSTEM_PROMPT_PHASES_ONLY = """You are a strategic planning assistant. Given a goal description and the user's answers to their research questions, propose a phased roadmap: 3–5 phases, each with a title and 3–5 milestone titles (strings only, no descriptions).

Use the Q&A context to inform the phases — the research answers should shape the scope, sequencing, and focus of the roadmap.

Respond ONLY with valid JSON. No preamble, no markdown fences.
Schema:
{
  "phases": [
    {
      "title": "string",
      "milestones": ["string", ...]
    }
  ]
}"""


class ResearchQA(BaseModel):
    question: str
    answer: Optional[str] = None


class DecomposeRequest(BaseModel):
    title: str
    description: str
    mode: Optional[str] = None          # "questions_only" | "phases_only" | "full" (default)
    research_qa: Optional[list[ResearchQA]] = None


@router.post("/ai/decompose")
def decompose_goal(
    body: DecomposeRequest,
    current_user: User = Depends(get_current_user),
):
    mode = body.mode or "full"

    if mode == "questions_only":
        system_prompt = SYSTEM_PROMPT_QUESTIONS_ONLY
    elif mode == "phases_only":
        system_prompt = SYSTEM_PROMPT_PHASES_ONLY
    else:
        system_prompt = SYSTEM_PROMPT_FULL

    # Build user message
    user_message = f"{body.title}\n\n{body.description}"

    if mode == "phases_only" and body.research_qa:
        qa_lines = ["Research Q&A:"]
        for pair in body.research_qa:
            qa_lines.append(f"Q: {pair.question}")
            qa_lines.append(f"A: {pair.answer or '(no answer)'}")
        user_message += "\n\n" + "\n".join(qa_lines)

    try:
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
    except Exception:
        raise HTTPException(status_code=502, detail="AI service unavailable")

    try:
        text = message.content[0].text
        result = json.loads(text)
    except Exception:
        raise HTTPException(status_code=422, detail="Failed to parse AI response")

    return result
