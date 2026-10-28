from meetops_ml.preprocessing import clean_text, segment_transcript


def test_spelled_letters_are_joined():
    assert clean_text("the T_V_ and the V_C_R_") == "the tv and the vcr"


def test_fillers_removed_and_contractions_expanded():
    assert clean_text("Um, I'll do it, you know, uh, tomorrow.") == "i will do it tomorrow"


def test_repeated_words_collapsed():
    assert clean_text("we we have to to decide") == "we have to decide"


def test_negation_kept():
    assert clean_text("That won't work and we can't afford it") == "that will not work and we can not afford it"


def test_non_string_is_empty():
    assert clean_text(None) == ""


def test_segment_transcript_speakers_and_sentences():
    raw = """[00:01:05] Chanya: Okay, let's start. I'll send the report by Friday.
Ravindu: The problem is the battery. It might not last a week.
 and that worries me.
"""
    utts = segment_transcript(raw)
    assert [u.speaker for u in utts] == ["Chanya", "Chanya", "Ravindu", "Ravindu"]
    assert utts[0].start_time == 65.0
    assert utts[1].text == "I'll send the report by Friday."
    assert utts[3].text.startswith("It might not last a week.")
