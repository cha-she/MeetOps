"""
ORM schema.

    users ──< meeting_participants >── meetings ──< segments
                                          │            │
                                          ├──< tasks ──┘ (segment = evidence)
                                          ├──< decisions
                                          └──< risks
    tasks ──< notifications
    audit_logs (who changed what, when)

Every extracted record (task, decision, risk) keeps a foreign key to the
transcript segment it was taken from. That is the "evidence link" shown in
the dashboard and it makes every record traceable back to the meeting.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Table,
                        Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


meeting_participants = Table(
    "meeting_participants", Base.metadata,
    Column("meeting_id", ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    initials: Mapped[str] = mapped_column(String(4), nullable=False)
    role: Mapped[str] = mapped_column(String(60), nullable=False, default="Staff")
    email: Mapped[str | None] = mapped_column(String(200), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    tasks: Mapped[list["Task"]] = relationship(back_populates="owner")


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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

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
    category: Mapped[str] = mapped_column(String(10), nullable=False, default="Other")
    confidence: Mapped[float | None] = mapped_column(Float)

    meeting: Mapped[Meeting] = relationship(back_populates="segments")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    deadline: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Open")  # Open|In Progress|Completed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    meeting: Mapped[Meeting] = relationship(back_populates="tasks")
    owner: Mapped[User | None] = relationship(back_populates="tasks")
    segment: Mapped[Segment | None] = relationship()


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id", ondelete="SET NULL"))
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[date] = mapped_column(Date, nullable=False)

    meeting: Mapped[Meeting] = relationship(back_populates="decisions")
    owner: Mapped[User | None] = relationship()
    segment: Mapped[Segment | None] = relationship()


class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="Medium")  # Low|Medium|High
    raised_at: Mapped[date] = mapped_column(Date, nullable=False)
    recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="risks")
    segment: Mapped[Segment | None] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # overdue|due_soon|assigned|status_change
    message: Mapped[str] = mapped_column(Text, nullable=False)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    """Who changed what. Written on every create/update made through the API."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(30), nullable=False)   # task, meeting, ...
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)   # created, updated, deleted, processed
    detail: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
