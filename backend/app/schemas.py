"""
API request / response models.

They mirror ``frontend/src/types.ts`` field for field. Python attributes are
snake_case; the JSON uses camelCase through the alias generator.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, PlainSerializer
from pydantic.alias_generators import to_camel

# SQLite drops the time zone; every timestamp is stored in UTC, so mark it as UTC on the way out.
UTCDateTime = Annotated[
    datetime,
    PlainSerializer(lambda d: (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat(), return_type=str),
]

EmailStr = Annotated[
    str,
    Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=200),
    AfterValidator(lambda v: v.strip().lower()),
]

Category = Literal["Task", "Decision", "Risk", "Other"]
TaskStatus = Literal["Open", "In Progress", "Completed"]
Priority = Literal["Low", "Medium", "High"]
RiskSeverity = Literal["Low", "Medium", "High"]
RiskStatus = Literal["Open", "Mitigated", "Closed"]
MeetingSource = Literal["audio", "video", "transcript"]
MeetingStatus = Literal["Queued", "Processing", "Processed", "Failed"]
PipelineStage = Literal["upload", "transcribe", "preprocess", "classify", "extract", "save"]
NotificationType = Literal["overdue", "due_soon", "assigned", "status_change", "review"]
Role = Literal["admin", "manager", "member"]
ReviewStatus = Literal["suggested", "confirmed", "rejected"]
ItemSource = Literal["ai", "manual"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------------------------------------------------------------- people

class DepartmentRef(CamelModel):
    id: int
    name: str


class UserOut(CamelModel):
    id: int
    name: str
    initials: str
    email: str
    role: Role
    title: str | None
    department: DepartmentRef | None
    is_active: bool


class DepartmentOut(CamelModel):
    id: int
    name: str
    member_count: int


class DepartmentIn(CamelModel):
    name: str = Field(min_length=2, max_length=80)


class UserCreate(CamelModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role = "member"
    title: str | None = Field(default=None, max_length=80)
    department_id: int | None = None


class UserPatch(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    role: Role | None = None
    title: str | None = Field(default=None, max_length=80)
    department_id: int | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class LoginIn(CamelModel):
    email: EmailStr
    password: str


class SetupIn(CamelModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    department: str = Field(default="Management", min_length=2, max_length=80)
    title: str | None = Field(default=None, max_length=80)


class AuthOut(CamelModel):
    token: str
    user: UserOut


class AuthStatus(CamelModel):
    needs_setup: bool


# ---------------------------------------------------------------- meetings

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
    department: DepartmentRef | None
    uploaded_by: UserOut | None
    task_count: int
    decision_count: int
    risk_count: int
    suggested_count: int
    summary: str | None
    model_name: str | None
    created_at: UTCDateTime


class EvidenceRef(CamelModel):
    segment_id: int
    speaker: str | None
    timestamp: str | None
    quote: str


class SegmentOut(CamelModel):
    id: int
    speaker: str | None
    timestamp: str | None
    start_sec: float | None
    text: str
    category: Category
    confidence: float | None
    model_label: Category | None
    rule: str | None
    corrected: bool


class ReclassifyIn(CamelModel):
    category: Category


# ---------------------------------------------------------------- registers

class TaskOut(CamelModel):
    id: int
    description: str
    owner: UserOut | None
    meeting_id: int
    meeting_title: str
    meeting_date: date
    department: DepartmentRef | None
    deadline: date | None
    deadline_text: str | None
    status: TaskStatus
    priority: Priority
    review_status: ReviewStatus
    confidence: float | None
    source: ItemSource
    created_at: UTCDateTime
    completed_at: UTCDateTime | None
    evidence: EvidenceRef | None


class TaskCreate(CamelModel):
    description: str = Field(min_length=3, max_length=2000)
    meeting_id: int
    owner_id: int | None = None
    deadline: date | None = None
    priority: Priority = "Medium"
    segment_id: int | None = None


class TaskPatch(CamelModel):
    status: TaskStatus | None = None
    deadline: date | None = None
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    owner_id: int | None = None
    priority: Priority | None = None
    review_status: ReviewStatus | None = None


class DecisionOut(CamelModel):
    id: int
    statement: str
    owner: UserOut | None
    meeting_id: int
    meeting_title: str
    department: DepartmentRef | None
    decided_at: date
    review_status: ReviewStatus
    confidence: float | None
    source: ItemSource
    evidence: EvidenceRef | None


class DecisionPatch(CamelModel):
    statement: str | None = Field(default=None, min_length=1, max_length=2000)
    owner_id: int | None = None
    review_status: ReviewStatus | None = None


class RiskOut(CamelModel):
    id: int
    description: str
    meeting_id: int
    meeting_title: str
    department: DepartmentRef | None
    severity: RiskSeverity
    status: RiskStatus
    owner: UserOut | None
    raised_by: str | None
    raised_at: date
    recurring: bool
    review_status: ReviewStatus
    confidence: float | None
    source: ItemSource
    evidence: EvidenceRef | None


class RiskPatch(CamelModel):
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    severity: RiskSeverity | None = None
    status: RiskStatus | None = None
    owner_id: int | None = None
    review_status: ReviewStatus | None = None


class ReviewQueue(CamelModel):
    tasks: list[TaskOut]
    decisions: list[DecisionOut]
    risks: list[RiskOut]


# ---------------------------------------------------------------- insights

class NameValue(CamelModel):
    name: str
    value: int


class ItemsPerMeeting(CamelModel):
    id: int
    name: str
    tasks: int
    decisions: int
    risks: int


class Workload(CamelModel):
    user_id: int
    name: str
    open: int
    in_progress: int
    completed: int
    overdue: int


class DepartmentStat(CamelModel):
    name: str
    open_tasks: int
    overdue_tasks: int
    completion_rate: float


class WeeklyPoint(CamelModel):
    week: str
    created: int
    completed: int


class Totals(CamelModel):
    meetings: int
    processed_meetings: int
    processing_meetings: int
    tasks: int
    open_tasks: int
    overdue_tasks: int
    due_this_week: int
    decisions: int
    risks: int
    open_risks: int
    high_risks: int
    pending_review: int


class MySummary(CamelModel):
    open_tasks: int
    overdue_tasks: int
    due_this_week: int
    completed_this_week: int
    pending_review: int


class InsightsSummary(CamelModel):
    totals: Totals
    me: MySummary
    task_status: list[NameValue]
    risk_severity: list[NameValue]
    items_per_meeting: list[ItemsPerMeeting]
    workload: list[Workload]
    departments: list[DepartmentStat]
    weekly: list[WeeklyPoint]
    recurring_risks: list[RiskOut]
    completion_rate: float
    on_time_rate: float | None
    avg_items_per_meeting: float
    review_acceptance_rate: float | None
    top_owner: str | None


class ActivityOut(CamelModel):
    id: int
    actor: UserOut | None
    entity: str
    entity_id: int
    action: str
    detail: str | None
    meeting_id: int | None
    created_at: UTCDateTime


class NotificationOut(CamelModel):
    id: int
    type: NotificationType
    message: str
    task_id: int | None
    meeting_id: int | None
    read: bool
    created_at: UTCDateTime


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
    rules: bool
