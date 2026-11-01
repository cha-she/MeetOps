"""
ORM schema.

    departments ──< users ──< meeting_participants >── meetings ──< segments
                                                          │            ▲
                                                          ├──< tasks ──┤  segment_id = evidence link
                                                          ├──< decisions
                                                          └──< risks
    users ──< notifications        audit_logs (actor, entity, action)
    label_feedback (human corrections of the classifier, for retraining)

Every extracted record (task, decision, risk) keeps a foreign key to the
transcript segment it was taken from (the evidence link) and a review status:
``suggested`` until a person confirms it, ``confirmed`` once accepted (or when
the model was confident on its own), ``rejected`` when dismissed.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Table,
                        Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

ROLES = ("admin", "manager", "member")
REVIEW_STATES = ("suggested", "confirmed", "rejected")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


meeting_participants = Table(
    "meeting_participants", Base.metadata,
    Column("meeting_id", ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    members: Mapped[list["User"]] = relationship(back_populates="department")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    initials: Mapped[str] = mapped_column(String(4), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(300), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")   # admin | manager | member
    title: Mapped[str | None] = mapped_column(String(80))                             # job title, e.g. "QA Engineer"
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    department: Mapped[Department | None] = relationship(back_populates="members")
    tasks: Mapped[list["Task"]] = relationship(back_populates="owner", foreign_keys="Task.owner_id")


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_min: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="transcript")  # audio|video|transcript
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Queued")       # Queued|Processing|Processed|Failed
    pipeline_stage: Mapped[str | None] = mapped_column(String(20))
    error_message: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    file_name: Mapped[str | None] = mapped_column(String(255))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    model_name: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    department: Mapped[Department | None] = relationship()
    uploaded_by: Mapped[User | None] = relationship(foreign_keys=[uploaded_by_id])
    participants: Mapped[list[User]] = relationship(secondary=meeting_participants, order_by=User.id)
    segments: Mapped[list["Segment"]] = relationship(back_populates="meeting", cascade="all, delete-orphan",
                                                      order_by="Segment.position")
    tasks: Mapped[list["Task"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    decisions: Mapped[list["Decision"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    risks: Mapped[list["Risk"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")


class Segment(Base):
    """One classified utterance of a transcript."""
    __tablename__ = "segments"
    __table_args__ = (UniqueConstraint("meeting_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker: Mapped[str | None] = mapped_column(String(120))
    start_sec: Mapped[float | None] = mapped_column(Float)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(10), nullable=False, default="Other")  # final label
    confidence: Mapped[float | None] = mapped_column(Float)
    model_label: Mapped[str | None] = mapped_column(String(10))   # what the model alone said
    rule: Mapped[str | None] = mapped_column(String(40))          # rule that changed it, if any
    corrected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # set by a person

    meeting: Mapped[Meeting] = relationship(back_populates="segments")


class _Extracted:
    """Columns shared by tasks, decisions and risks."""
    review_status: Mapped[str] = mapped_column(String(12), nullable=False, default="suggested")
    confidence: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="ai")  # ai | manual
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Task(_Extracted, Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    owner_name: Mapped[str | None] = mapped_column(String(120))   # spoken name when the person has no account
    deadline: Mapped[date | None] = mapped_column(Date)
    deadline_text: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Open")  # Open|In Progress|Completed
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="Medium")  # Low|Medium|High
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    meeting: Mapped[Meeting] = relationship(back_populates="tasks")
    owner: Mapped[User | None] = relationship(back_populates="tasks", foreign_keys=[owner_id])
    segment: Mapped[Segment | None] = relationship()


class Decision(_Extracted, Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id", ondelete="SET NULL"))
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    owner_name: Mapped[str | None] = mapped_column(String(120))   # spoken name when the person has no account
    decided_at: Mapped[date] = mapped_column(Date, nullable=False)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    meeting: Mapped[Meeting] = relationship(back_populates="decisions")
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])
    segment: Mapped[Segment | None] = relationship()


class Risk(_Extracted, Base):
    __tablename__ = "risks"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="Medium")  # Low|Medium|High
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="Open")      # Open|Mitigated|Closed
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    raised_by: Mapped[str | None] = mapped_column(String(120))
    raised_at: Mapped[date] = mapped_column(Date, nullable=False)
    recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    meeting: Mapped[Meeting] = relationship(back_populates="risks")
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])
    segment: Mapped[Segment | None] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # overdue|due_soon|assigned|status_change|review
    message: Mapped[str] = mapped_column(Text, nullable=False)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    meeting_id: Mapped[int | None] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    """Who changed what. Written on every create/update made through the API."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(30), nullable=False)   # task, decision, risk, meeting, user, ...
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)   # created, updated, confirmed, rejected, ...
    detail: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    meeting_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    actor: Mapped[User | None] = relationship()


class LabelFeedback(Base):
    """A person's correction of a classifier label. Training data for the next model version."""
    __tablename__ = "label_feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id", ondelete="SET NULL"))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    predicted: Mapped[str] = mapped_column(String(10), nullable=False)
    corrected: Mapped[str] = mapped_column(String(10), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
