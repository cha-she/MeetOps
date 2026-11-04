"""
Speech-to-text and speaker separation for audio and video uploads. Everything runs locally.

    recording (.mp3 .wav .m4a .mp4 .mkv ...)
      -> 16 kHz mono audio             PyAV (FFmpeg libraries bundled with faster-whisper);
                                       for a video only the audio track is read
      -> sentences with times          faster-whisper: Whisper on CTranslate2, int8 on the CPU,
                                       word timestamps to cut the text into sentences
      -> who said each sentence        a voice fingerprint (speaker embedding, WeSpeaker ResNet34
                                       trained on VoxCeleb, run with sherpa-onnx) per sentence,
                                       grouped by agglomerative clustering on cosine distance;
                                       the number of speakers is given at upload or chosen by
                                       silhouette score
      -> "[00:01:10] Speaker 2: ..."   the transcript layout the text pipeline already reads

Whisper is given the names of the people in the workspace as its initial prompt, so names
come out spelled like the accounts ("Kasun", not "Causoon"). Speakers are numbered in order
of first appearance; people rename them on the meeting page.

Try it on a file:  python -m app.services.transcribe recording.mp3 [--speakers 3]
"""

from __future__ import annotations

import logging
import os
import re
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Callable, Iterable

import numpy as np

from ..config import settings

log = logging.getLogger("meetops.transcribe")

SAMPLE_RATE = 16_000
THREADS = min(os.cpu_count() or 4, 8)
VOICE_MODEL = "wespeaker_en_voxceleb_resnet34.onnx"
VOICE_MODEL_URL = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/"
                   + VOICE_MODEL)
MIN_VOICE_SEC = 1.0    # shorter sentences give an unreliable fingerprint: they join the closest speaker
PAUSE_SEC = 1.5        # a pause this long ends a sentence even without a full stop
MAX_SPEAKERS = 8       # most groupings tried when the number of speakers is not given
CLEARLY_BETTER = 0.05  # silhouette gain needed to prefer one more speaker
SENTENCE_END = re.compile(r"[.?!]['\"”’)]*$")


@dataclass
class Sentence:
    start: float
    end: float
    text: str
    speaker: str | None = None


def available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        import sherpa_onnx  # noqa: F401
    except ImportError:
        return False
    return True


@lru_cache(maxsize=1)
def _whisper():
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    from faster_whisper import WhisperModel

    # downloaded from Hugging Face on first use, then cached
    return WhisperModel(settings.whisper_model, device="cpu", compute_type="int8", cpu_threads=THREADS)


@lru_cache(maxsize=1)
def _voice_model():
    import sherpa_onnx

    path = Path(settings.speech_model_dir) / VOICE_MODEL
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        log.info("downloading the speaker model to %s", path)
        part = path.with_suffix(".part")
        urllib.request.urlretrieve(VOICE_MODEL_URL, part)
        part.replace(path)
    config = sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(path), num_threads=THREADS)
    return sherpa_onnx.SpeakerEmbeddingExtractor(config)


def load_audio(path: str | Path) -> np.ndarray:
    """Any audio or video file as 16 kHz mono float samples."""
    from faster_whisper.audio import decode_audio

    try:
        audio = decode_audio(str(path), sampling_rate=SAMPLE_RATE)
    except Exception as exc:  # noqa: BLE001 - PyAV raises many error types for unreadable files
        raise RuntimeError("Could not read any audio from this file. Is it a recording with sound?") from exc
    if audio.size < SAMPLE_RATE:
        raise RuntimeError("The recording is shorter than one second.")
    return audio


# ---------------------------------------------------------------- speech-to-text

def transcribe(audio: np.ndarray, names: Iterable[str] = (),
               progress: Callable[[float], None] | None = None) -> list[Sentence]:
    """Whisper text cut into sentences, each with its start and end time in seconds."""
    names = list(dict.fromkeys(n for n in names if n))[:40]
    prompt = f"Meeting with {', '.join(names)}." if names else None
    segments, info = _whisper().transcribe(
        audio, language=settings.whisper_language or None, beam_size=5,
        vad_filter=True,               # skip silence: faster, and no text invented in quiet parts
        word_timestamps=True, initial_prompt=prompt)

    sentences: list[Sentence] = []
    words: list = []

    def flush() -> None:
        text = "".join(w.word for w in words).strip()
        if text:
            sentences.append(Sentence(words[0].start, words[-1].end, text))
        words.clear()

    for seg in segments:
        for w in seg.words or []:
            if words and w.start - words[-1].end >= PAUSE_SEC:
                flush()
            words.append(w)
            if SENTENCE_END.search(w.word.strip()):
                flush()
        if progress and info.duration:
            progress(min(seg.end / info.duration, 1.0))
    flush()
    return sentences


# ---------------------------------------------------------------- who spoke

def _fingerprint(extractor, audio: np.ndarray, s: Sentence) -> np.ndarray | None:
    stream = extractor.create_stream()
    stream.accept_waveform(SAMPLE_RATE, audio[int(s.start * SAMPLE_RATE):int(s.end * SAMPLE_RATE)])
    stream.input_finished()
    if not extractor.is_ready(stream):
        return None
    v = np.asarray(extractor.compute(stream), dtype=np.float32)
    n = np.linalg.norm(v)
    return v / n if n else None


