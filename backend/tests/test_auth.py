"""Auth: anonymous token issue + verify, and dev fallback."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_dev_fallback_user():
    # No AUTH_SECRET in test env -> X-User-Id header is honoured.
    r = client.get("/api/v1/auth/me", headers={"X-User-Id": "tester"})
    assert r.status_code == 200
    assert r.json()["data"]["user_id"] == "tester"


def test_anonymous_token_roundtrip():
    body = client.post("/api/v1/auth/anon").json()
    assert body["user_id"].startswith("anon-")
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert r.status_code == 200
    assert r.json()["data"]["user_id"] == body["user_id"]


def test_anonymous_ids_are_unique_and_not_caller_chosen():
    a = client.post("/api/v1/auth/anon", json={"user_id": "victim"}).json()
    b = client.post("/api/v1/auth/anon").json()
    assert a["user_id"] != "victim"
    assert a["user_id"] != b["user_id"]


def test_arbitrary_id_token_endpoint_removed():
    r = client.post("/api/v1/auth/token", json={"user_id": "victim"})
    assert r.status_code in (404, 405)


def test_bad_token_rejected():
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401
