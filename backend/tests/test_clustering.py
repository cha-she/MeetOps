"""Risk themes: risks about the same thing end up in the same theme."""

from app.services.clustering import group

RISKS = [
    "The budget is too tight for the extra features.",
    "We are already over budget on the hardware.",
    "The cost of the new chips will push us over budget.",
    "Speech recognition might not work in a noisy room.",
    "The voice recognition engine is not mature enough.",
    "Users may get frustrated if speech recognition misunderstands them.",
    "The battery might not last a full week.",
    "If the battery runs out, the remote is useless.",
    "Charging the battery every few days will annoy users.",
]


def test_risks_about_the_same_thing_share_a_theme():
    themes, score = group(RISKS)
    theme_of = {i: n for n, t in enumerate(themes) for i in t.members}
    assert theme_of[0] == theme_of[1] == theme_of[2]          # budget
    assert theme_of[3] == theme_of[4] == theme_of[5]          # speech recognition
    assert theme_of[6] == theme_of[7] == theme_of[8]          # battery
    assert len({theme_of[0], theme_of[3], theme_of[6]}) == 3
    assert score is not None and all(t.keywords for t in themes)


def test_too_few_risks_give_no_themes():
    assert group(RISKS[:3]) == ([], None)
