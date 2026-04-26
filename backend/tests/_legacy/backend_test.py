"""Backend tests for WhatsApp Flow Editor API.

Tests cover:
- Root endpoint
- Storage CRUD (set/get/delete) with MongoDB
- Events ingestion and listing with filtering
- AI test-chat via Emergent LLM (Claude Sonnet 4.5) - ONE short call to save credits
- WhatsApp send with invalid credentials (must not crash)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://new-app-builder-28.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --------------------- Root ---------------------
def test_root(client):
    r = client.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "message" in data
    assert isinstance(data["message"], str)
    assert len(data["message"]) > 0


# --------------------- Storage ---------------------
class TestStorage:
    def test_storage_roundtrip(self, client):
        key = f"TEST_key_{uuid.uuid4().hex[:8]}"
        value = "hello-world-value-123"

        # SET
        r = client.post(f"{API}/storage/set", json={"key": key, "value": value, "shared": True}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("key") == key

        # GET
        r = client.get(f"{API}/storage/get", params={"key": key, "shared": "true"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("value") == value

        # OVERWRITE
        new_value = "updated-value-456"
        r = client.post(f"{API}/storage/set", json={"key": key, "value": new_value, "shared": True}, timeout=15)
        assert r.status_code == 200
        r = client.get(f"{API}/storage/get", params={"key": key, "shared": "true"}, timeout=15)
        assert r.json().get("value") == new_value

        # DELETE
        r = client.post(f"{API}/storage/delete", json={"key": key, "shared": True}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # GET after DELETE - should return null
        r = client.get(f"{API}/storage/get", params={"key": key, "shared": "true"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("value") is None

    def test_storage_get_missing_key(self, client):
        key = f"TEST_missing_{uuid.uuid4().hex[:8]}"
        r = client.get(f"{API}/storage/get", params={"key": key, "shared": "true"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("value") is None


# --------------------- Events ---------------------
class TestEvents:
    def test_post_event_and_list(self, client):
        project_id = f"TEST_proj_{uuid.uuid4().hex[:6]}"
        payload = {
            "event": "message_sent",
            "user_id": "TEST_user_1",
            "flow": "Flujo A",
            "msg_id": "msg_001",
            "project_id": project_id,
        }
        r = client.post(f"{API}/events", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "id" in data and isinstance(data["id"], str) and len(data["id"]) > 0

        # List all - should contain our event
        r = client.get(f"{API}/events", timeout=15)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list)
        # Filter by project_id
        r = client.get(f"{API}/events", params={"project_id": project_id}, timeout=15)
        assert r.status_code == 200
        filtered = r.json()
        assert isinstance(filtered, list)
        assert len(filtered) >= 1
        assert all(e.get("project_id") == project_id for e in filtered)
        assert filtered[0].get("event") == "message_sent"
        assert filtered[0].get("flow") == "Flujo A"

    def test_list_events_sorted_desc(self, client):
        project_id = f"TEST_sort_{uuid.uuid4().hex[:6]}"
        # Insert two events
        for i in range(2):
            r = client.post(
                f"{API}/events",
                json={"event": f"evt_{i}", "project_id": project_id, "flow": "Flujo B"},
                timeout=15,
            )
            assert r.status_code == 200
        r = client.get(f"{API}/events", params={"project_id": project_id}, timeout=15)
        assert r.status_code == 200
        evs = r.json()
        assert len(evs) >= 2
        ts = [e.get("timestamp") for e in evs if e.get("timestamp")]
        assert ts == sorted(ts, reverse=True)


# --------------------- AI chat (ONE call to save credits) ---------------------
def test_ai_test_chat(client):
    payload = {
        "system_prompt": "Eres un asistente que responde con una sola palabra.",
        "messages": [{"role": "user", "text": "Responde solo con la palabra: Hola"}],
    }
    r = client.post(f"{API}/ai/test-chat", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert data.get("provider") == "anthropic"
    assert "claude" in (data.get("model") or "").lower()
    response_text = data.get("response")
    assert isinstance(response_text, str)
    assert len(response_text.strip()) > 0


# --------------------- WhatsApp send ---------------------
def test_whatsapp_send_invalid_credentials(client):
    payload = {
        "access_token": "INVALID_TOKEN_FOR_TESTING",
        "phone_number_id": "000000000000000",
        "to": "15550000000",
        "message": "test",
    }
    r = client.post(f"{API}/whatsapp/send", json=payload, timeout=30)
    # Must not crash. Expect either 200 with ok:false, or status >=400.
    if r.status_code == 200:
        data = r.json()
        assert data.get("ok") is False
        assert data.get("status", 0) >= 400
    else:
        assert r.status_code >= 400
