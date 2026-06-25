"""API smoke tests (mock mode, no DB/Redis required for these paths)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").status_code == 200


def test_movers():
    r = client.get("/api/v1/market/movers")
    assert r.status_code == 200
    assert "gainers" in r.json()["data"]


def test_why_moving():
    r = client.get("/api/v1/stocks/AAPL/why")
    body = r.json()["data"]
    assert "explanation" in body and "confidence" in body
