import pandas as pd

from meetops_ml.transformer import add_context


def test_previous_line_from_lookup_or_file_order():
    df = pd.DataFrame({
        "segment_id": ["m.0", "m.1", "m.2", "x.5"],
        "meeting_id": ["m", "m", "m", "x"],
        "speaker": ["A", "B", "B", "C"],
        "text": ["Can you send it by Friday?", "Yes, I'll do it.", "Thanks.", "Fine."],
        "label": ["Task", "Task", "Other", "Other"],
    })
    out = add_context(df, {"x.5": ("We go with rubber.", "C")})
    assert out.context.tolist() == ["", "other speaker: Can you send it by Friday?",
                                    "same speaker: Yes, I'll do it.", "same speaker: We go with rubber."]
