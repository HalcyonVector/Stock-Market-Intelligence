"""Auth: token issue + verify, and dev fallback."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_dev_fallback_user():
    # No AUTH_SECRET in test env -> X-User-Id header is honoured.
    r = client.get("/api/v1/auth/me", headers={"X-User-Id": "naveen"})
    assert r.status_code == 200
    assert r.json()["data"]["user_id"] == "naveen"


def test_token_roundtrip():
    tok = client.post("/api/v1/auth/token", json={"user_id": "u123"}).json()["access_token"]
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    assert r.json()["data"]["user_id"] == "u123"


def test_bad_token_rejected():
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401
