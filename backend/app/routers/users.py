from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(models.User).order_by(models.User.id)).all()
