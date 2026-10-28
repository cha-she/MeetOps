from meetops_ml.features import LEXICON_FEATURE_NAMES, build_features, lexicon_counts
from meetops_ml.preprocessing import clean_text


def test_lexicon_counts_detect_hedge_and_negation():
    m = lexicon_counts([clean_text("The battery might not last a week."),
                        clean_text("Yeah, that makes sense.")]).toarray()
    names = LEXICON_FEATURE_NAMES
    risky, plain = m[0], m[1]
    assert risky[names.index("hedge")] == 1
    assert risky[names.index("negation")] == 1
    assert risky[names.index("hedge_and_negation")] == 1
    assert plain.sum() == 0


def test_feature_sets():
    assert [n for n, _ in build_features("word").transformer_list] == ["word"]
    assert [n for n, _ in build_features("full").transformer_list] == ["word", "char", "lex"]
