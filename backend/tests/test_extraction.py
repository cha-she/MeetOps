from datetime import date

from app import models
from app.services.extraction import parse_deadline, risk_severity, task_title, tidy

USERS = [models.User(id=i + 1, name=n, initials="".join(p[0] for p in n.split()))
         for i, n in enumerate(["Kasun Silva", "Nethmi Fernando", "Ishara Jayasuriya"])]
THU = date(2026, 10, 29)   # a Thursday


def test_task_titles():
    assert task_title("I'll write the integration tests for refunds by Wednesday.", USERS) == \
        "Write the integration tests for refunds"
    assert task_title("Nethmi, can you chase the design team for the receipt page today?", USERS) == \
        "Chase the design team for the receipt page"
    assert task_title("Ishara, please schedule a restore drill for next week.", USERS) == "Schedule a restore drill"
    assert task_title("Let's make sure the Docker setup is tested before Thursday.", USERS) == \
        "Make sure the Docker setup is tested"
    assert task_title("Yep, I'll do it.", USERS) is None
    assert task_title("Kasun, could you take that?", USERS) is None


def test_deadlines_relative_to_meeting_date():
    assert parse_deadline("by Friday", THU)[0] == date(2026, 10, 30)
    assert parse_deadline("by Wednesday", THU)[0] == date(2026, 11, 4)
    assert parse_deadline("today", THU)[0] == THU
    assert parse_deadline("submission has to go in by the twentieth", THU)[0] == date(2026, 11, 20)
    assert parse_deadline("by the end of the month", THU)[0] == date(2026, 10, 31)
    d, phrase = parse_deadline("before the go-live", THU)
    assert d is None and phrase == "before the go-live"
    assert parse_deadline("no time words here", THU) == (None, None)


def test_tidy_and_severity():
    assert tidy("Hmm, okay, so we'll do the training on site.") == "We'll do the training on site."
    assert risk_severity("If nobody replaces him, we won't have anyone to approve it.") == "High"
    assert risk_severity("I'm a bit worried about performance.") == "Medium"
