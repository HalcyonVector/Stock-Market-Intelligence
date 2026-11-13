"""Device transfer codes, mutual fund maths, broker holdings, delayed NSE quotes."""
import asyncio
import json
from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.adapters import history_store
from app.adapters.base import Quote
from app.adapters.registry import providers
from app.main import app
from app.services import holdings, mutual_funds


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ------------------------------------------------------------ transfer
class _Redis:
    def __init__(self):
        self.kv = {}

    async def set(self, k, v, ex=None):
        self.kv[k] = v

    async def getdel(self, k):
        return self.kv.pop(k, None)

    async def incr(self, k):
        self.kv[k] = int(self.kv.get(k, 0)) + 1
        return self.kv[k]

    async def expire(self, k, s):
        return True


def test_transfer_code_moves_identity_once(monkeypatch):
    from app.api.routes import auth

    r = _Redis()
    monkeypatch.setattr(auth, "get_redis", lambda: r)
    c = TestClient(app)
    code = c.post("/api/v1/auth/transfer", headers={"X-User-Id": "anon-phone"}).json()["code"]
    assert len(code) == 9 and code[4] == "-"

    got = c.post("/api/v1/auth/transfer/redeem", json={"code": code.lower().replace("-", " ")})
    assert got.status_code == 200 and got.json()["user_id"] == "anon-phone"
    # One use only.
    assert c.post("/api/v1/auth/transfer/redeem", json={"code": code}).status_code == 404


def test_transfer_redeem_attempts_are_capped(monkeypatch):
    from app.api.routes import auth

    r = _Redis()
    monkeypatch.setattr(auth, "get_redis", lambda: r)
    monkeypatch.setattr(auth, "MAX_REDEEM_TRIES", 3)
    c = TestClient(app)
    codes = [c.post("/api/v1/auth/transfer/redeem", json={"code": "AAAA-AAAA"}).status_code for _ in range(4)]
    assert codes == [404, 404, 404, 429]


# ------------------------------------------------------------ mutual funds
def _series(start: date, days: int, daily: float):
    nav, out = 100.0, []
    for i in range(days):
        out.append((start + timedelta(days=i), nav))
        nav *= 1 + daily
    return out


def test_trailing_returns_cagr():
    s = _series(date(2020, 1, 1), 365 * 4 + 1, 0.0002)  # ~7.6%/yr
    r = mutual_funds.trailing_returns(s)
    assert 7.0 < r["1y"] < 8.0 and 7.0 < r["3y"] < 8.0
    assert r["5y"] is None  # not enough history


def test_parse_skips_bad_rows_and_sorts():
    rows = [{"date": "02-01-2024", "nav": "11"}, {"date": "bad", "nav": "1"},
            {"date": "01-01-2024", "nav": "10"}, {"date": "03-01-2024", "nav": "N.A."}]
    assert mutual_funds._parse(rows) == [(date(2024, 1, 1), 10.0), (date(2024, 1, 2), 11.0)]


# ------------------------------------------------------------ holdings
def test_normalize_broker_symbols():
    assert holdings.normalize("RELIANCE", "IN") == "RELIANCE"          # tracked: no suffix
    assert holdings.normalize("ZZTEST-EQ", "IN") == "ZZTEST.NS"
    assert holdings.normalize("NSE:IRCTC", "IN") == "IRCTC.NS"
    assert holdings.normalize("L&TFH", "IN") == "L&TFH.NS"
    assert holdings.normalize("aapl", "US") == "AAPL"
    assert holdings.normalize("not a ticker!!", "IN") is None


class _Market:
    async def quotes(self, syms):
        px = {"RELIANCE": 1400.0, "TCS": 4000.0}
        return [Quote(symbol=s, price=px[s], change=0, change_pct=1.0, volume=1, avg_volume=1,
                      market_cap=None, currency="INR", market="IN", ts=datetime.now(timezone.utc), source="eod")
                for s in syms if s in px]


def test_value_merges_duplicates_and_flags_unpriced(monkeypatch):
    monkeypatch.setattr(providers, "market", _Market())

    async def no_extra(s):
        return None
    monkeypatch.setattr(holdings, "register_extra", no_extra)
    out = _run(holdings.value([
        {"symbol": "RELIANCE", "quantity": 5, "avg_cost": 1200},
        {"symbol": "RELIANCE-EQ", "quantity": 5, "avg_cost": 1400},
        {"symbol": "TCS", "quantity": 1, "avg_cost": 3500},
        {"symbol": "NEWIPO", "quantity": 3, "avg_cost": 100},
        {"symbol": "", "quantity": 1},
    ], "IN"))
    rows = {r["symbol"]: r for r in out["rows"]}
    assert rows["RELIANCE"]["quantity"] == 10 and rows["RELIANCE"]["avg_cost"] == 1300
    assert rows["RELIANCE"]["value"] == 14000 and rows["RELIANCE"]["pnl"] == 1000
    assert rows["NEWIPO.NS"]["price"] is None
    t = out["totals"]["INR"]
    assert t["value"] == 18000 and t["priced"] == 2 and t["unpriced"] == 1
    assert round(sum(r["weight_pct"] or 0 for r in out["rows"])) == 100
    assert out["skipped"] == [""]


# ------------------------------------------------------------ delayed quotes
def test_midday_snapshot_is_a_delayed_quote_not_a_close():
    today = datetime.now(timezone.utc).date()
    raw = json.dumps({
        "updated": datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).replace(hour=6).isoformat(),
        "bars": [[(today - timedelta(days=1)).isoformat(), 1, 1, 1, 100.0, 10],
                 [today.isoformat(), 1, 1, 1, 102.0, 4]],
    })
    q = history_store.latest_quote(raw, "RELIANCE")
    assert q.source == "delayed" and q.price == 102.0 and q.ts.hour == 6
    # Written after the NSE close: a normal end-of-day quote.
    late = json.loads(raw)
    late["updated"] = late["updated"].replace("T06:", "T11:")
    assert history_store.latest_quote(json.dumps(late), "RELIANCE").source == "eod"
