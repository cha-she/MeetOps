"""spaCy owner / deadline extraction (skipped when spaCy or its English model is not installed)."""

from datetime import date

import pytest

from app.services import nlp
from app.services.extraction import find_owner_name, parse_deadline

pytestmark = pytest.mark.skipif(not nlp.available(), reason="spaCy model en_core_web_sm not installed")


def test_owner_from_vocative_subject_and_first_person():
    assert nlp.owner("Kasun, can you fix the login bug?", "Chanya") == "Kasun"
    assert nlp.owner("Priya is going to update the pricing sheet.", "Anna") == "Priya"
    assert nlp.owner("Nia needs to ask security.", "Amira") == "Nia"
    assert nlp.owner("I am going to send it.", "Jon") == "Jon"


def test_past_subject_is_not_an_owner():
    assert nlp.owner("Apple has been taking up to a week lately.", "Dilini") is None


def test_deadline_entities_and_durations():
    assert nlp.deadline_phrase("Can we have the list by 11 September 2026 at 14:00 UTC?") == "by 11 September 2026 at 14:00 UTC"
    assert nlp.deadline_phrase("The service was down for about forty minutes.") is None


def test_hybrid_uses_spacy_for_unseen_phrasing():
    # the rules alone do not recognise this owner; the hybrid engine does
    assert find_owner_name("Priya is going to update the pricing sheet.", "Anna", [], {"Anna"}, engine="rules") == (None, None)
    assert find_owner_name("Priya is going to update the pricing sheet.", "Anna", [], {"Anna"}, engine="hybrid") == (None, "Priya")
    d, phrase = parse_deadline("Sofia will send it early next month.", date(2026, 10, 31), engine="hybrid")
    assert phrase is not None
