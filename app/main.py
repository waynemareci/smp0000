from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import seed
from app.routers import goals, phases, decisions, ai_log, webhooks, ai_decompose, questions

app = FastAPI(title="SMP API", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: lock down in Phase 2 when frontend domain is known
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(seed.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(phases.router, prefix="/api")
app.include_router(decisions.router, prefix="/api")
app.include_router(ai_log.router, prefix="/api")
app.include_router(webhooks.router)
app.include_router(ai_decompose.router, prefix="/api")
app.include_router(questions.router, prefix="/api")

@app.get("/health")
def health():
    return {
        "status": "pre-deployment",
        "phase": "4",
        "description": "Phase 3 complete — production deployment in progress",
    }