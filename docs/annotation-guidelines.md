# MeetOps Annotation Guidelines

**Version 1.0 · Classification of meeting utterances into Task / Decision / Risk / Other**

These guidelines define how transcript segments from the AMI Meeting Corpus are
labelled to train and evaluate the MeetOps classifier. Consistent labelling is
the single biggest factor in model accuracy, so every rule below should be
applied the same way every time. When in doubt, follow the decision procedure
in Section 5.

## 1. Unit of annotation

One **segment** = one utterance by one speaker, as produced by the AMI
segmentation (roughly one dialogue act). Each segment receives **exactly one**
label. Do not split or merge segments during annotation; if a segment genuinely
contains two categories, apply the priority order in Section 5.

## 2. Label definitions

### Task

A segment that **assigns, accepts, or proposes a concrete piece of work** to be
done after the meeting (or later in the project), by a person or the group.

Signals: "I'll …", "Can you …", "We need to …", "Let's make sure that …",
"X should …", "by Friday", "before the next meeting".

Examples:

- "I'll take the first batch of annotations, target five hundred by the weekend."
- "Ravindu, can you lock the segment schema this week?"
- "We need to send the client the updated quote before Thursday."
- "Someone has to check whether the battery fits in the casing."

Not a Task:

- A suggestion that is only being discussed, not committed to → *Other* (or
  *Decision* if it gets agreed).
- Something done during the meeting itself ("let me write that down") → *Other*.
- A question about who is doing something, with no assignment → *Other*.

### Decision

A segment that **states or confirms an outcome the group has agreed on**: a
choice between options, an approval, a rejection, or a resolution of a
question. The decision does not need the word "decide"; agreement language is
enough.

Signals: "So we go with …", "Let's go for …", "Agreed", "Okay, we'll use …",
"Final answer is …", "We're not doing X then", "Approved".

Examples:

- "Okay, so we'll go with the rubber buttons instead of plastic."
- "Agreed, staging becomes the single demo environment."
- "So no LCD screen. We keep it simple."
- "Then it's settled, yellow and black for the casing."

Not a Decision:

- A proposal awaiting agreement ("What if we used rubber?") → *Other*.
- A personal opinion ("I like the yellow one") → *Other*.
- Agreement that also assigns work ("Agreed, and Kasun will build it") → see
  priority rule in Section 5.

### Risk

A segment that **raises a concern, problem, blocker, uncertainty, or possible
negative consequence** for the project, product, schedule, budget, or quality.
It may describe an existing problem or a potential future one.

Signals: "The problem is …", "I'm worried that …", "If … then we'll miss …",
"That might not work because …", "We don't have enough …", "The risk is …",
"that could be expensive / too late / unsafe".

Examples:

- "If annotation slips, the whole training timeline slips with it."
- "The problem is the battery won't last a week on that chip."
- "I'm not sure the supplier can deliver in time."
- "Cross-talk is where the transcription starts making things up."

Not a Risk:

- A general negative opinion without a project consequence ("that colour is
  ugly") → *Other*.
- A problem that is immediately resolved in the same segment with a decision →
  *Decision* (priority rule).

### Other

Everything else: greetings, small talk, backchannels ("yeah", "okay", "mm-hmm"),
clarifying questions, explanations, information sharing, meeting management
("let's move on to the next slide"), opinions without commitment, and
fragments.

Examples:

- "Okay, let's talk scope for Sprint 7."
- "Yeah, that makes sense."
- "The remote has three buttons on the front."
- "Can you go back one slide?"

## 3. Metadata to capture during annotation (optional, for extraction work)

When a segment is labelled **Task**, also mark, if present in the text:

- **OWNER** — the person responsible (a name, "I", "you", "we", or a role).
- **DEADLINE** — the time expression ("by Friday", "next week", "end of month").

When a segment is labelled **Decision**, mark **DECIDED_BY** if the speaker or a
named person explicitly makes the decision.

These spans train and evaluate the information extraction module. They do not
change the segment's category label.

## 4. Handling difficult cases

| Situation | Rule |
|-----------|------|
| Segment is a backchannel or fragment under 3 words | Other |
| Speaker proposes work for *themselves* ("I could do that") and nobody objects | Task |
| Speaker proposes work for *someone else* as a question ("Could you …?") | Task |
| Group discusses an option but does not settle it | Other |
| "Maybe we should …" with no agreement | Other |
| "Let's …" that commits the group to an action | Task |
| "Let's …" that settles a design choice | Decision |
| Problem stated and immediately resolved | Decision |
| Problem stated, resolution deferred | Risk |
| Transcription errors make the meaning unclear | Other |
| Segment contains a Task and a Decision | see priority order |

## 5. Decision procedure (apply in order)

1. Is the segment a backchannel, fragment, or unintelligible? → **Other**.
2. Does it commit someone to future work? → **Task**.
3. Does it state or confirm an agreed outcome? → **Decision**.
4. Does it raise a concern or problem? → **Risk**.
5. Otherwise → **Other**.

Priority when more than one applies: **Task > Decision > Risk > Other**. The
reasoning: an assignment is the most actionable record, so a sentence that both
agrees on something and assigns it is stored as the task (the agreement is
still visible in the transcript).

## 6. Quality control

- Annotate in sessions of at most 60 minutes to keep attention high.
- After every 300 segments, re-label 30 random earlier segments without looking
  at the original label and record agreement. Target: ≥ 85 % exact agreement
  with yourself. If lower, re-read Section 2 and re-check the disagreements.
- Keep a `notes` column for anything ambiguous; recurring doubts become new
  rows in the table in Section 4.
- Never label from the pre-label alone. Read the segment, decide, then compare.

## 7. Expected class distribution

Meeting speech is mostly discussion. In AMI data roughly 80–90 % of segments
are **Other**; Tasks, Decisions and Risks are each a few percent. This
imbalance is expected and is handled in training with class weighting and
macro-F1 evaluation. Do not try to "balance" the data by relabelling.

## 8. Dataset files

| File | Content |
|------|---------|
| `ml/data/processed/ami_utterances.csv` | All parsed utterances (unlabelled) |
| `ml/data/processed/ami_prelabels.csv` | Same, with weak pre-labels from AMI summary links and rules |
| `ml/data/labeled/train_v1.csv` | Manually verified training labels (enriched sample across meetings) |
| `ml/data/labeled/train_v2.csv` | v1 plus a Risk-focused second batch (400 rows) |
| `ml/data/labeled/test_v1.csv` | Manually verified test labels (two complete meetings, natural distribution) |

Column reference for the labelled file: `segment_id, meeting_id, speaker,
start_time, end_time, text, label, owner_span, deadline_span, notes,
annotated_at`.
