import joblib

from meetops_ml.data import LABELS
from meetops_ml.models import build_models
from meetops_ml.predict import Classifier

TEXTS = [
    "I'll send the report by Friday.", "Can you check the battery before Monday?",
    "We need to update the quote this week.", "Let's make sure we test it tomorrow.",
    "So we go with the rubber buttons.", "Agreed, no LCD screen then.",
    "Okay, we'll use yellow and black.", "Final answer is the kinetic battery.",
    "The problem is the battery won't last.", "I'm worried the supplier is late.",
    "That might be too expensive for us.", "If this slips the whole schedule slips.",
    "Yeah, that makes sense.", "Can you go back one slide?",
    "The remote has three buttons.", "Good morning everyone.",
]
Y = ["Task"] * 4 + ["Decision"] * 4 + ["Risk"] * 4 + ["Other"] * 4


def test_build_models_returns_four_pipelines():
    models = build_models()
    assert set(models) == {"logreg", "linear_svm", "naive_bayes", "random_forest"}
    for pipe in models.values():
        assert [name for name, _ in pipe.steps] == ["clean", "features", "clf"]


def test_pipelines_fit_predict_and_pickle(tmp_path):
    for name, pipe in build_models("full").items():
        pipe.fit(TEXTS, Y)
        pred = pipe.predict(["I will finish it by Friday"])
        assert pred[0] in LABELS, name
        path = tmp_path / f"{name}.joblib"
        joblib.dump(pipe, path)
        clf = Classifier(joblib.load(path))
        out = clf.predict(["um the the T_V_ might not work"])
        assert out[0].label in LABELS and 0 < out[0].confidence <= 1
