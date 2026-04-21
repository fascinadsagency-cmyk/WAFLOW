"""Tests for Magic Review Link endpoints.

Covers:
- POST /api/review/create — generates token (new and idempotent reuse)
- GET  /api/review/{token} — returns sanitized project (no notes/status)
- GET  /api/review/{invalid} — 404
- POST /api/review/{token}/approve — saves approval; null clears it
- POST /api/review/{invalid}/approve — 404

A minimal project is seeded via /api/storage/set into key
"wa_editor:projects_list" so review_get can resolve it.
"""
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
    """Seed a minimal test project in projects_list. Returns the project dict.

    Merges (doesn't overwrite) with any existing projects_list to avoid
    destroying state used by the running UI.
    """
    pid = f"TEST_review_{uuid.uuid4().hex[:8]}"
    new_proj = {
        "id": pid,
        "name": "TEST Review Project",
        "client": "Cliente Test",
        "emoji": "🧪",
        "color": "indigo",
        "strategy": "webinar",
        "notes": "SECRET internal notes — must NOT leak",
        "status": "in-progress",
    }
    # Fetch existing list
    r = client.get(f"{API}/storage/get", params={"key": PROJECTS_LIST_KEY, "shared": "true"}, timeout=15)
    assert r.status_code == 200
    existing_raw = r.json().get("value")
    try:
        existing = json.loads(existing_raw) if existing_raw else []
    except Exception:
        existing = []
    # Append, skipping any collision
    existing = [p for p in existing if p.get("id") != pid] + [new_proj]

    r = client.post(
        f"{API}/storage/set",
        json={"key": PROJECTS_LIST_KEY, "value": json.dumps(existing), "shared": True},
        timeout=15,
    )
    assert r.status_code == 200
    yield new_proj


class TestReviewCreate:
    def test_create_returns_token_and_path(self, client, seeded_project):
        r = client.post(f"{API}/review/create", json={"project_id": seeded_project["id"]}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("token"), str) and len(data["token"]) >= 16
        assert data.get("path") == f"/review/{data['token']}"

    def test_create_is_idempotent(self, client, seeded_project):
        r1 = client.post(f"{API}/review/create", json={"project_id": seeded_project["id"]}, timeout=15)
        r2 = client.post(f"{API}/review/create", json={"project_id": seeded_project["id"]}, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["token"] == r2.json()["token"], "Same project_id must return same token"


class TestReviewGet:
    def test_get_returns_sanitized_project(self, client, seeded_project):
        tok = client.post(f"{API}/review/create", json={"project_id": seeded_project["id"]}, timeout=15).json()["token"]
        r = client.get(f"{API}/review/{tok}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(["project", "vars", "edits", "approval"]).issubset(body.keys())
        proj = body["project"]
        # Public fields
        assert proj["id"] == seeded_project["id"]
        assert proj["name"] == seeded_project["name"]
        assert proj["client"] == seeded_project["client"]
        assert proj["strategy"] == seeded_project["strategy"]
        # Sanitized fields MUST NOT be present
        assert "notes" not in proj, "project.notes leaked in public review payload!"
        assert "status" not in proj, "project.status leaked in public review payload!"
        # Shapes
        assert isinstance(body["vars"], list)
        assert isinstance(body["edits"], dict)
        assert isinstance(body["approval"], dict)

    def test_get_invalid_token_404(self, client):
        r = client.get(f"{API}/review/this_token_does_not_exist_xyz_123", timeout=15)
        assert r.status_code == 404


class TestReviewApprove:
    def test_approve_and_persist(self, client, seeded_project):
        tok = client.post(f"{API}/review/create", json={"project_id": seeded_project["id"]}, timeout=15).json()["token"]
        msg_key = f"TEST_msg_{uuid.uuid4().hex[:6]}"

        # Approve
        r = client.post(
            f"{API}/review/{tok}/approve",
            json={"msgKey": msg_key, "status": "approved", "by": "Cliente"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("approval", {}).get("status") == "approved"
        assert data.get("approval", {}).get("by") == "Cliente"

        # Verify via subsequent GET
        r = client.get(f"{API}/review/{tok}", timeout=15)
        assert r.status_code == 200
        approval = r.json()["approval"]
        assert msg_key in approval
        assert approval[msg_key]["status"] == "approved"
        assert approval[msg_key]["by"] == "Cliente"
        assert isinstance(approval[msg_key]["at"], int)

        # Clear with status=null
        r = client.post(
            f"{API}/review/{tok}/approve",
            json={"msgKey": msg_key, "status": None},
            timeout=15,
        )
        assert r.status_code == 200

        r = client.get(f"{API}/review/{tok}", timeout=15)
        assert r.status_code == 200
        assert msg_key not in r.json()["approval"], "approval entry was not cleared when status=null"

    def test_approve_invalid_token_404(self, client):
        r = client.post(
            f"{API}/review/nonexistent_token_abc/approve",
            json={"msgKey": "x", "status": "approved"},
            timeout=15,
        )
        assert r.status_code == 404
