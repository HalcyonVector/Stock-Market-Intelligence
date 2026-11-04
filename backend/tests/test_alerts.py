"""Price alerts: background checker batches quotes and only fires once."""
import asyncio

from datetime import datetime, timezone

from app.adapters.base import Quote
from app.services import alerts


def _run(coro):
    # A fresh loop each time: earlier tests may have closed the default loop,
    # which makes asyncio.get_event_loop() raise on Python 3.12+.
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()



class FakeRedis:
    def __init__(self):
        self.kv, self.sets = {}, {}

    async def get(self, k):
        return self.kv.get(k)

    async def set(self, k, v, ex=None):
        self.kv[k] = v

    async def delete(self, k):
        self.kv.pop(k, None)

    async def sadd(self, k, v):
        self.sets.setdefault(k, set()).add(v)

    async def srem(self, k, v):
        self.sets.get(k, set()).discard(v)

    async def smembers(self, k):
        return set(self.sets.get(k, set()))


class FakeMarket:
    def __init__(self, prices):
        self.prices, self.calls = prices, 0

    async def quotes(self, syms):
        self.calls += 1
        return [Quote(symbol=s, price=self.prices[s], change=0, change_pct=0, volume=0, avg_volume=0,
                      market_cap=None, currency="USD", market="US", ts=datetime.now(timezone.utc))
                for s in syms]


def run(c):
    return _run(c)


def test_background_check_fires_once_and_batches(monkeypatch):
    r = FakeRedis()
    market = FakeMarket({"AAPL": 210.0, "MSFT": 300.0})
    monkeypatch.setattr(alerts, "get_redis", lambda: r)
    monkeypatch.setattr(alerts.providers, "market", market)

    run(alerts.create_alert("u1", "aapl", "above", 200))
    run(alerts.create_alert("u2", "MSFT", "below", 250))
    assert r.sets[alerts.USERS_KEY] == {"u1", "u2"}

    assert run(alerts.check_all_users()) == 1
    assert market.calls == 1                       # one batched fetch for all users
    (a1,) = run(alerts.list_alerts("u1"))
    assert a1["triggered"] and a1["trigger_price"] == 210.0
    (a2,) = run(alerts.list_alerts("u2"))
    assert not a2["triggered"]

    assert run(alerts.check_all_users()) == 0      # already-fired alerts don't re-fire


def test_deleting_last_alert_drops_user_from_index(monkeypatch):
    r = FakeRedis()
    monkeypatch.setattr(alerts, "get_redis", lambda: r)
    a = run(alerts.create_alert("u1", "AAPL", "above", 1))
    run(alerts.delete_alert("u1", a["id"]))
    assert "u1" not in r.sets[alerts.USERS_KEY]


def test_rejects_unknown_condition(monkeypatch):
    monkeypatch.setattr(alerts, "get_redis", lambda: FakeRedis())
    try:
        run(alerts.create_alert("u1", "AAPL", "sideways", 1))
    except ValueError:
        return
    raise AssertionError("expected ValueError")
