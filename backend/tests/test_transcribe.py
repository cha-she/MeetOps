"""Speech-to-text helpers that do not need the models: sentence cutting, voice clustering, output."""

from types import SimpleNamespace

import numpy as np

from app.services import transcribe
from app.services.extraction import is_speaker_number
from app.services.transcribe import Sentence, cluster_voices, to_transcript


def _voice(seed: int, noise: float = 0.05) -> np.ndarray:
    """A fake fingerprint: one direction per person, a little noise per sentence."""
    base = np.random.default_rng(seed).normal(size=64)
    v = base + np.random.default_rng().normal(scale=noise * np.linalg.norm(base), size=64)
    return v / np.linalg.norm(v)


def test_voices_are_grouped_and_numbered_by_first_appearance():
    a, b = 1, 2
    order = [b, b, a, b, a, a]
    labels = cluster_voices([_voice(p) for p in order], [3.0] * len(order), threshold=0.3)
    assert labels == [0, 0, 1, 0, 1, 1]


def test_known_number_of_speakers_and_short_sentences():
    order = [1, 2, 3, 1, 2, 3, 1]
    durations = [3.0, 3.0, 3.0, 0.5, 3.0, 3.0, 3.0]          # the 0.5 s line joins the closest voice
    labels = cluster_voices([_voice(p) for p in order], durations, num_speakers=3)
    assert labels == [0, 1, 2, 0, 1, 2, 0]
    # no fingerprint at all (too short to compute): same speaker as the line before
    labels = cluster_voices([_voice(1), None, _voice(2), _voice(2)], [3.0, 0.2, 3.0, 3.0], threshold=0.3)
    assert labels == [0, 0, 1, 1]


def test_close_voices_are_still_two_people():
    """Two voices exactly 0.4 apart: a fixed 0.4 cut-off flipped between one and two speakers."""
    rng = np.random.default_rng(7)
    e1, e2 = np.eye(64)[0], np.eye(64)[1]
    a, b = e1, 0.6 * e1 + 0.8 * e2                     # cosine distance 1 - 0.6 = 0.4

    def say(v):
        w = v + rng.normal(scale=0.03, size=64)
        return w / np.linalg.norm(w)

    order = [a, a, b, b, a, b, a, b, b, a]
    labels = cluster_voices([say(v) for v in order], [3.0] * len(order), threshold=0.3)
    assert labels == [0, 0, 1, 1, 0, 1, 0, 1, 1, 0]


def test_three_people_found_without_being_told():
    order = [1, 2, 3, 2, 1, 3, 3, 2, 1]
    labels = cluster_voices([_voice(p) for p in order], [3.0] * len(order), threshold=0.3)
    assert labels == [0, 1, 2, 1, 0, 2, 2, 1, 0]


def test_one_voice():
    assert cluster_voices([_voice(1), _voice(1)], [3.0, 3.0], threshold=0.3) == [0, 0]
    assert cluster_voices([_voice(1)], [3.0]) == [0]


def test_whisper_words_are_cut_into_sentences(monkeypatch):
    def w(word, start, end):
        return SimpleNamespace(word=word, start=start, end=end)

    seg1 = SimpleNamespace(end=4.0, words=[w(" Good", 0.0, 0.4), w(" morning.", 0.4, 1.0), w(" Kasun,", 1.2, 1.6),
                                           w(" can", 1.6, 1.8), w(" you", 1.8, 2.0)])
    seg2 = SimpleNamespace(end=9.0, words=[w(" take", 2.0, 2.3), w(" it?", 2.3, 2.8),
                                           w(" Sure", 6.0, 6.4)])      # a long pause also ends a sentence
    fake = SimpleNamespace(transcribe=lambda audio, **kw: ([seg1, seg2], SimpleNamespace(duration=9.0)))
    monkeypatch.setattr(transcribe, "_whisper", lambda: fake)
    seen = []
    out = transcribe.transcribe(np.zeros(16000, dtype=np.float32), ["Kasun Silva"], seen.append)
    assert [(s.start, s.text) for s in out] == [(0.0, "Good morning."), (1.2, "Kasun, can you take it?"), (6.0, "Sure")]
    assert seen[-1] == 1.0


def test_transcript_layout_is_read_by_the_text_pipeline():
    from meetops_ml.preprocessing import segment_transcript

    text = to_transcript([Sentence(5, 7, "Can you send it by Friday?", "Speaker 1"),
                          Sentence(71, 72, "Yes, I will.", "Speaker 2")])
    assert text.splitlines()[1] == "[00:01:11] Speaker 2: Yes, I will."
    utterances = segment_transcript(text)
    assert [(u.speaker, u.start_time) for u in utterances] == [("Speaker 1", 5.0), ("Speaker 2", 71.0)]


def test_speaker_numbers_are_not_names():
    assert is_speaker_number("Speaker 2") and is_speaker_number("participant 11")
    assert not is_speaker_number("Kasun") and not is_speaker_number("Speaker") and not is_speaker_number(None)
