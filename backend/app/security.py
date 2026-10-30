"""
Authentication and role-based access control.

Passwords are hashed with scrypt (Python standard library, salted, memory-hard).
Login returns a signed token: ``base64(payload).base64(HMAC-SHA256)`` where the
payload holds the user id and expiry. The frontend sends it as
``Authorization: Bearer <token>`` on every request.

Roles
-----
| Action                         | admin | manager                   | member              |
|--------------------------------|-------|---------------------------|---------------------|
| view meetings and registers    | yes   | yes                       | yes                 |
| upload a meeting               | yes   | yes                       | yes                 |
| edit / review a task           | any   | own department's meetings | tasks they own      |
| edit / review decision or risk | any   | own department's meetings | meetings they attended or uploaded |
| delete a meeting               | any   | own department            | meetings they uploaded |
| manage users and departments   | yes   | no                        | no                  |
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import get_db

_bearer = HTTPBearer(auto_error=False)

# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------

_N, _R, _P = 2 ** 14, 8, 1


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, n, r, p, salt, digest = stored.split("$")
        check = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
                               dklen=len(bytes.fromhex(digest)))
        return hmac.compare_digest(check.hex(), digest)
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: str) -> str:
    return _b64(hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).digest())


def create_token(user_id: int) -> str:
    payload = _b64(json.dumps({"uid": user_id, "exp": int(time.time()) + settings.token_hours * 3600}).encode())
    return f"{payload}.{_sign(payload)}"


def read_token(token: str) -> int | None:
    try:
        payload, signature = token.split(".")
        if not hmac.compare_digest(signature, _sign(payload)):
            return None
        data = json.loads(_unb64(payload))
        if data["exp"] < time.time():
            return None
        return int(data["uid"])
    except (ValueError, KeyError, json.JSONDecodeError):
        return None


# --------------------------------------------------------------------------
# FastAPI dependencies
# --------------------------------------------------------------------------

def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                 db: Session = Depends(get_db)) -> models.User:
    uid = read_token(creds.credentials) if creds else None
    user = db.get(models.User, uid) if uid else None
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in again.",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


def require_admin(user: models.User = Depends(current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators can do this.")
    return user


# --------------------------------------------------------------------------
# Permission checks
# --------------------------------------------------------------------------

def _same_department(user: models.User, meeting: models.Meeting) -> bool:
    return user.department_id is not None and meeting.department_id == user.department_id


def can_edit_task(user: models.User, task: models.Task) -> bool:
    if user.role == "admin":
        return True
    if user.role == "manager":
        return _same_department(user, task.meeting) or (
            task.owner is not None and task.owner.department_id == user.department_id)
    return task.owner_id == user.id


def can_edit_meeting_items(user: models.User, meeting: models.Meeting) -> bool:
    """Decisions, risks and transcript labels of a meeting."""
    if user.role == "admin":
        return True
    if user.role == "manager":
        return _same_department(user, meeting)
    return meeting.uploaded_by_id == user.id or any(p.id == user.id for p in meeting.participants)


def can_delete_meeting(user: models.User, meeting: models.Meeting) -> bool:
    if user.role == "admin":
        return True
    if user.role == "manager":
        return _same_department(user, meeting)
    return meeting.uploaded_by_id == user.id


def ensure(allowed: bool, message: str = "You do not have permission to change this.") -> None:
    if not allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, message)
