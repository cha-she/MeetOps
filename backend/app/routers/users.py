"""People and departments. Everyone can list them; only administrators can change them."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import current_user, hash_password, require_admin
from ..serializers import user_out
from ..services import audit
from .auth import initials_of

router = APIRouter(tags=["people"])


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _: models.User = Depends(current_user),
               include_inactive: bool = False):
    stmt = select(models.User).order_by(models.User.name)
    if not include_inactive:
        stmt = stmt.where(models.User.is_active.is_(True))
    return [user_out(u) for u in db.scalars(stmt)]


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(body: schemas.UserCreate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    if db.scalar(select(models.User).where(models.User.email == body.email)):
        raise HTTPException(409, "An account with this email already exists.")
    if body.department_id and not db.get(models.Department, body.department_id):
        raise HTTPException(422, "Unknown department")
    u = models.User(name=body.name.strip(), initials=initials_of(body.name), email=body.email,
                    password_hash=hash_password(body.password), role=body.role, title=body.title,
                    department_id=body.department_id)
    db.add(u)
    db.flush()
    audit.log(db, "user", u.id, "created", f"{u.name} ({u.role})", actor_id=admin.id)
    db.commit()
    db.refresh(u)
    return user_out(u)


@router.patch("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, body: schemas.UserPatch, db: Session = Depends(get_db),
                admin: models.User = Depends(require_admin)):
    u = db.get(models.User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    changes = body.model_dump(exclude_unset=True)
    if u.id == admin.id and (changes.get("role", "admin") != "admin" or changes.get("is_active") is False):
        raise HTTPException(422, "You cannot remove your own administrator access.")
    if "department_id" in changes and changes["department_id"] and not db.get(models.Department, changes["department_id"]):
        raise HTTPException(422, "Unknown department")
    if "password" in changes:
        u.password_hash = hash_password(changes.pop("password"))
    if "name" in changes:
        u.initials = initials_of(changes["name"])
    for k, v in changes.items():
        setattr(u, k, v)
    audit.log(db, "user", u.id, "updated", ", ".join(sorted(body.model_dump(exclude_unset=True))), actor_id=admin.id)
    db.commit()
    db.refresh(u)
    return user_out(u)


@router.get("/departments", response_model=list[schemas.DepartmentOut])
def list_departments(db: Session = Depends(get_db), _: models.User = Depends(current_user)):
    counts = dict(db.execute(select(models.User.department_id, func.count(models.User.id))
                             .where(models.User.is_active.is_(True)).group_by(models.User.department_id)).all())
    return [schemas.DepartmentOut(id=d.id, name=d.name, member_count=counts.get(d.id, 0))
            for d in db.scalars(select(models.Department).order_by(models.Department.name))]


@router.post("/departments", response_model=schemas.DepartmentOut, status_code=201)
def create_department(body: schemas.DepartmentIn, db: Session = Depends(get_db),
                      admin: models.User = Depends(require_admin)):
    if db.scalar(select(models.Department).where(func.lower(models.Department.name) == body.name.strip().lower())):
        raise HTTPException(409, "A department with this name already exists.")
    d = models.Department(name=body.name.strip())
    db.add(d)
    db.flush()
    audit.log(db, "department", d.id, "created", d.name, actor_id=admin.id)
    db.commit()
    return schemas.DepartmentOut(id=d.id, name=d.name, member_count=0)


@router.patch("/departments/{dept_id}", response_model=schemas.DepartmentOut)
def rename_department(dept_id: int, body: schemas.DepartmentIn, db: Session = Depends(get_db),
                      admin: models.User = Depends(require_admin)):
    d = db.get(models.Department, dept_id)
    if not d:
        raise HTTPException(404, "Department not found")
    d.name = body.name.strip()
    audit.log(db, "department", d.id, "updated", d.name, actor_id=admin.id)
    db.commit()
    return schemas.DepartmentOut(id=d.id, name=d.name, member_count=len([m for m in d.members if m.is_active]))


@router.delete("/departments/{dept_id}", status_code=204)
def delete_department(dept_id: int, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    d = db.get(models.Department, dept_id)
    if not d:
        raise HTTPException(404, "Department not found")
    if any(m.is_active for m in d.members):
        raise HTTPException(422, "Move or deactivate the members of this department first.")
    audit.log(db, "department", d.id, "deleted", d.name, actor_id=admin.id)
    db.delete(d)
    db.commit()
    return Response(status_code=204)
