"""Insider filings, analyst consensus, economic calendar, sector stats, earnings."""
import asyncio
import time
from datetime import date

from app.services import analyst_ratings, economic_calendar as econ, insider


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ------------------------------------------------------------------ insider
def test_classify_uses_sec_codes_not_share_sign():
    grant = insider.classify({"symbol": "AAPL", "name": "JANE DOE", "transactionCode": "A",
                              "change": 5000, "transactionPrice": 0, "transactionDate": "2026-11-01"})
    assert grant["kind"] == "Grant" and grant["transaction_type"] == "Other" and grant["value"] is None
    buy = insider.classify({"symbol": "AAPL", "name": "JOHN ROE", "transactionCode": "P",
                            "change": 100, "transactionPrice": 200, "transactionDate": "2026-11-02"})
    assert buy["kind"] == "Buy" and buy["value"] == 20000 and buy["name"] == "John Roe"
    assert insider.classify({"transactionCode": "S", "change": 0}) is None
    assert insider.classify({"transactionCode": "?", "change": 5}) is None


def test_rank_puts_real_trades_first_and_caps_per_symbol():
    def t(sym, kind, d):
        return {"symbol": sym, "kind": kind, "date": d, "value": 1}
    rows = [t("A", "Grant", "2026-11-10"), t("A", "Sell", "2026-11-01"), t("A", "Sell", "2026-11-02"),
            t("A", "Sell", "2026-11-03"), t("B", "Buy", "2026-10-01")]
    out = insider.rank(rows, 10)
    assert [r["kind"] for r in out[:3]] == ["Sell", "Sell", "Buy"]
    assert sum(1 for r in out if r["symbol"] == "A") == 2


def test_live_mode_never_invents_rows(monkeypatch):
    monkeypatch.setattr(insider.settings, "DATA_MODE", "live")
    monkeypatch.setattr(insider.settings, "FINNHUB_API_KEY", "")
    assert _run(insider.compute_insider_activity("GLOBAL")) == []


# ------------------------------------------------------------------ analysts
def test_consensus_score_and_label():
    c = analyst_ratings.consensus({"strongBuy": 10, "buy": 10, "hold": 5, "sell": 0, "strongSell": 0,
                                   "period": "2026-11-01"})
    assert c["analysts"] == 25 and c["buy_pct"] == 80 and c["score"] == 1.2 and c["consensus"] == "Buy"
    assert analyst_ratings.consensus({"strongBuy": 1, "buy": 1}) is None  # too few analysts
    bear = analyst_ratings.consensus({"hold": 2, "sell": 4, "strongSell": 4})
    assert bear["consensus"] == "Sell"
    assert analyst_ratings.with_change(c, {**c, "score": 1.0})["score_change"] == 0.2


# ------------------------------------------------------------------ economic calendar
def test_fred_release_matching():
    ids = econ.match_release_ids([
        {"id": 10, "name": "Consumer Price Index"},
        {"id": 50, "name": "Employment Situation"},
        {"id": 999, "name": "Something Else"},
    ])
    assert ids["consumer price index"] == 10 and ids["employment situation"] == 50
    assert "gross domestic product" not in ids


def test_avg_move_only_counts_past_dates_with_data():
    moves = {"2026-01-10": 1.0, "2026-02-10": 2.0, "2026-03-10": 3.0, "2026-12-10": 9.0}
    avg, n = econ.avg_move_on(["2026-01-10", "2026-02-10", "2026-03-10", "2026-12-10"], moves, date(2026, 11, 13))
    assert (avg, n) == (2.0, 3)
    assert econ.avg_move_on(["2026-01-10"], moves, date(2026, 11, 13)) == (None, 1)


def test_calendar_without_fred_key_shows_only_official_dates(monkeypatch):
    monkeypatch.setattr(econ.settings, "FRED_API_KEY", "")

    async def no_moves():
        return {}
    monkeypatch.setattr(econ, "_spy_moves", no_moves)
    out = _run(econ.compute(today=date(2026, 11, 13)))
    fomc = [e for e in out["events"] if e["name"].startswith("FOMC")]
    assert fomc and fomc[0]["date"] == "2026-12-09" and not fomc[0]["estimated"]
    assert all(e["name"].startswith("FOMC") for e in out["events"])  # no guessed dates
    assert out["missing_releases"] is True
    assert all(e["days_until"] >= 0 for e in out["events"])


# ------------------------------------------------------------------ earnings
def test_earnings_from_synced_events(monkeypatch):
    from app.services import earnings, events

    monkeypatch.setattr(earnings.settings, "DATA_MODE", "live")
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date()  # the service works in UTC
    soon = date.fromordinal(today.toordinal() + 5).isoformat()
    far = date.fromordinal(today.toordinal() + 200).isoformat()
    monkeypatch.setattr(events, "_cache", {"at": time.monotonic(), "updated": "x", "data": {
        "AAPL": {"earnings": soon, "eps_estimate": 2.9}, "TCS": {"earnings": soon}, "MSFT": {"earnings": far},
    }})
    out = _run(earnings.get_earnings_calendar())
    assert {r["symbol"] for r in out} == {"AAPL", "TCS"}
    tcs = next(r for r in out if r["symbol"] == "TCS")
    assert tcs["currency"] == "INR" and tcs["days_until"] == 5


def test_insider_lines_for_one_trade_are_merged():
    rows = [
        {"symbol": "MSFT", "name": "Hood Amy", "date": "2026-11-09", "kind": "Sell", "shares": 5912, "value": 3217522.64, "price": 544.24},
        {"symbol": "MSFT", "name": "Hood Amy", "date": "2026-11-09", "kind": "Sell", "shares": 1393, "value": 759110.75, "price": 544.95},
        {"symbol": "MSFT", "name": "Hood Amy", "date": "2026-11-10", "kind": "Sell", "shares": 10, "value": 5000.0, "price": 500.0},
    ]
    out = insider.merge_same_day(rows)
    assert len(out) == 2
    day = next(r for r in out if r["date"] == "2026-11-09")
    assert day["shares"] == 7305 and day["value"] == 3976633.39 and day["lines"] == 2
    assert 544.2 < day["price"] < 544.4


def test_calendar_countdown_is_refreshed_and_past_events_dropped():
    data = {"events": [{"name": "PPI", "date": "2026-11-13", "days_until": 0},
                       {"name": "Retail Sales", "date": "2026-11-17", "days_until": 4}]}
    out = econ.refresh_countdown(data, today=date(2026, 11, 14))
    assert [(e["name"], e["days_until"]) for e in out["events"]] == [("Retail Sales", 3)]
