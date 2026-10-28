"""Test fixtures: a fresh SQLite database per test session, seeded once."""

import os
import tempfile
from pathlib import Path

import pytest

# Point the app at a throw-away database and upload folder *before* importing it.
_tmp = tempfile.mkdtemp(prefix="meetops-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(Path(_tmp, "uploads"))
os.environ["PIPELINE_STAGE_DELAY"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(scope="session")
def client():
    init_db()
    with SessionLocal() as db:
        seed(db)
    with TestClient(app) as c:
        yield c