def _number_of_speakers(X: np.ndarray, threshold: float) -> int:
    """How many people speak, when nobody said so at upload.

    1. More than one? Only if the two most different groups of sentences are further apart than
       ``threshold`` (one voice stays within about 0.25 of itself, two voices are 0.40 or more apart).
    2. How many? The number of groups with the best silhouette score (each sentence much closer to
       its own group than to the next), preferring fewer speakers unless more are clearly better.
    """
    from sklearn.cluster import AgglomerativeClustering
    from sklearn.metrics import silhouette_score

    tree = AgglomerativeClustering(n_clusters=1, metric="cosine", linkage="average", compute_distances=True).fit(X)
    if tree.distances_.max() < threshold:
        return 1
    if len(X) < 4:                      # too few sentences to compare groupings
        return 2
    scores = {}
    for k in range(2, min(MAX_SPEAKERS, len(X) - 1) + 1):
        labels = AgglomerativeClustering(n_clusters=k, metric="cosine", linkage="average").fit_predict(X)
        scores[k] = silhouette_score(X, labels, metric="cosine")
    best = max(scores.values())
    return min(k for k, s in scores.items() if s >= best - CLEARLY_BETTER)


def cluster_voices(vectors: list[np.ndarray | None], durations: list[float],
                   num_speakers: int | None = None, threshold: float | None = None) -> list[int]:
    """One speaker number per sentence (0, 1, 2 ... in order of first appearance).

    Sentences of at least MIN_VOICE_SEC are clustered (average linkage, cosine distance) into the
    number of speakers given at upload, or the number found by ``_number_of_speakers``. Shorter
    sentences join the closest speaker, or the previous one when they have no fingerprint.
    """
    from sklearn.cluster import AgglomerativeClustering

    threshold = settings.speaker_threshold if threshold is None else threshold
    long = [i for i, (v, d) in enumerate(zip(vectors, durations)) if v is not None and d >= MIN_VOICE_SEC]
    if len(long) < 2 or num_speakers == 1:
        return [0] * len(vectors)
    X = np.stack([vectors[i] for i in long])
    k = min(num_speakers, len(long)) if num_speakers else _number_of_speakers(X, threshold)
    if k == 1:
        return [0] * len(vectors)
    labels = AgglomerativeClustering(n_clusters=k, metric="cosine", linkage="average").fit_predict(X)
    centroids = np.stack([X[labels == c].mean(axis=0) for c in range(labels.max() + 1)])
    centroids /= np.linalg.norm(centroids, axis=1, keepdims=True)

    raw: list[int] = []
    by_index = dict(zip(long, labels))
    for i, v in enumerate(vectors):
        if i in by_index:
            raw.append(int(by_index[i]))
        elif v is not None:
            raw.append(int(np.argmax(centroids @ v)))
        else:
            raw.append(raw[-1] if raw else -1)
    first = next((c for c in raw if c >= 0), 0)
    raw = [first if c < 0 else c for c in raw]
    order = {c: n for n, c in enumerate(dict.fromkeys(raw))}   # renumber by first appearance
    return [order[c] for c in raw]


def assign_speakers(audio: np.ndarray, sentences: list[Sentence], num_speakers: int | None = None) -> None:
    """Fill in ``speaker`` ("Speaker 1", "Speaker 2" ...) on every sentence."""
    if not sentences:
        return
    extractor = _voice_model()
    vectors = [_fingerprint(extractor, audio, s) for s in sentences]
    labels = cluster_voices(vectors, [s.end - s.start for s in sentences], num_speakers)
    for s, c in zip(sentences, labels):
        s.speaker = f"Speaker {c + 1}"


# ---------------------------------------------------------------- output

def _hms(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def to_transcript(sentences: list[Sentence]) -> str:
    """One line per sentence: "[00:01:10] Speaker 2: text"."""
    return "\n".join(f"[{_hms(s.start)}] {s.speaker or 'Unknown'}: {s.text}" for s in sentences) + "\n"


def recording_to_transcript(path: str | Path, names: Iterable[str] = (), num_speakers: int | None = None,
                            progress: Callable[[float], None] | None = None) -> tuple[str, float]:
    """(transcript text, recording length in seconds) for an audio or video file."""
    audio = load_audio(path)
    sentences = transcribe(audio, names, progress)
    if not sentences:
        raise RuntimeError("No speech was recognised in this recording.")
    assign_speakers(audio, sentences, num_speakers)
    return to_transcript(sentences), audio.size / SAMPLE_RATE


if __name__ == "__main__":
    import argparse
    import time

    ap = argparse.ArgumentParser(description="Transcribe a recording with speaker numbers.")
    ap.add_argument("file")
    ap.add_argument("--speakers", type=int, default=None, help="number of speakers, if known")
    ap.add_argument("--names", default="", help="comma-separated names to help Whisper spell them")
    args = ap.parse_args()
    t0 = time.time()
    text, seconds = recording_to_transcript(args.file, [n.strip() for n in args.names.split(",")], args.speakers)
    print(text)
    print(f"{seconds:.0f} s of audio in {time.time() - t0:.0f} s ({settings.whisper_model}, {THREADS} threads)")
