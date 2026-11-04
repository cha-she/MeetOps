"""
Application settings, read from environment variables or ``backend/.env``.

DATABASE_URL
    SQLAlchemy connection string. Default: a SQLite file next to this package
    (zero setup for development). For PostgreSQL (docker-compose.yml):
    postgresql+psycopg://meetops:meetops@localhost:5432/meetops
SECRET_KEY
    Signs login tokens. Set a long random value outside development.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "MeetOps API"
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'meetops.db').as_posix()}"
    upload_dir: Path = BACKEND_DIR / "uploads"
    model_dir: Path | None = None          # default: newest version under ml/models/
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    pipeline_stage_delay: float = 0.4      # seconds between stages so the UI progress is visible
    max_upload_mb: int = 25                # text transcripts
    max_media_mb: int = 500                # audio / video recordings

    # Speech-to-text and speaker separation for audio / video (services/transcribe.py)
    whisper_model: str = "base.en"         # faster-whisper size: tiny.en | base.en | small.en | medium.en
    whisper_language: str = "en"
    speech_model_dir: Path = REPO_ROOT / "ml" / "models" / "speech"
    speaker_threshold: float = 0.3         # voices this far apart (cosine distance) mean more than one speaker

    secret_key: str = "dev-only-change-me"  # override in backend/.env for any shared deployment
    token_hours: int = 12
    use_rules: bool = True                  # rule layer after the classifier
    auto_confirm_confidence: float = 0.8    # model-only predictions at or above this are confirmed automatically
    extraction_engine: str = "hybrid"       # owner/deadline extraction: rules | spacy | hybrid


settings = Settings()
