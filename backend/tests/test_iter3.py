"""Iter-3 tests: PDF summary + notify webhook endpoints.

Covers:
- GET /api/review/{token}/summary.pdf — valid token returns PDF bytes.
- GET /api/review/invalid/summary.pdf — 404.
- POST /api/review/{token}/notify — pct<80 returns notified:false.
- POST /api/review/{token}/notify — pct>=80 with no webhook configured fires,
  returns notified:true with targets both None, flag persisted -> second call
  returns already_notified:true.
- POST /api/review/{token}/notify — with slack_url configured (httpbin 200),
  backend calls it and reports slack status.
- POST /api/review/{token}/notify — with invalid slack_url (unreachable),
  captures error and still returns notified:true.

Notify config is always reset between tests via /api/storage/set.
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
REAL_PID = "proj_mo8h4b5hwsap"  # TEST_Webinar_Persist (has real data)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def real_token(client):
    """Create (idempotent) a review token for the real seeded project."""
    r = client.post(f"{API}/review/create", json={"project_id": REAL_PID}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _reset_notify(client, pid=REAL_PID):
    """Reset notify_config (empty) so pct-trigger logic runs fresh."""
    r = client.post(
        f"{API}/storage/set",
        json={"key": f"wa_editor:p:{pid}:notify_config", "value": json.dumps({}), "shared": True},
        timeout=15,
    )
    assert r.status_code == 200


# ----- PDF -----
class TestSummaryPDF:
    def test_pdf_valid_token_returns_pdf(self, client, real_token):
        r = client.get(f"{API}/review/{real_token}/summary.pdf", timeout=30)
        assert r.status_code == 200, r.text[:200]
        ctype = r.headers.get("content-type", "")
        assert "application/pdf" in ctype, f"unexpected content-type: {ctype}"
        # PDF magic bytes
        assert r.content[:5] == b"%PDF-", f"no PDF magic; first bytes: {r.content[:10]!r}"
        # Reasonable minimum size
        assert len(r.content) > 500

    def test_pdf_invalid_token_404(self, client):
        r = client.get(f"{API}/review/bogus_token_nope_xyz/summary.pdf", timeout=15)
        assert r.status_code == 404


# ----- NOTIFY -----
class TestNotify:
    def test_notify_below_80_returns_not_notified(self, client, real_token):
        _reset_notify(client)
        r = client.post(
            f"{API}/review/{real_token}/notify",
            json={"approved": 10, "total": 100, "project_name": "X"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("notified") is False
        assert data.get("pct") == 10

    def test_notify_above_80_fires_and_is_idempotent(self, client, real_token):
        _reset_notify(client)
        # First call — crosses 80%, no webhook configured, targets both None
        r1 = client.post(
            f"{API}/review/{real_token}/notify",
            json={"approved": 85, "total": 100, "project_name": "X"},
            timeout=20,
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1.get("ok") is True
        assert d1.get("notified") is True
        assert d1.get("pct") == 85
        targets = d1.get("targets")
        assert isinstance(targets, dict)
        assert targets.get("slack") is None
        assert targets.get("discord") is None

        # Second call — already notified
        r2 = client.post(
            f"{API}/review/{real_token}/notify",
            json={"approved": 90, "total": 100, "project_name": "X"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2.get("ok") is True
        assert d2.get("already_notified") is True

    def test_notify_with_valid_slack_webhook(self, client, real_token):
        """Configure slack_url -> httpbin/200, expect status recorded."""
        _reset_notify(client)
        # Set slack_url in notify_config
        r = client.post(
            f"{API}/storage/set",
            json={
                "key": f"wa_editor:p:{REAL_PID}:notify_config",
                "value": json.dumps({"slack_url": "https://httpbin.org/status/200"}),
                "shared": True,
            },
            timeout=15,
        )
        assert r.status_code == 200

        r = client.post(
            f"{API}/review/{real_token}/notify",
            json={"approved": 80, "total": 100, "project_name": "X"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("notified") is True
        slack_result = data.get("targets", {}).get("slack")
        # httpbin may occasionally flake; accept numeric 2xx or an err string
        assert slack_result is not None, f"slack was not attempted: {data}"
        if isinstance(slack_result, int):
            assert slack_result == 200

    def test_notify_with_invalid_webhook_captures_error(self, client, real_token):
        """Configure an unreachable URL — backend should capture err and still notify=true."""
        _reset_notify(client)
        r = client.post(
            f"{API}/storage/set",
            json={
                "key": f"wa_editor:p:{REAL_PID}:notify_config",
                "value": json.dumps({"slack_url": "http://127.0.0.1:1/never"}),
                "shared": True,
            },
            timeout=15,
        )
        assert r.status_code == 200

        r = client.post(
            f"{API}/review/{real_token}/notify",
            json={"approved": 85, "total": 100, "project_name": "X"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("notified") is True
        slack = data.get("targets", {}).get("slack")
        assert isinstance(slack, str) and slack.startswith("err"), f"expected error capture, got: {slack}"

    def test_notify_invalid_token_404(self, client):
        r = client.post(
            f"{API}/review/nope_token_zzz/notify",
            json={"approved": 90, "total": 100, "project_name": "X"},
            timeout=15,
        )
        assert r.status_code == 404


# ----- Teardown: reset notify_config so UI stays clean -----
def teardown_module(module):
    s = requests.Session()
    try:
        s.post(
            f"{API}/storage/set",
            json={"key": f"wa_editor:p:{REAL_PID}:notify_config", "value": json.dumps({}), "shared": True},
            timeout=10,
        )
    except Exception:
        pass
