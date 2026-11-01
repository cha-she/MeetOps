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


def _who_said(raw):
    return [(u.speaker, u.text) for u in segment_transcript(raw)]


def test_time_comma_speaker_and_curly_quotes():
    raw = "00:40, Amira: “Maybe we should move all renewals.”\n\n03:28, Jon: “I’ll run that comparison.”"
    utts = segment_transcript(raw)
    assert [(u.speaker, u.text, u.start_time) for u in utts] == [
        ("Amira", "Maybe we should move all renewals.", 40.0),
        ("Jon", "I'll run that comparison.", 208.0),        # curly apostrophe made plain
    ]


def test_name_then_time_and_header_layouts():
    assert _who_said("Dilini (02:10): We go with plan B.") == [("Dilini", "We go with plan B.")]
    teams = "Amira Perera   0:40\nMaybe we should move all renewals.\n\nJon Silva   1:05\nI can examine the import."
    assert _who_said(teams) == [("Amira Perera", "Maybe we should move all renewals."),
                                ("Jon Silva", "I can examine the import.")]


def test_vtt_and_srt_files():
    vtt = "WEBVTT\n\n1\n00:00:40.000 --> 00:00:44.000\n<v Amira>Move all renewals.</v>\n"
    srt = "1\n00:01:05,000 --> 00:01:09,000\nJon: I'll run the comparison.\n"
    assert [(u.speaker, u.text, u.start_time) for u in segment_transcript(vtt)] == [("Amira", "Move all renewals.", 40.0)]
    assert [(u.speaker, u.text, u.start_time) for u in segment_transcript(srt)] == [("Jon", "I'll run the comparison.", 65.0)]


def test_plain_minutes_and_content_labels():
    raw = "Action items: Kasun will fix the bug by Wednesday. Dr. Perera approved the budget.\n\nNote: release moves to Friday."
    utts = segment_transcript(raw)
    assert {u.speaker for u in utts} == {"Unknown"}            # "Action items" and "Note" are not people
    assert [u.text for u in utts][1] == "Dr. Perera approved the budget."   # no split after "Dr."
