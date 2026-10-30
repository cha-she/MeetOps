"""
MeetOps API.

    uvicorn app.main:app --reload --port 8000      (run from the backend/ folder)

Interactive docs: http://localhost:8000/docs
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, schemas
from .config import settings
from .database import init_db
from .routers import auth, decisions, insights, meetings, notifications, risks, search, tasks, users
from .services.classifier import model_name


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title=settings.app_name, version=__version__, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth, meetings, tasks, decisions, risks, users, insights, search, notifications):
    app.include_router(r.router, prefix="/api")


@app.get("/api/health", response_model=schemas.Health, tags=["health"])
def health():
    return schemas.Health(status="ok", version=__version__, database=settings.database_url.split(":", 1)[0],
                          model=model_name(), rules=settings.use_rules)
