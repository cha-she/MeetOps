"""
PDF reports (reportlab), generated on the server from the same data and permissions as the API.

* ``meeting_minutes`` — the minutes of one meeting: details, summary, decisions, action items
  (owner, due date), risks (severity), each with the time in the recording or transcript.
* ``register`` — the Tasks, Decisions or Risks register for the rows a person is looking at
  (the page sends the ids it shows, so the PDF matches the filters on screen).

Rejected items are never included; items still waiting for review are marked "to review".
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .. import models

ACCENT = colors.HexColor("#0F8A6C")      # the app's teal accent
INK = colors.HexColor("#1F2328")
MUTED = colors.HexColor("#5F6B76")
LINE = colors.HexColor("#D8DEE4")
SOFT = colors.HexColor("#F2F6F5")

_base = getSampleStyleSheet()
TITLE = ParagraphStyle("title", parent=_base["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22,
                       textColor=INK, alignment=TA_LEFT, spaceAfter=2)
SUB = ParagraphStyle("sub", parent=_base["Normal"], fontName="Helvetica", fontSize=9.5, textColor=MUTED, leading=13)
H2 = ParagraphStyle("h2", parent=_base["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, textColor=ACCENT,
                    spaceBefore=10, spaceAfter=4)
BODY = ParagraphStyle("body", parent=_base["Normal"], fontName="Helvetica", fontSize=9.5, leading=13, textColor=INK)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.8, leading=11.5)
CELL_MUTED = ParagraphStyle("cellmuted", parent=CELL, textColor=MUTED)
HEAD = ParagraphStyle("head", parent=CELL, fontName="Helvetica-Bold", textColor=colors.white)


def _p(text: str | None, style: ParagraphStyle = CELL) -> Paragraph:
    return Paragraph(escape(text or "—"), style)


def _hms(sec: float | None) -> str:
    if sec is None:
        return ""
    sec = int(sec)
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def _date(d: date | None) -> str:
    return d.strftime("%a %d %b %Y") if d else "—"


def _due(t: models.Task) -> str:
    if t.deadline:
        text = _date(t.deadline)
        if t.deadline_time:
            text += t.deadline_time.strftime(", %H:%M")
        return text
    return t.deadline_text or "—"


def _owner(item) -> str:
    return item.owner.name if getattr(item, "owner", None) else (getattr(item, "owner_name", None) or "—")


def _visible(items):
    return [i for i in items if i.review_status != "rejected"]


def _review_mark(item) -> str:
    return " (to review)" if item.review_status == "suggested" else ""


def _table(header: list[str], rows: list[list], widths: list[float]) -> Table:
    data = [[Paragraph(escape(h), HEAD) for h in header]] + rows
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _footer(label: str):
    def draw(canvas, doc):
        canvas.saveState()
        w, _h = doc.pagesize
        canvas.setStrokeColor(ACCENT)
        canvas.setLineWidth(2)
        canvas.line(doc.leftMargin, doc.pagesize[1] - 12 * mm, w - doc.rightMargin, doc.pagesize[1] - 12 * mm)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.setFillColor(ACCENT)
        canvas.drawString(doc.leftMargin, doc.pagesize[1] - 10 * mm, "MeetOps")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(w - doc.rightMargin, doc.pagesize[1] - 10 * mm, label)
        stamp = datetime.now(timezone.utc).astimezone().strftime("%d %b %Y %H:%M")
        canvas.drawString(doc.leftMargin, 9 * mm, f"Generated {stamp}")
        canvas.drawRightString(w - doc.rightMargin, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()
    return draw


def _build(story: list, label: str, pagesize=A4) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=pagesize, leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=20 * mm, bottomMargin=16 * mm, title=label, author="MeetOps")
    doc.build(story, onFirstPage=_footer(label), onLaterPages=_footer(label))
    return buf.getvalue()


def _evidence(item) -> str:
    seg = item.segment
    if seg is None:
        return ""
    when = _hms(seg.start_sec)
    return f"{seg.speaker or ''} {when}".strip()


# ---------------------------------------------------------------- meeting minutes

def meeting_minutes(m: models.Meeting) -> bytes:
    tasks, decisions, risks = _visible(m.tasks), _visible(m.decisions), _visible(m.risks)
    width = A4[0] - 32 * mm
    story: list = [Paragraph(escape(m.title), TITLE),
                   Paragraph("Meeting minutes", SUB), Spacer(1, 6)]

    people = ", ".join(p.name for p in m.participants) or "—"
    details = [
        [_p("Date", CELL_MUTED), _p(_date(m.date)), _p("Duration", CELL_MUTED),
         _p(f"{m.duration_min} min" if m.duration_min else "—")],
        [_p("Department", CELL_MUTED), _p(m.department.name if m.department else "—"),
         _p("Source", CELL_MUTED), _p({"audio": "Audio recording", "video": "Video recording"}.get(m.source, "Transcript"))],
        [_p("Participants", CELL_MUTED), _p(people), _p("Uploaded by", CELL_MUTED),
         _p(m.uploaded_by.name if m.uploaded_by else "—")],
    ]
    dt = Table(details, colWidths=[width * 0.16, width * 0.38, width * 0.16, width * 0.30])
    dt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SOFT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story += [dt, Paragraph("Summary", H2), _p(m.summary or "No summary.", BODY)]

    story.append(Paragraph(f"Decisions ({len(decisions)})", H2))
    if decisions:
        story.append(_table(["Decision", "Decided by", "Said at"],
                            [[_p(d.statement + _review_mark(d)), _p(_owner(d)), _p(_evidence(d), CELL_MUTED)] for d in decisions],
                            [width * 0.62, width * 0.2, width * 0.18]))
    else:
        story.append(_p("No decisions recorded.", BODY))

    story.append(Paragraph(f"Action items ({len(tasks)})", H2))
    if tasks:
        story.append(_table(["Action", "Owner", "Due", "Status", "Said at"],
                            [[_p(t.description + _review_mark(t)), _p(_owner(t)), _p(_due(t)), _p(t.status),
                              _p(_evidence(t), CELL_MUTED)] for t in tasks],
                            [width * 0.40, width * 0.17, width * 0.17, width * 0.11, width * 0.15]))
    else:
        story.append(_p("No action items recorded.", BODY))

    story.append(Paragraph(f"Risks ({len(risks)})", H2))
    if risks:
        story.append(_table(["Risk", "Severity", "Status", "Raised by", "Said at"],
                            [[_p(r.description + _review_mark(r)), _p(r.severity), _p(r.status),
                              _p(r.raised_by), _p(_evidence(r), CELL_MUTED)] for r in risks],
                            [width * 0.46, width * 0.11, width * 0.11, width * 0.16, width * 0.16]))
    else:
        story.append(_p("No risks recorded.", BODY))

    pending = sum(i.review_status == "suggested" for i in tasks + decisions + risks)
    if pending:
        story += [Spacer(1, 8), _p(f"{pending} item(s) marked 'to review' were extracted automatically and not yet "
                                   "confirmed by a person.", CELL_MUTED)]
    return _build(story, f"Minutes · {m.title}")


# ---------------------------------------------------------------- registers

REGISTER_TITLES = {"tasks": "Task register", "decisions": "Decision register", "risks": "Risk log"}


def register(kind: str, items: list, title: str | None = None) -> bytes:
    page = landscape(A4)
    width = page[0] - 32 * mm
    items = _visible(items)
    heading = title or REGISTER_TITLES[kind]
    story: list = [Paragraph(escape(heading), TITLE),
                   Paragraph(f"{len(items)} item{'s' if len(items) != 1 else ''}", SUB), Spacer(1, 8)]
    if kind == "tasks":
        rows = [[_p(t.description + _review_mark(t)), _p(_owner(t)), _p(_due(t)), _p(t.status), _p(t.priority),
                 _p(t.meeting.title), _p(_evidence(t), CELL_MUTED)] for t in items]
        story.append(_table(["Task", "Owner", "Due", "Status", "Priority", "Meeting", "Said at"], rows,
                            [width * f for f in (0.33, 0.13, 0.13, 0.08, 0.07, 0.17, 0.09)]))
    elif kind == "decisions":
        rows = [[_p(d.statement + _review_mark(d)), _p(_owner(d)), _p(_date(d.decided_at)), _p(d.meeting.title),
                 _p(_evidence(d), CELL_MUTED)] for d in items]
        story.append(_table(["Decision", "Decided by", "Date", "Meeting", "Said at"], rows,
                            [width * f for f in (0.44, 0.14, 0.12, 0.20, 0.10)]))
    else:
        rows = [[_p(r.description + _review_mark(r) + (" (recurring)" if r.recurring else "")), _p(r.severity),
                 _p(r.status), _p(r.owner.name if r.owner else "—"), _p(r.raised_by), _p(r.meeting.title),
                 _p(_evidence(r), CELL_MUTED)] for r in items]
        story.append(_table(["Risk", "Severity", "Status", "Owner", "Raised by", "Meeting", "Said at"], rows,
                            [width * f for f in (0.34, 0.08, 0.08, 0.12, 0.12, 0.17, 0.09)]))
    if not items:
        story.append(_p("Nothing to show.", BODY))
    return _build(story, heading, pagesize=page)
