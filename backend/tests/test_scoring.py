"""Unit tests for the transparent scoring engine."""
from app.scoring.engine import ScoreInputs, all_scores, opportunity_score


def test_scores_in_range():
    i = ScoreInputs(change_pct=6, volume_ratio=3, rsi=70, return_20d=12,
                    sentiment_score=0.6, sentiment_growth=120, attention=80,
                    mention_volume=4000, inst_flow=0.5, rel_strength=8)
    scores = all_scores(i)
    assert 0 <= scores["opportunity"].value <= 100
    assert 0 <= scores["momentum"].value <= 100
    assert -100 <= scores["sentiment"].value <= 100
    assert 0 <= scores["risk"].value <= 100


def test_opportunity_explainable():
    r = opportunity_score(ScoreInputs(change_pct=5, inst_flow=0.4))
    assert r.formula and r.explanation
    assert set(r.weights) == set(r.contributions)


def test_higher_momentum_raises_opportunity():
    low = opportunity_score(ScoreInputs(change_pct=-3, return_20d=-10))
    high = opportunity_score(ScoreInputs(change_pct=8, return_20d=20, volume_ratio=3))
    assert high.value > low.value
