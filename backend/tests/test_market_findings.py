"""The Market Study's lag analysis, on synthetic prices (no network)."""
import numpy as np
import pandas as pd

from scripts.market_findings import lag_study


def _frames(n: int = 200, seed: int = 0, gap_beta: float = 0.5):
    """US sessions on day t; the Nifty trades the next calendar day. Its
    opening gap follows the US move; the rest of its day is noise."""
    rng = np.random.default_rng(seed)
    us_dates = pd.bdate_range("2025-01-06", periods=n)
    spy_ret = rng.normal(0, 1, n)
    spy = pd.Series(100 * np.cumprod(1 + spy_ret / 100), index=us_dates)
    in_dates = us_dates + pd.Timedelta(days=1)  # next morning
    gap = gap_beta * np.r_[0, spy_ret[1:]] + rng.normal(0, 0.2, n)
    intra = rng.normal(0, 1, n)
    closes, opens, prev = [], [], 100.0
    for g, i in zip(gap, intra):
        o = prev * (1 + g / 100)
        c = o * (1 + i / 100)
        opens.append(o)
        closes.append(c)
        prev = c
    nifty = pd.DataFrame({"Open": opens, "Close": closes}, index=in_dates)
    return spy, nifty


def test_link_sits_in_the_opening_gap():
    spy, nifty = _frames()
    out = lag_study(spy, nifty)
    assert out is not None
    assert out["gap_corr"] > 0.8
    assert abs(out["intraday_corr"]) < 0.2
    assert 0.3 < out["beta"] < 0.7
    assert out["gap_share_pct"] > 80
    assert out["sessions"] >= 190


def test_quarters_cover_the_window():
    spy, nifty = _frames()
    out = lag_study(spy, nifty)
    assert out["quarters"], "expected per-quarter correlations"
    assert all(q["sessions"] >= 30 for q in out["quarters"])
    assert sum(q["sessions"] for q in out["quarters"]) <= out["sessions"]


def test_too_little_overlap_returns_none():
    spy, nifty = _frames(n=40)
    assert lag_study(spy, nifty) is None


def _yf_frame(tickers: list[str], dates, skip: set[str] = frozenset()) -> pd.DataFrame:
    """A yf.download-style frame: (ticker, field) columns. Tickers in
    ``skip`` come back all-NaN, as a thread that hit a locked cache does."""
    cols = {}
    for i, t in enumerate(tickers):
        cols[(t, "Close")] = np.nan if t in skip else np.arange(len(dates)) + 10.0 * (i + 1)
    return pd.DataFrame(cols, index=dates)


def test_download_closes_retries_tickers_the_batch_lost():
    from scripts.market_findings import download_closes

    dates = pd.bdate_range("2026-01-05", periods=5)
    calls = []

    def fake(tickers, threads, **_):
        calls.append((tickers, threads))
        if isinstance(tickers, list):
            return _yf_frame(tickers, dates, skip={"C"})  # batch loses Citigroup
        return pd.DataFrame({"Close": np.arange(5) + 1.0}, index=dates)  # single fetch works

    out = download_closes({"AAPL": "AAPL", "C": "C", "TCS": "TCS.NS"}, "1y", download=fake)
    assert list(out.columns) == ["AAPL", "C", "TCS"]
    assert out["C"].tolist() == [1.0, 2.0, 3.0, 4.0, 5.0]
    assert calls[1] == ("C", False)  # retried alone, without threads
    assert len(calls) == 2


def test_download_closes_gives_up_after_retries():
    from scripts.market_findings import download_closes

    dates = pd.bdate_range("2026-01-05", periods=5)
    calls = []

    def fake(tickers, threads, **_):
        calls.append(tickers)
        if isinstance(tickers, list):
            return _yf_frame(tickers, dates, skip={"DELISTED"})
        raise RuntimeError("database is locked")

    out = download_closes({"AAPL": "AAPL", "DELISTED": "DELISTED"}, "1y", retries=2, download=fake)
    assert list(out.columns) == ["AAPL"]
    assert calls[1:] == ["DELISTED", "DELISTED"]
