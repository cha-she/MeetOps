"""Test fixtures: a throw-away SQLite database with the demo organisation, processed once per session."""

import os
import tempfile
from pathlib import Path

import pytest

# Point the app at a throw-away database and upload folder *before* importing it.
_tmp = tempfile.mkdtemp(prefix="meetops-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(Path(_tmp, "uploads"))
os.environ["PIPELINE_STAGE_DELAY"] = "0"
os.environ["SECRET_KEY"] = "test-secret"

from fastapi.testclient import TestClient  # noqa: E402

from app import seed  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    seed.main(["--demo"])
    with TestClient(app) as c:
        yield c


def _login(client, first_name: str) -> dict:
    r = client.post("/api/auth/login", json={"email": f"{first_name}@{seed.DEMO_DOMAIN}", "password": seed.DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return _login(client, "chanya")


@pytest.fixture(scope="session")
def manager(client):
    return _login(client, "ravindu")


@pytest.fixture(scope="session")
def member(client):
    return _login(client, "kasun")


@pytest.fixture(scope="session")
def other_member(client):
    return _login(client, "ishara")
