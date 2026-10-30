from meetops_ml.rules import apply_rules


def r(text, label):
    return apply_rules(text, label)


def test_request_with_follow_up_becomes_task():
    out = r("Kasun, can you connect the dashboard to the live API this week?", "Other")
    assert out.label == "Task" and out.rule == "request"


def test_in_meeting_request_stays_other():
    assert r("Can you go back one slide?", "Other").label == "Other"


def test_agenda_and_thanks_are_demoted():
    assert r("Two things on the agenda today: the backend API and the demo.", "Task").rule == "meeting_management"
    assert r("Okay, thank you Peter.", "Task").label == "Other"


def test_open_question_is_not_a_decision():
    assert r("Have we decided that we're gonna use this screen?", "Decision").label == "Other"


def test_agreement_and_concern_promotions():
    assert r("Right, so dark mode moves to 2.4 and we ship 2.3 without it.", "Other").label == "Decision"
    assert r("I'm worried the model will miss indirect risks.", "Other").label == "Risk"
    assert r("I'm not sure how to draw a dog.", "Other").label == "Other"      # hesitation, not a risk


def test_hedged_and_negated_cues_are_ignored():
    assert r("Maybe we should go with the rubber buttons.", "Other").label == "Other"
    assert r("It shouldn't be too complicated.", "Other").label == "Other"


def test_model_label_kept_when_no_rule_applies():
    out = r("The remote has three buttons on the front.", "Other")
    assert out.label == "Other" and out.rule is None
