"""
Model feedback: what people taught the classifier, and which model versions are in use.

Every confirm, reject or label correction is stored in ``label_feedback`` (services/review.py).
This page shows those rows with the same safety steps as the training export (export_feedback.py),
so a person can see which corrections will be used for the next training run, and download them.
"""

import io
import json
from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from meetops_ml.data import MODELS_ROOT, TRANSFORMER_DIR, MODEL_FILENAME

from .. import export_feedback, models
from ..config import settings
from ..database import get_db
from ..security import current_user
from ..services import audit
from ..services.classifier import get_classifier

router = APIRouter(prefix="/feedback", tags=["feedback"])

RECENT = 200


def _kind(fb: models.LabelFeedback, item_kinds: set[str]) -> str:
    if fb.predicted == fb.corrected:
        return "confirmed"
    if fb.corrected == "Other" and fb.predicted in item_kinds:
        return "rejected"
    return "added"   # a person added a task, decision or risk from the line (or, before, relabelled it)


def _model_versions() -> list[dict]:
    """Trained versions under ml/models/, newest first, with the one the backend uses marked."""
    try:
        in_use = getattr(get_classifier(), "model_dir", None)
    except FileNotFoundError:
        in_use = None
    if settings.model_dir:
        in_use = settings.model_dir
    in_use = in_use.resolve() if in_use else None
    out = []
    for p in MODELS_ROOT.glob("v*"):
        if not p.name[1:].isdigit():
            continue
        transformer = (p / TRANSFORMER_DIR / "config.json").exists()
        if not transformer and not (p / MODEL_FILENAME).exists():
            continue
        meta = {}
        if (p / "metadata.json").exists():
            meta = json.loads((p / "metadata.json").read_text(encoding="utf-8"))
        rejected = p / "REJECTED"
        status = "in use" if in_use and p.resolve() == in_use else "rejected" if rejected.exists() else "not used"
        kind = {"logreg": "TF-IDF + LogReg", "linear_svm": "TF-IDF + LinearSVM"}.get(meta.get("model"), "TF-IDF")
        out.append({"version": p.name, "model": "DistilBERT" if transformer else kind,
                    "trainRows": meta.get("train_rows"), "trainFiles": meta.get("train_file"),
                    "status": status, "note": rejected.read_text(encoding="utf-8").strip() if rejected.exists() else None})
    return sorted(out, key=lambda v: -int(v["version"][1:]))


@router.get("")
def feedback(db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """Counts, the latest corrections with their training status, and the model versions."""
    result = export_feedback.collect(db)
    rows = db.scalars(select(models.LabelFeedback).order_by(models.LabelFeedback.created_at.desc(),
                                                            models.LabelFeedback.id.desc()).limit(RECENT)).all()
    users = {u.id: u.name for u in db.scalars(select(models.User)).all()}
    seg_ids = {fb.segment_id for fb in rows if fb.segment_id}
    segs = {s.id: s for s in db.scalars(select(models.Segment).where(models.Segment.id.in_(seg_ids))).all()} \
        if seg_ids else {}
    items = []
    for fb in rows:
        seg = segs.get(fb.segment_id)
        items.append({"id": fb.id, "text": fb.text, "predicted": fb.predicted, "corrected": fb.corrected,
                      "action": _kind(fb, {"Task", "Decision", "Risk"}), "by": users.get(fb.user_id),
                      "at": fb.created_at.isoformat() if fb.created_at else None,
                      "meetingId": seg.meeting_id if seg else None,
                      "meetingTitle": seg.meeting.title if seg else None,
                      "trainingStatus": result["status"].get(fb.id, "replaced")})
    s = result["stats"]
    all_rows = db.scalars(select(models.LabelFeedback)).all()
    return {
        "totals": {"all": s["total"], "confirmed": sum(fb.predicted == fb.corrected for fb in all_rows),
                   "changed": sum(fb.predicted != fb.corrected for fb in all_rows),
                   "ready": s["exported"], "inTestSet": s["in_test_set"],
                   "alreadyInTraining": s["already_in_training"], "replaced": s["total"] - s["unique"]},
        "readyByLabel": dict(result["labels"]),
        "items": items,
        "models": _model_versions(),
    }


@router.get("/export.csv")
def export_csv(db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """The corrections that are ready for training, in the layout of the labelled datasets."""
    result = export_feedback.collect(db)
    buf = io.StringIO()
    export_feedback.write_csv(result["rows"], buf)
    audit.log(db, "feedback", 0, "exported", f"{len(result['rows'])} rows for training", actor_id=user.id)
    db.commit()
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="meetops-feedback-{date.today()}.csv"'})
