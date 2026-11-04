"""Name suggestions for the numbered speakers of a recording."""

from types import SimpleNamespace as Line

from app import models
from app.services.speakers import suggest_names

USERS = [models.User(id=i + 1, name=n, initials="".join(p[0] for p in n.split()))
         for i, n in enumerate(["Kasun Silva", "Nethmi Fernando", "Ravindu Perera"])]


def _names(lines):
    return {k: v[0] for k, v in suggest_names([Line(speaker=s, text=t) for s, t in lines], USERS).items()}


def test_greeting_names_the_next_speaker():
    assert _names([("Speaker 1", "Hi Kasun, thanks for joining."), ("Speaker 1", "Let's start."),
                   ("Speaker 2", "Sure.")]) == {"Speaker 2": "Kasun Silva"}


def test_request_and_thanks_and_introductions():
    lines = [("Speaker 1", "Ravindu, can you share the report?"), ("Speaker 2", "Yes."),
             ("Speaker 3", "I'm Amal from the client side."), ("Speaker 1", "Thanks, Amal.")]
    assert _names(lines) == {"Speaker 2": "Ravindu Perera", "Speaker 3": "Amal"}


def test_a_name_on_its_own_line_after_thanks():
    lines = [("Speaker 1", "Good morning."), ("Speaker 2", "Morning."), ("Speaker 1", "Thanks."), ("Speaker 1", "Nethmi.")]
    assert _names(lines) == {"Speaker 2": "Nethmi Fernando"}


def test_ordinary_words_are_not_names():
    lines = [("Speaker 1", "Okay, great."), ("Speaker 2", "Hi everyone, sure."), ("Speaker 1", "Right, fine."),
             ("Speaker 2", "Sure, can you check it?")]
    assert _names(lines) == {}


def test_named_speakers_are_left_alone():
    assert _names([("Chanya", "Hi Kasun, thanks for joining."), ("Kasun", "Hi.")]) == {}
