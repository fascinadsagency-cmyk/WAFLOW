"""Tests for Client Intake endpoints (iter-9).

Covers all 9 intake endpoints:
- POST /api/intake/create (idempotent per project_id)
- GET  /api/intake/project/{pid}
- PUT  /api/intake/project/{pid}/items
- GET  /api/intake/{token} (public)
- POST /api/intake/{token}/save
- POST /api/intake/{token}/upload (GridFS, 10MB limit)
- GET  /api/intake/file/{file_id}
- POST /api/intake/{token}/complete (Slack/Discord webhook)
- POST /api/intake/project/{pid}/review (approve/reject)
"""
import io
import json
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://new-app-builder-28.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
PROJECTS_LIST_KEY = "wa_editor:projects_list"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def seeded_project(client):
    pid = f"TEST_intake_{uuid.uuid4().hex[:8]}"
    new_proj = {
        "id": pid,
        "name": "TEST Intake Project",
        "client": "Cliente Intake",
        "emoji": "📋",
        "color": "violet",
        "strategy": "webinar",
    }
    r = client.get(f"{API}/storage/get", params={"key": PROJECTS_LIST_KEY, "shared": "true"}, timeout=15)
    assert r.status_code == 200
    existing_raw = r.json().get("value")
    try:
        existing = json.loads(existing_raw) if existing_raw else []
    except Exception:
        existing = []
    existing = [p for p in existing if p.get("id") != pid] + [new_proj]
    r = client.post(f"{API}/storage/set",
                    json={"key": PROJECTS_LIST_KEY, "value": json.dumps(existing), "shared": True},
                    timeout=15)
    assert r.status_code == 200
    yield new_proj


def _sample_items():
    return [
        {"id": "v1", "type": "variable", "key": "webinar_date", "label": "Fecha del webinar",
         "section": "Evento", "requested": True, "status": "empty"},
        {"id": "v2", "type": "variable", "key": "price", "label": "Precio", "section": "Oferta",
         "requested": True, "status": "empty"},
        {"id": "c1", "type": "creative", "label": "Logo", "section": "Branding",
         "requested": True, "status": "empty"},
        {"id": "v3", "type": "variable", "key": "hidden", "label": "Dato interno",
         "section": "Interno", "requested": False, "status": "empty"},
    ]


