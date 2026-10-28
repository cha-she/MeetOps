"""
API response / request models.

They mirror ``frontend/src/types.ts`` field for field. Python attributes are
snake_case; the JSON uses camelCase through the alias generator, so the
frontend types and these models stay the same shape.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Category = Literal["Task", "Decision", "Risk", "Other"]
TaskStatus = Literal["Open", "In Progress", "Completed"]
RiskSeverity = Literal["Low", "Medium", "High"]
MeetingSource = Literal["audio", "video", "transcript"]
MeetingStatus = Literal["Queued", "Processing", "Processed", "Failed"]
PipelineStage = Literal["upload", "transcribe", "preprocess", "classify", "extract", "save"]
NotificationType = Literal["overdue", "due_soon", "assigned", "status_change"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class UserOut(CamelModel):
    id: int
    name: str
    initials: str
    role: str


class MeetingOut(CamelModel):
    id: int
    title: str
    date: date
    duration_min: int | None
    source: MeetingSource
    status: MeetingStatus
    pipeline_stage: PipelineStage | None
    error_message: str | None
    participants: list[UserOut]
    task_count: int
    decision_count: int
    risk_count: int
    summary: str | None
    created_at: datetime


class EvidenceRef(CamelModel):
    segment_id: int
    speaker: str | None
    timestamp: str | None
    quote: str


class TaskOut(CamelModel):
    id: int
    description: str
    owner: UserOut | None
    meeting_id: int
    meeting_title: str
    deadline: date | None
    status: TaskStatus
    created_at: datetime
    evidence: EvidenceRef


class TaskPatch(CamelModel):
    status: TaskStatus | None = None
    deadline: date | None = None
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    owner_id: int | None = None


class DecisionOut(CamelModel):
    id: int
    statement: str
    owner: UserOut | None
    meeting_id: int
    meeting_title: str
    decided_at: date
    evidence: EvidenceRef


class RiskOut(CamelModel):
    id: int
    description: str
    meeting_id: int
    meeting_title: str
    severity: RiskSeverity
    raised_at: date
    recurring: bool
    evidence: EvidenceRef


class SegmentOut(CamelModel):
    id: int
    speaker: str | None
    timestamp: str | None
    start_sec: float | None
    text: str
    category: Category
    confidence: float | None


class NameValue(CamelModel):
    name: str
    value: int


class ItemsPerMeeting(CamelModel):
    name: str
    tasks: int
    decisions: int
    risks: int


class Workload(CamelModel):
    name: str
    open: int
    in_progress: int
    completed: int


class Totals(CamelModel):
    meetings: int
    processed_meetings: int
    processing_meetings: int
    tasks: int
    open_tasks: int
    overdue_tasks: int
    decisions: int
    risks: int
    high_risks: int


class InsightsSummary(CamelModel):
    totals: Totals
    task_status: list[NameValue]
    risk_severity: list[NameValue]
    items_per_meeting: list[ItemsPerMeeting]
    workload: list[Workload]
    recurring_risks: list[RiskOut]
    completion_rate: float
    avg_items_per_meeting: float
    top_owner: str | None


class NotificationOut(CamelModel):
    id: int
    type: NotificationType
    message: str
    task_id: int | None
    read: bool
    created_at: datetime


class SearchResults(CamelModel):
    query: str
    meetings: list[MeetingOut]
    tasks: list[TaskOut]
    decisions: list[DecisionOut]
    risks: list[RiskOut]


class Health(CamelModel):
    status: str
    version: str
    database: str
    model: str | None
