"""Regression tests for the silent-mock bugs found in production.

1. Groq retired llama-3.3-70b-versatile; every call 404'd and the app served
   mock text indefinitely. GroqAIProvider must switch to an available model.
2. YFinanceMarketProvider returned mock data on failure, so the fallback chain
   treated it as a success and never tried Stooq/Finnhub/Alpha Vantage.
"""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.adapters import ai as ai_mod
from app.adapters import fallback as fb
from app.adapters import live
from app.adapters.base import Quote


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# --------------------------------------------------------------------------- Groq
class _Models:
    def __init__(self, ids):
        self.ids = ids

    def list(self):
        ids = self.ids

        async def gen():
            for i in ids:
                yield SimpleNamespace(id=i)

        return gen()


class _Completions:
    def __init__(self, retired, answer="Real AI answer."):
        self.retired, self.answer, self.calls = retired, answer, []

    async def create(self, model, **kw):
        self.calls.append((model, kw.get("extra_body")))
        if model in self.retired:
            raise RuntimeError(
                "Error code: 404 - {'error': {'message': 'The model `%s` does not exist', "
                "'code': 'model_not_found'}}" % model
            )
        msg = SimpleNamespace(content="<think>hidden</think>" + self.answer)
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


class _Client:
    def __init__(self, retired, available):
        self.chat = SimpleNamespace(completions=_Completions(retired))
        self.models = _Models(available)


def _groq(monkeypatch, client, model="llama-3.3-70b-versatile"):
    monkeypatch.setattr(ai_mod.settings, "GROQ_MODEL", model)
    monkeypatch.setattr(ai_mod.GroqAIProvider, "_model", None)
    p = ai_mod.GroqAIProvider()
    monkeypatch.setattr(p, "_client", lambda: client)
    return p


def test_groq_switches_off_retired_model(monkeypatch):
    client = _Client(retired={"llama-3.3-70b-versatile"}, available=["openai/gpt-oss-120b", "whisper-large-v3"])
    p = _groq(monkeypatch, client)
    out = _run(p.explain("sys", "prompt"))
    assert out == "Real AI answer."                              # <think> stripped
    models = [m for m, _ in client.chat.completions.calls]
    assert models == ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]
    assert client.chat.completions.calls[1][1] == {"reasoning_effort": "low"}
    assert ai_mod.ai_status["degraded"] is False and ai_mod.ai_status["model"] == "openai/gpt-oss-120b"
    # Sticky: the next call goes straight to the replacement.
    _run(p.explain("sys", "prompt"))
    assert client.chat.completions.calls[-1][0] == "openai/gpt-oss-120b"


def test_groq_falls_back_to_mock_and_reports_degraded(monkeypatch):
    client = _Client(retired={"llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3.6-27b",
                              "openai/gpt-oss-20b"}, available=[])
    p = _groq(monkeypatch, client)
    out = _run(p.explain("sys", "prompt"))
    assert "Mock mode" in out
    assert ai_mod.ai_status["degraded"] is True and "model_not_found" in ai_mod.ai_status["last_error"]
    ai_mod.ai_status.update(degraded=False, last_error=None)


# --------------------------------------------------------------- market chain
def _quote(sym, price):
    return Quote(symbol=sym, price=price, change=0, change_pct=0.5, volume=1, avg_volume=1,
                 market_cap=None, currency="USD", market="US", ts=datetime.now(timezone.utc))


def test_yfinance_raises_inside_chain_instead_of_returning_mock(monkeypatch):
    def boom():
        raise RuntimeError("Too Many Requests")

    monkeypatch.setattr(live, "_yf_ticker", lambda *_a, **_k: boom())
    yf = live.YFinanceMarketProvider()
    try:
        _run(yf.quote("AAPL"))
    except RuntimeError as e:
        assert "yfinance quote failed" in str(e)
    else:
        raise AssertionError("expected yfinance to raise, not return mock data")


def test_chain_falls_through_to_next_real_provider(monkeypatch):
    class Bad:
        name = "yfinance"

        async def quote(self, s):
            raise RuntimeError("blocked")

    class Good:
        name = "stooq"

        async def quote(self, s):
            return _quote(s, 123.45)

    monkeypatch.setattr(fb, "_build_market_chain", lambda: [Bad(), Good()])
    p = fb.FallbackMarketProvider()
    monkeypatch.setattr(p, "_cache_get", lambda *a: _none())
    monkeypatch.setattr(p, "_cache_set", lambda *a: _none())

    q = _run(p.quote("ZZTEST"))
    assert q.price == 123.45
    assert fb.market_status["last_live_source"] == "stooq"


async def _none():
    return None


# --------------------------------------------------------------------- health
def test_health_reports_ai_and_market_status():
    from app.main import app

    body = TestClient(app).get("/health").json()
    assert {"key_set", "configured_model", "model", "degraded", "last_error"} <= set(body["ai"])
    assert {"last_live_source", "mock_served", "last_mock_reason"} <= set(body["market"])
