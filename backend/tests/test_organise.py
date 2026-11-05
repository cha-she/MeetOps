from datetime import date

from app import models
from app.services.organise import build_drafts

MEETING = date(2026, 11, 5)


def segments(lines):
    """Transcript lines (text, label) as classified segments, all from an unnamed speaker."""
    return [models.Segment(id=i + 1, position=i, speaker="Unknown", text=t, category=c, confidence=0.9)
            for i, (t, c) in enumerate(lines)]


def tasks(lines):
    return [d for d in build_drafts(segments(lines), MEETING, []) if d.kind == "Task"]


def test_deadline_on_the_next_line_joins_the_task():
    found = tasks([("Mark will contact the supplier to confirm the integration requirements.", "Task"),
                   ("He will complete this by 24 November.", "Task")])
    assert len(found) == 1
    assert found[0].owner_name == "Mark"
    assert found[0].deadline == date(2026, 11, 24)
    assert "complete this" not in found[0].description


def test_pointing_back_works_even_when_the_model_says_other():
    found = tasks([("Mark will contact the supplier to confirm the integration requirements.", "Task"),
                   ("He will complete this by 24 November.", "Other")])
    assert len(found) == 1 and found[0].deadline == date(2026, 11, 24)


def test_a_new_person_with_a_deadline_is_a_new_task():
    found = tasks([("Daniel mentioned that the system prototype is ready for review.", "Task"),
                   ("Emma will review the prototype and provide comments by 23 November.", "Task")])
    assert len(found) == 2
    emma = next(t for t in found if t.owner_name == "Emma")
    assert emma.deadline == date(2026, 11, 23)
    assert "review the prototype" in emma.description.lower()


def test_same_month_alone_does_not_make_a_follow_up():
    found = tasks([("Emma will review the prototype by 23 November.", "Task"),
                   ("The budget numbers must be final by 26 November.", "Task")])
    assert len(found) == 2


def test_agreed_to_is_a_commitment():
    found = tasks([("Sophie agreed to prepare the product inventory data and upload it by 26 November.", "Task"),
                   ("Everyone agreed to keep the meetings short.", "Task")])
    assert found[0].owner_name == "Sophie" and found[0].deadline == date(2026, 11, 26)
    assert found[1].owner_name is None
