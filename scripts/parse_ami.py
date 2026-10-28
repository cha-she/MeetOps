"""
Parse the AMI Meeting Corpus manual annotations (NXT XML) into a flat
utterance table for MeetOps.

Input : the unzipped `ami_public_manual_1.6.2` folder
Output: ml/data/processed/ami_utterances.csv  (one row per utterance)
        ml/data/processed/ami_meetings.csv    (one row per meeting)

How the corpus is organised
---------------------------
Each meeting (e.g. ES2002a) has four speakers, A-D. For each speaker the
corpus stores separate XML "layers" that point at each other by word id:

    words/ES2002a.A.words.xml         every word with start/end time
    segments/ES2002a.A.segments.xml   groups of words = one speaker turn
    dialogueActs/ES2002a.A.dialog-act.xml
                                      groups of words = one dialogue act,
                                      typed (inform, suggest, offer, ...)
    abstractive/ES2002a.abssumm.xml   human summary with <actions>,
                                      <decisions>, <problems> sections
    extractive/ES2002a.summlink.xml   links summary sentences to the
                                      dialogue acts that support them

A dialogue act is the natural "utterance" unit for classification, so this
script uses dialogue acts when they exist and falls back to segments for the
few meetings without dialogue-act annotation.

Usage
-----
    python scripts/parse_ami.py --corpus ml/data/raw/ami_public_manual_1.6.2
    python scripts/parse_ami.py --corpus ... --meetings ES2002a ES2002b
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

NITE = "{http://nite.sourceforge.net/}"

# Dialogue-act glosses that carry no content for our purposes.
NOISE_DA_TYPES = {"Backchannel", "Stall", "Fragment"}


# --------------------------------------------------------------------------- #
# Helpers for NXT href ranges
# --------------------------------------------------------------------------- #

_HREF_RE = re.compile(r"^(?P<file>[^#]+)#id\((?P<first>[^)]+)\)(?:\.\.id\((?P<last>[^)]+)\))?$")


def parse_href(href: str) -> tuple[str, str, str]:
    """Split 'file.xml#id(a)..id(b)' into (file, a, b). Single ids give a == b."""
    m = _HREF_RE.match(href.strip())
    if not m:
        raise ValueError(f"Unrecognised href: {href!r}")
    first = m.group("first")
    last = m.group("last") or first
    return m.group("file"), first, last


def id_index(nite_id: str) -> int:
    """Numeric suffix of an id such as 'ES2002a.A.words123' -> 123."""
    m = re.search(r"(\d+)$", nite_id)
    if not m:
        raise ValueError(f"Id without numeric suffix: {nite_id!r}")
    return int(m.group(1))


# --------------------------------------------------------------------------- #
# Word layer
# --------------------------------------------------------------------------- #

@dataclass
class Word:
    id: str
    index: int
    text: str
    start: float | None
    end: float | None
    is_punct: bool


def load_words(path: Path) -> dict[str, Word]:
    """Read a words file. Non-word tokens (laughs, gaps, disfluency marks) are skipped."""
    words: dict[str, Word] = {}
    root = ET.parse(path).getroot()
    for el in root:
        tag = el.tag.split("}")[-1]
        if tag != "w":
            continue  # vocalsound, gap, disfmarker, pause, transformerror ...
        wid = el.get(f"{NITE}id")
        text = (el.text or "").strip()
        if not wid or not text:
            continue
        words[wid] = Word(
            id=wid,
            index=id_index(wid),
            text=text,
            start=_float(el.get("starttime")),
            end=_float(el.get("endtime")),
            is_punct=el.get("punc") == "true",
        )
    return words


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except ValueError:
        return None


def words_in_range(words: dict[str, Word], first: str, last: str) -> list[Word]:
    lo, hi = id_index(first), id_index(last)
    if lo > hi:
        lo, hi = hi, lo
    return sorted((w for w in words.values() if lo <= w.index <= hi), key=lambda w: w.index)


def join_words(ws: list[Word]) -> str:
    """Join tokens into readable text: no space before punctuation, collapse whitespace."""
    out: list[str] = []
    for w in ws:
        if w.is_punct and out:
            out[-1] = out[-1] + w.text
        else:
            out.append(w.text)
    text = " ".join(out)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# --------------------------------------------------------------------------- #
# Utterance units: dialogue acts (preferred) or segments
# --------------------------------------------------------------------------- #

@dataclass
class Utterance:
    id: str
    meeting_id: str
    speaker: str
    start: float | None
    end: float | None
    text: str
    n_words: int
    unit: str                      # "dialogue_act" or "segment"
    da_type: str = ""              # gloss such as "Inform", "Suggest"
    summary_sections: set[str] = field(default_factory=set)  # abstract/actions/decisions/problems
    in_extractive_summary: bool = False


def load_da_types(corpus: Path) -> dict[str, str]:
    """Map 'ami_da_4' -> 'Inform' from ontologies/da-types.xml."""
    path = corpus / "ontologies" / "da-types.xml"
    if not path.exists():
        return {}
    types: dict[str, str] = {}
    for el in ET.parse(path).getroot().iter():
        tid = el.get(f"{NITE}id")
        gloss = el.get("gloss")
        if tid and gloss:
            types[tid] = gloss
    return types


def load_dialogue_acts(path: Path, words: dict[str, Word], meeting_id: str, speaker: str,
                       da_types: dict[str, str]) -> list[Utterance]:
    out: list[Utterance] = []
    root = ET.parse(path).getroot()
    for dact in root.iter(f"{NITE}child" if False else "dact"):
        did = dact.get(f"{NITE}id")
        if not did:
            continue
        da_type = ""
        ws: list[Word] = []
        for child in dact:
            tag = child.tag.split("}")[-1]
            href = child.get("href", "")
            if tag == "pointer" and child.get("role") == "da-aspect":
                _, tid, _ = parse_href(href)
                da_type = da_types.get(tid, tid)
            elif tag == "child" and href:
                _, first, last = parse_href(href)
                ws.extend(words_in_range(words, first, last))
        if not ws:
            continue
        out.append(_make_utterance(did, meeting_id, speaker, ws, "dialogue_act", da_type))
    return out


def load_segments(path: Path, words: dict[str, Word], meeting_id: str, speaker: str) -> list[Utterance]:
    out: list[Utterance] = []
    root = ET.parse(path).getroot()
    for seg in root.iter("segment"):
        sid = seg.get(f"{NITE}id")
        if not sid:
            continue
        ws: list[Word] = []
        for child in seg:
            if child.tag.split("}")[-1] == "child" and child.get("href"):
                _, first, last = parse_href(child.get("href", ""))
                ws.extend(words_in_range(words, first, last))
        if not ws:
            continue
        out.append(_make_utterance(sid, meeting_id, speaker, ws, "segment"))
    return out


def _make_utterance(uid: str, meeting_id: str, speaker: str, ws: list[Word], unit: str,
                    da_type: str = "") -> Utterance:
    starts = [w.start for w in ws if w.start is not None]
    ends = [w.end for w in ws if w.end is not None]
    return Utterance(
        id=uid,
        meeting_id=meeting_id,
        speaker=speaker,
        start=min(starts) if starts else None,
        end=max(ends) if ends else None,
        text=join_words(ws),
        n_words=sum(1 for w in ws if not w.is_punct),
        unit=unit,
        da_type=da_type,
    )


# --------------------------------------------------------------------------- #
# Summary links (weak labels)
# --------------------------------------------------------------------------- #

def load_summary_sections(corpus: Path, meeting_id: str) -> dict[str, str]:
    """Map abstractive sentence id -> section name (abstract/actions/decisions/problems)."""
    path = corpus / "abstractive" / f"{meeting_id}.abssumm.xml"
    if not path.exists():
        return {}
    sections: dict[str, str] = {}
    root = ET.parse(path).getroot()
    for section in root:
        name = section.tag.split("}")[-1].lower()
        for sent in section.iter("sentence"):
            sid = sent.get(f"{NITE}id")
            if sid:
                sections[sid] = name
    return sections


def apply_summary_links(corpus: Path, meeting_id: str, utts: dict[str, Utterance]) -> int:
    """Mark utterances linked to abstractive summary sentences. Returns number of links applied."""
    sections = load_summary_sections(corpus, meeting_id)
    path = corpus / "extractive" / f"{meeting_id}.summlink.xml"
    if not path.exists() or not sections:
        return 0
    applied = 0
    root = ET.parse(path).getroot()
    for link in root.iter("summlink"):
        da_id = sent_id = None
        for ptr in link:
            if ptr.tag.split("}")[-1] != "pointer":
                continue
            role = ptr.get("role")
            _, ref, _ = parse_href(ptr.get("href", ""))
            if role == "extractive":
                da_id = ref
            elif role == "abstractive":
                sent_id = ref
        if da_id in utts and sent_id in sections:
            utts[da_id].summary_sections.add(sections[sent_id])
            applied += 1
    return applied


def apply_extractive_summary(corpus: Path, meeting_id: str, utts: dict[str, Utterance]) -> None:
    path = corpus / "extractive" / f"{meeting_id}.extsumm.xml"
    if not path.exists():
        return
    root = ET.parse(path).getroot()
    for child in root.iter():
        if child.tag.split("}")[-1] == "child" and child.get("href"):
            _, first, last = parse_href(child.get("href", ""))
            # A child may reference one dialogue act or a range such as
            # id(...dharshi.16)..id(...dharshi.17); mark every act in the range.
            prefix = re.sub(r"\d+$", "", first)
            lo, hi = sorted((id_index(first), id_index(last)))
            for uid, u in utts.items():
                if uid.startswith(prefix) and lo <= id_index(uid) <= hi:
                    u.in_extractive_summary = True


# --------------------------------------------------------------------------- #
# Meeting metadata
# --------------------------------------------------------------------------- #

def load_meeting_metadata(corpus: Path) -> dict[str, dict]:
    """Meeting type and speaker roles from corpusResources/meetings.xml."""
    path = corpus / "corpusResources" / "meetings.xml"
    meta: dict[str, dict] = {}
    if not path.exists():
        return meta
    root = ET.parse(path).getroot()
    for meeting in root.iter("meeting"):
        mid = meeting.get("observation") or meeting.get(f"{NITE}id")
        if not mid:
            continue
        roles: dict[str, str] = {}
        for spk in meeting.iter("speaker"):
            agent = spk.get("nxt_agent")
            if agent:
                roles[agent] = spk.get("role") or spk.get("global_name") or ""
        meta[mid] = {"type": meeting.get("type", ""), "roles": roles}
    return meta


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def discover_meetings(corpus: Path) -> list[str]:
    ids = {p.name.split(".")[0] for p in (corpus / "words").glob("*.words.xml")}
    return sorted(ids)


def parse_meeting(corpus: Path, meeting_id: str, da_types: dict[str, str],
                  meta: dict[str, dict]) -> list[Utterance]:
    utts: dict[str, Utterance] = {}
    roles = meta.get(meeting_id, {}).get("roles", {})
    for words_path in sorted((corpus / "words").glob(f"{meeting_id}.*.words.xml")):
        speaker = words_path.name.split(".")[1]
        words = load_words(words_path)
        da_path = corpus / "dialogueActs" / f"{meeting_id}.{speaker}.dialog-act.xml"
        seg_path = corpus / "segments" / f"{meeting_id}.{speaker}.segments.xml"
        if da_path.exists():
            units = load_dialogue_acts(da_path, words, meeting_id, speaker, da_types)
        elif seg_path.exists():
            units = load_segments(seg_path, words, meeting_id, speaker)
        else:
            continue
        for u in units:
            u.speaker = f"{speaker}" if not roles.get(speaker) else f"{speaker} ({roles[speaker]})"
            utts[u.id] = u
    apply_summary_links(corpus, meeting_id, utts)
    apply_extractive_summary(corpus, meeting_id, utts)
    return sorted(utts.values(), key=lambda u: (u.start if u.start is not None else 1e12, u.id))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--corpus", required=True, type=Path, help="Path to the unzipped AMI manual annotations")
    ap.add_argument("--out", type=Path, default=Path("ml/data/processed"), help="Output folder")
    ap.add_argument("--meetings", nargs="*", help="Only these meeting ids (default: all)")
    ap.add_argument("--min-words", type=int, default=1, help="Drop utterances shorter than this")
    args = ap.parse_args(argv)

    corpus: Path = args.corpus
    if not (corpus / "words").exists():
        print(f"error: {corpus} does not look like the AMI corpus (no 'words' folder)", file=sys.stderr)
        return 1

    da_types = load_da_types(corpus)
    meta = load_meeting_metadata(corpus)
    meetings = args.meetings or discover_meetings(corpus)

    args.out.mkdir(parents=True, exist_ok=True)
    utt_path = args.out / "ami_utterances.csv"
    meet_path = args.out / "ami_meetings.csv"

    total = 0
    with utt_path.open("w", newline="", encoding="utf-8") as f_utt, \
         meet_path.open("w", newline="", encoding="utf-8") as f_meet:
        utt_writer = csv.writer(f_utt)
        utt_writer.writerow([
            "segment_id", "meeting_id", "speaker", "start_time", "end_time", "duration_sec",
            "text", "n_words", "unit", "da_type", "is_noise",
            "summary_sections", "in_extractive_summary",
        ])
        meet_writer = csv.writer(f_meet)
        meet_writer.writerow(["meeting_id", "meeting_type", "n_utterances", "n_speakers",
                              "duration_sec", "n_action_links", "n_decision_links", "n_problem_links"])

        for mid in meetings:
            utts = parse_meeting(corpus, mid, da_types, meta)
            utts = [u for u in utts if u.n_words >= args.min_words]
            if not utts:
                print(f"  {mid}: no utterances found, skipped")
                continue
            for u in utts:
                utt_writer.writerow([
                    u.id, u.meeting_id, u.speaker,
                    f"{u.start:.2f}" if u.start is not None else "",
                    f"{u.end:.2f}" if u.end is not None else "",
                    f"{u.end - u.start:.2f}" if u.start is not None and u.end is not None else "",
                    u.text, u.n_words, u.unit, u.da_type,
                    int(u.da_type in NOISE_DA_TYPES),
                    "|".join(sorted(u.summary_sections)),
                    int(u.in_extractive_summary),
                ])
            ends = [u.end for u in utts if u.end is not None]
            count = lambda s: sum(1 for u in utts if s in u.summary_sections)  # noqa: E731
            meet_writer.writerow([
                mid, meta.get(mid, {}).get("type", ""), len(utts),
                len({u.speaker for u in utts}),
                f"{max(ends):.1f}" if ends else "",
                count("actions"), count("decisions"), count("problems"),
            ])
            total += len(utts)
            print(f"  {mid}: {len(utts):5d} utterances  "
                  f"(actions={count('actions')}, decisions={count('decisions')}, problems={count('problems')})")

    print(f"\nWrote {total} utterances from {len(meetings)} meetings to {utt_path}")
    print(f"Wrote meeting summary to {meet_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