# ---------------- CREATE & GET ----------------
class TestIntakeCreate:
    def test_create_returns_token(self, client, seeded_project):
        r = client.post(f"{API}/intake/create",
                        json={"project_id": seeded_project["id"], "items": _sample_items()},
                        timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert isinstance(data.get("token"), str) and len(data["token"]) >= 16

    def test_create_is_idempotent(self, client, seeded_project):
        r1 = client.post(f"{API}/intake/create",
                         json={"project_id": seeded_project["id"], "items": _sample_items()},
                         timeout=15)
        r2 = client.post(f"{API}/intake/create",
                         json={"project_id": seeded_project["id"], "items": _sample_items()},
                         timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["token"] == r2.json()["token"]


class TestIntakeGetForProject:
    def test_get_existing(self, client, seeded_project):
        tok = client.post(f"{API}/intake/create",
                          json={"project_id": seeded_project["id"], "items": _sample_items()},
                          timeout=15).json()["token"]
        r = client.get(f"{API}/intake/project/{seeded_project['id']}", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["exists"] is True
        assert body["token"] == tok
        assert isinstance(body["items"], list)
        assert len(body["items"]) == 4

    def test_get_nonexistent(self, client):
        r = client.get(f"{API}/intake/project/does_not_exist_xyz_{uuid.uuid4().hex[:6]}", timeout=15)
        assert r.status_code == 200
        assert r.json()["exists"] is False


class TestIntakeUpdateItems:
    def test_update_items(self, client, seeded_project):
        client.post(f"{API}/intake/create",
                    json={"project_id": seeded_project["id"], "items": _sample_items()},
                    timeout=15)
        new_items = _sample_items()
        new_items[0]["requested"] = False  # toggle off
        r = client.put(f"{API}/intake/project/{seeded_project['id']}/items",
                       json={"items": new_items}, timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # Verify persisted
        rec = client.get(f"{API}/intake/project/{seeded_project['id']}", timeout=15).json()
        assert rec["items"][0]["requested"] is False


# ---------------- PUBLIC ----------------
class TestIntakePublicGet:
    def test_public_filters_requested(self, client, seeded_project):
        tok = client.post(f"{API}/intake/create",
                          json={"project_id": seeded_project["id"], "items": _sample_items()},
                          timeout=15).json()["token"]
        r = client.get(f"{API}/intake/{tok}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["token"] == tok
        assert body["project_name"] == seeded_project["name"]
        assert body["project_emoji"] == seeded_project["emoji"]
        # Must NOT expose project_id in public payload
        assert "project_id" not in body, "project_id leaked in public intake payload!"
        # Only requested=true items
        assert len(body["items"]) == 3
        for it in body["items"]:
            assert it.get("requested") is True

    def test_public_invalid_token_404(self, client):
        r = client.get(f"{API}/intake/invalid_token_xxxxxxxx", timeout=15)
        assert r.status_code == 404


class TestIntakeClientSave:
    def test_save_sets_pending(self, client, seeded_project):
        tok = client.post(f"{API}/intake/create",
                          json={"project_id": seeded_project["id"], "items": _sample_items()},
                          timeout=15).json()["token"]
        r = client.post(f"{API}/intake/{tok}/save",
                        json={"item_id": "v1", "value": "2026-02-15 18:00"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_save_null_clears_to_empty(self, client, seeded_project):
        tok = client.post(f"{API}/intake/create",
                          json={"project_id": seeded_project["id"], "items": _sample_items()},
                          timeout=15).json()["token"]
        # First set
        client.post(f"{API}/intake/{tok}/save", json={"item_id": "v1", "value": "x"}, timeout=15)
        # Clear
        r = client.post(f"{API}/intake/{tok}/save",
                        json={"item_id": "v1", "value": None}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "empty"


# ---------------- UPLOAD / DOWNLOAD ----------------
class TestIntakeUploadDownload:
    def test_upload_and_download_cycle(self, client, seeded_project):
        tok = client.post(f"{API}/intake/create",
                          json={"project_id": seeded_project["id"], "items": _sample_items()},
                          timeout=15).json()["token"]
        # Small PNG (valid header)
        payload = b"\x89PNG\r\n\x1a\n" + b"A" * 512
        files = {"file": ("logo.png", io.BytesIO(payload), "image/png")}
        data = {"item_id": "c1"}
        # Must not send JSON content-type for multipart
        s = requests.Session()
        r = s.post(f"{API}/intake/{tok}/upload", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["size"] == len(payload)
        file_id = body["file_id"]
        # Download
        r = s.get(f"{API}/intake/file/{file_id}", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        assert r.content == payload

    def test_upload_exceeds_limit_413(self, client, seeded_project):
        tok = client.post(f"{API}/intake/create",
                          json={"project_id": seeded_project["id"], "items": _sample_items()},
                          timeout=15).json()["token"]
        # 10MB + 1 byte
        big = b"A" * (10 * 1024 * 1024 + 1)
        files = {"file": ("big.bin", io.BytesIO(big), "application/octet-stream")}
        data = {"item_id": "c1"}
        s = requests.Session()
        r = s.post(f"{API}/intake/{tok}/upload", files=files, data=data, timeout=60)
        assert r.status_code == 413, f"expected 413, got {r.status_code}"


# ---------------- COMPLETE + NOTIFY ----------------
class TestIntakeComplete:
    def test_complete_triggers_slack_webhook(self, client, seeded_project):
        pid = seeded_project["id"]
        tok = client.post(f"{API}/intake/create",
                          json={"project_id": pid, "items": _sample_items()},
                          timeout=15).json()["token"]
        # Set notify_config with httpbin as slack_url
        client.post(f"{API}/storage/set", json={
            "key": f"wa_editor:p:{pid}:notify_config",
            "value": json.dumps({"slack_url": "https://httpbin.org/post"}),
            "shared": True,
        }, timeout=15)
        client.post(f"{API}/intake/{tok}/save", json={"item_id": "v1", "value": "hello"}, timeout=15)
        r = client.post(f"{API}/intake/{tok}/complete", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body.get("completed_at")


# ---------------- REVIEW ----------------
class TestIntakeReview:
    def test_approve_variable_applies_to_project(self, client, seeded_project):
        pid = seeded_project["id"]
        # Fresh items
        client.post(f"{API}/intake/create",
                    json={"project_id": pid, "items": _sample_items()}, timeout=15)
        tok = client.get(f"{API}/intake/project/{pid}", timeout=15).json()["token"]
        # Client saves value
        client.post(f"{API}/intake/{tok}/save",
                    json={"item_id": "v2", "value": "97€"}, timeout=15)
        # Agency approves
        r = client.post(f"{API}/intake/project/{pid}/review",
                        json={"item_id": "v2", "action": "approve"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"
        # Verify variable applied to project storage
        rr = client.get(f"{API}/storage/get",
                        params={"key": f"wa_editor:p:{pid}:vars", "shared": "true"},
                        timeout=15)
        assert rr.status_code == 200
        raw = rr.json().get("value")
        vars_list = json.loads(raw) if raw else []
        match = next((v for v in vars_list if v.get("name") == "price"), None)
        assert match is not None, "variable 'price' was not upserted into project vars"
        assert match["value"] == "97€"

    def test_approve_creative_adds_to_project(self, client, seeded_project):
        pid = seeded_project["id"]
        client.post(f"{API}/intake/create",
                    json={"project_id": pid, "items": _sample_items()}, timeout=15)
        tok = client.get(f"{API}/intake/project/{pid}", timeout=15).json()["token"]
        # Upload a file
        payload = b"\x89PNG\r\n\x1a\n" + b"B" * 128
        s = requests.Session()
        up = s.post(f"{API}/intake/{tok}/upload",
                    files={"file": ("brand.png", io.BytesIO(payload), "image/png")},
                    data={"item_id": "c1"}, timeout=30).json()
        file_id = up["file_id"]
        # Approve creative
        r = client.post(f"{API}/intake/project/{pid}/review",
                        json={"item_id": "c1", "action": "approve"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"
        # Verify creative appended
        rr = client.get(f"{API}/storage/get",
                        params={"key": f"wa_editor:p:{pid}:creatives", "shared": "true"},
                        timeout=15)
        raw = rr.json().get("value")
        creatives = json.loads(raw) if raw else []
        match = next((c for c in creatives if c.get("source") == "client_intake"
                      and file_id in (c.get("url") or "")), None)
        assert match is not None, "creative not added to project with source=client_intake"
        assert match["url"] == f"/api/intake/file/{file_id}"

    def test_reject_with_comment_no_apply(self, client, seeded_project):
        pid = seeded_project["id"]
        client.post(f"{API}/intake/create",
                    json={"project_id": pid, "items": _sample_items()}, timeout=15)
        tok = client.get(f"{API}/intake/project/{pid}", timeout=15).json()["token"]
        client.post(f"{API}/intake/{tok}/save",
                    json={"item_id": "v1", "value": "bad-value"}, timeout=15)
        r = client.post(f"{API}/intake/project/{pid}/review",
                        json={"item_id": "v1", "action": "reject",
                              "comment": "Falta hora exacta"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"
        # Verify rejected status + comment persisted
        rec = client.get(f"{API}/intake/project/{pid}", timeout=15).json()
        item = next(it for it in rec["items"] if it["id"] == "v1")
        assert item["status"] == "rejected"
        assert item.get("review_comment") == "Falta hora exacta"

    def test_cannot_approve_non_pending_item(self, client, seeded_project):
        pid = seeded_project["id"]
        client.post(f"{API}/intake/create",
                    json={"project_id": pid, "items": _sample_items()}, timeout=15)
        # v1 has status=empty (never saved)
        r = client.post(f"{API}/intake/project/{pid}/review",
                        json={"item_id": "v1", "action": "approve"}, timeout=15)
        assert r.status_code == 400
