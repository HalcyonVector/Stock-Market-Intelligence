"""Daily history: Redis snapshot (GitHub Actions job) first, then Twelve Data."""
import asyncio
from datetime import datetime, timedelta, timezone

from app.adapters import fallback as fb
from app.adapters import history_store
from app.adapters import twelvedata_provider as td
from app.adapters.base import Candle


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _bars(n, end=None):
    end = end or datetime.now(timezone.utc)
    return [Candle(ts=end - timedelta(days=n - i), open=1, high=2, low=0.5, close=float(i), volume=10)
            for i in range(n)]


def test_encode_decode_slices_by_lookback_and_rejects_stale():
    raw = history_store.encode(_bars(300))
    got = history_store.decode(raw, 90)
    assert 85 <= len(got) <= 91 and got[-1].close == 299.0
    later = datetime.now(timezone.utc) + timedelta(days=history_store.MAX_AGE_DAYS + 1)
    assert history_store.decode(raw, 90, now=later) is None
    assert history_store.decode("not json", 90) is None


def _provider(monkeypatch, store, chain):
    monkeypatch.setattr(fb, "_build_market_chain", lambda: chain)
    p = fb.FallbackMarketProvider()

    async def get(key):
        return store.get(key)

    async def put(*a):
        return None

    monkeypatch.setattr(p, "_cache_get", get)
    monkeypatch.setattr(p, "_cache_set", put)
    return p


class _Boom:
    name = "boom"

    async def candles(self, *a):
        raise AssertionError("chain should not be called when the snapshot exists")


def test_candles_served_from_history_snapshot(monkeypatch):
    store = {history_store.KEY.format(symbol="HISTSNAP"): history_store.encode(_bars(200))}
    p = _provider(monkeypatch, store, [_Boom()])
    out = _run(p.candles("HISTSNAP", "1d", 90))
    assert out and out[-1].close == 199.0
    assert fb.market_status["last_live_source"] == "history_snapshot"


def test_candles_fall_back_to_chain_when_snapshot_missing(monkeypatch):
    class Good:
        name = "twelvedata"

        async def candles(self, *a):
            return _bars(5)

    p = _provider(monkeypatch, {}, [Good()])
    out = _run(p.candles("NOSNAP1", "1d", 90))
    assert len(out) == 5 and fb.market_status["last_live_source"] == "twelvedata"


# ------------------------------------------------------------------ Twelve Data
class _Resp:
    def __init__(self, data):
        self._d = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._d


class _Client:
    calls = []

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, params):
        _Client.calls.append(params)
        return _Resp({"status": "ok", "values": [
            {"datetime": "2026-11-03", "open": "1", "high": "2", "low": "0.5", "close": "1.5", "volume": "100"},
            {"datetime": "2026-11-04", "open": "1.5", "high": "2.5", "low": "1", "close": "2", "volume": "200"},
        ]})


def test_twelvedata_parses_series_and_skips_nse(monkeypatch):
    monkeypatch.setattr(td.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(td, "_budget", td._Budget())
    p = td.TwelveDataMarketProvider()
    out = _run(p.candles("AAPL", "1d", 365))
    assert [c.close for c in out] == [1.5, 2.0] and out[-1].volume == 200
    assert _Client.calls[-1]["interval"] == "1day" and _Client.calls[-1]["outputsize"] >= 250

    for sym in ("RELIANCE", "TCS.NS"):
        try:
            _run(p.candles(sym, "1d", 90))
        except ValueError as e:
            assert "NSE" in str(e)
        else:
            raise AssertionError("NSE symbol should be skipped")


def test_twelvedata_daily_budget(monkeypatch):
    b = td._Budget()
    monkeypatch.setattr(td, "PER_DAY", 2)
    monkeypatch.setattr(td, "PER_MINUTE", 100)
    _run(b.take())
    _run(b.take())
    try:
        _run(b.take())
    except RuntimeError as e:
        assert "budget" in str(e)
    else:
        raise AssertionError("expected the daily budget to stop requests")


# ------------------------------------------------------- end-of-day quotes
def _snap(closes, vols=None):
    end = datetime.now(timezone.utc)
    vols = vols or [100] * len(closes)
    bars = [Candle(ts=end - timedelta(days=len(closes) - i), open=c, high=c, low=c, close=c, volume=v)
            for i, (c, v) in enumerate(zip(closes, vols))]
    return history_store.encode(bars)


def test_latest_quote_from_history():
    q = history_store.latest_quote(_snap([100.0] * 20 + [100.0, 110.0], [100] * 21 + [300]), "RELIANCE")
    assert q.price == 110.0 and q.change_pct == 10.0
    assert q.volume == 300 and q.avg_volume == 100
    assert q.currency == "INR" and q.market == "IN"
    assert q.ts.hour == 0                              # bar date, not a live timestamp


class _ChainMustNotRun:
    name = "finnhub"

    async def quote(self, s):
        raise AssertionError("NSE quotes should not hit US-only providers")


def test_indian_quote_uses_snapshot_and_skips_chain(monkeypatch):
    store = {history_store.KEY.format(symbol="TMPV"): _snap([290.0, 292.4])}
    p = _provider(monkeypatch, store, [_ChainMustNotRun()])
    q = _run(p.quote("TMPV"))
    assert q.price == 292.4 and q.currency == "INR"
    assert fb.market_status["last_live_source"] == "history_snapshot_eod"


def test_us_quote_falls_back_to_snapshot_before_mock(monkeypatch):
    class Down:
        name = "finnhub"

        async def quote(self, s):
            raise RuntimeError("503")

    store = {history_store.KEY.format(symbol="XYZ"): _snap([80.0, 87.63])}
    p = _provider(monkeypatch, store, [Down()])
    q = _run(p.quote("XYZ"))
    assert q.price == 87.63 and q.currency == "USD"
