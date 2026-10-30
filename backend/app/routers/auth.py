"""Sign-in, first-run setup and the current user."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import create_token, current_user, hash_password, verify_password
from ..serializers import user_out
from ..services import audit

router = APIRouter(prefix="/auth", tags=["auth"])


def initials_of(name: str) -> str:
    parts = [p for p in name.split() if p]
    return ("".join(p[0] for p in parts[:2]) or "?").upper()


@router.get("/status", response_model=schemas.AuthStatus)
def status(db: Session = Depends(get_db)):
    """needsSetup is true until the first administrator account exists."""
    return schemas.AuthStatus(needs_setup=db.scalar(select(func.count(models.User.id))) == 0)


@router.post("/setup", response_model=schemas.AuthOut, status_code=201)
def setup(body: schemas.SetupIn, db: Session = Depends(get_db)):
    """Create the organisation's first administrator. Only allowed on an empty database."""
    if db.scalar(select(func.count(models.User.id))):
        raise HTTPException(409, "Setup has already been completed. Sign in instead.")
    dept = models.Department(name=body.department.strip())
    db.add(dept)
    db.flush()
    user = models.User(name=body.name.strip(), initials=initials_of(body.name), email=body.email,
                       password_hash=hash_password(body.password), role="admin", title=body.title,
                       department_id=dept.id, last_login_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    audit.log(db, "user", user.id, "created", "first administrator (setup)", actor_id=user.id)
    db.commit()
    db.refresh(user)
    return schemas.AuthOut(token=create_token(user.id), user=user_out(user))


@router.post("/login", response_model=schemas.AuthOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(models.User).where(models.User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect.")
    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated. Ask an administrator.")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return schemas.AuthOut(token=create_token(user.id), user=user_out(user))


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(current_user)):
    return user_out(user)
