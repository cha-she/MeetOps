from fastapi import APIRouter, Depends, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import current_user
from ..services import notifications

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[schemas.NotificationOut])
def list_notifications(db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    notifications.refresh(db, user)
    stmt = (select(models.Notification).where(models.Notification.user_id == user.id)
            .order_by(models.Notification.created_at.desc(), models.Notification.id.desc()).limit(50))
    return db.scalars(stmt).all()


@router.post("/read-all", status_code=204)
def mark_all_read(db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    db.execute(update(models.Notification)
               .where(models.Notification.user_id == user.id, models.Notification.read.is_(False))
               .values(read=True))
    db.commit()
    return Response(status_code=204)
