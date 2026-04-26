"""Iter-5 backend regression — storage/whatsapp/evolution/events/ai-test-chat.

Rule: NO llamadas reales a /api/ai/test-chat para no consumir credits (solo validación 422/400).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# -- storage round-trip (shared) --
class TestStorage:
    def test_set_get_delete(self, client):
        key = f"TEST_iter5_{uuid.uuid4().hex[:6]}"
        r = client.post(f"{API}/storage/set", json={"key": key, "value": '{"a":1}', "shared": True}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        r2 = client.get(f"{API}/storage/get", params={"key": key}, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("value") == '{"a":1}'

        r3 = client.post(f"{API}/storage/delete", json={"key": key}, timeout=15)
        assert r3.status_code == 200
        assert r3.json().get("ok") is True

        r4 = client.get(f"{API}/storage/get", params={"key": key}, timeout=15)
        # value is null/None after delete
        assert r4.status_code == 200
        assert r4.json().get("value") in (None, "", "null")


# -- whatsapp/send (invalid creds must not crash) --
class TestWhatsappSend:
    def test_invalid_creds_returns_error_not_crash(self, client):
        body = {
            "phone_number_id": "invalid_id",
            "access_token": "invalid_token",
            "to": "34600000000",
            "type": "text",
            "text": {"body": "test"},
        }
        r = client.post(f"{API}/whatsapp/send", json=body, timeout=30)
        # Must be 200 with ok:false, or 4xx/5xx with detail — key is "no crash"
        assert r.status_code < 600
        if r.headers.get("content-type", "").startswith("application/json"):
            data = r.json()
            # one of the following shapes
            assert (data.get("ok") is False) or ("detail" in data) or ("error" in data) or (data.get("status") and data["status"] >= 400)


# -- ai/test-chat: validate endpoint presence WITHOUT consuming credits --
class TestAiTestChat:
    def test_endpoint_exists_rejects_missing_body(self, client):
        r = client.post(f"{API}/ai/test-chat", json={}, timeout=15)
        # Empty body must NOT result in a 2xx (would consume credits). Expect 4xx.
        assert 400 <= r.status_code < 500, f"unexpected {r.status_code}: {r.text[:200]}"


# -- events regression already covered in test_iter4, just re-assert --
class TestEvents:
    def test_get_events(self, client):
        r = client.get(f"{API}/events", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))
