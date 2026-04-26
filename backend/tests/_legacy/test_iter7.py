"""Iter-7 tests: /api/test-connection + smoke regressions for 4 operational fixes."""
import os
import json
import uuid
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

TEST_PID = "TEST_iter7_conn"


# ===================== /api/test-connection =====================
class TestConnectionEndpoint:

    def test_n8n_webhook_valid_url(self):
        r = requests.post(f"{API}/test-connection", json={
            "type": "n8n_webhook",
            "config": {"url": "https://httpbin.org/post"}
        }, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True, f"expected ok=true for httpbin.org/post, got {data}"
        assert "detail" in data

    def test_n8n_webhook_missing_url(self):
        r = requests.post(f"{API}/test-connection", json={
            "type": "n8n_webhook", "config": {}
        }, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is False
        assert "error" in data

    def test_meta_invalid_credentials_graceful(self):
        """Meta with dummy creds must return ok:false, not crash."""
        r = requests.post(f"{API}/test-connection", json={
            "type": "meta",
            "config": {"phone_number_id": "000000000000", "access_token": "BAD_TOKEN_DUMMY"}
        }, timeout=30)
        assert r.status_code == 200, f"endpoint must not 500; got {r.status_code} body={r.text[:200]}"
        data = r.json()
        assert data["ok"] is False
        assert "error" in data

    def test_meta_missing_fields(self):
        r = requests.post(f"{API}/test-connection", json={
            "type": "meta", "config": {}
        }, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is False
        assert "error" in data

    def test_evolution_invalid_credentials_graceful(self):
        """Evolution with dummy creds must return ok:false, not crash."""
        r = requests.post(f"{API}/test-connection", json={
            "type": "evolution",
            "config": {
                "server_url": "https://invalid.waflow-test.invalid",
                "api_key": "dummy",
                "instance": "dummy"
            }
        }, timeout=30)
        assert r.status_code == 200, f"endpoint must not 500; got {r.status_code} body={r.text[:200]}"
        data = r.json()
        assert data["ok"] is False
        assert "error" in data

    def test_evolution_missing_fields(self):
        r = requests.post(f"{API}/test-connection", json={
            "type": "evolution", "config": {"server_url": "https://x.example"}
        }, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is False

    def test_unknown_type(self):
        r = requests.post(f"{API}/test-connection", json={
            "type": "xxx_unknown", "config": {}
        }, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is False
        assert "desconocido" in data.get("error", "").lower() or "error" in data


# ===================== Smoke regressions =====================
class TestSmoke:

    def test_root(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("message") == "WhatsApp Flow Editor API running"

    def test_storage_set_get(self):
        key = "TEST_iter7_storage_smoke"
        r = requests.post(f"{API}/storage/set", json={"key": key, "value": '{"a":1}', "shared": True}, timeout=10)
        assert r.status_code == 200
        g = requests.get(f"{API}/storage/get", params={"key": key}, timeout=10)
        assert g.status_code == 200
        assert g.json()["value"] == '{"a":1}'
        requests.post(f"{API}/storage/delete", json={"key": key, "shared": True}, timeout=10)

    def test_whatsapp_send_invalid_token_no_500(self):
        """POST /api/whatsapp/send with bad token must return ok:false without 500."""
        r = requests.post(f"{API}/whatsapp/send", json={
            "access_token": "BAD_TOKEN",
            "phone_number_id": "0",
            "to": "34600000000",
            "message": "TEST iter7"
        }, timeout=30)
        assert r.status_code == 200, f"should be 200 with ok:false, got {r.status_code}"
        data = r.json()
        assert data.get("ok") is False


# ===================== /api/launch/deploy & status =====================
class TestLaunchFlow:
    PID = "TEST_iter7_launch"

    @classmethod
    def teardown_class(cls):
        for k in [f"wa_editor:p:{cls.PID}:active_launch", f"wa_editor:p:{cls.PID}:launch_history"]:
            try:
                requests.post(f"{API}/storage/delete", json={"key": k, "shared": True}, timeout=10)
            except Exception:
                pass

    def test_deploy_with_valid_webhook_inserts_and_returns_launch_id(self):
        r = requests.post(f"{API}/launch/deploy", json={
            "project_id": self.PID,
            "project_name": "TEST iter7",
            "workflow_json": {"name": "wf", "nodes": [], "connections": {}},
            "n8n_webhook_url": "https://httpbin.org/post",
            "snapshot_id": "snap_iter7",
        }, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True, f"expected ok=true, got {data}"
        assert "launch_id" in data

    def test_status_returns_stats_after_deploy(self):
        # Seed a couple of events
        for ev in ["message_sent", "message_delivered"]:
            requests.post(f"{API}/events", json={"event": ev, "project_id": self.PID}, timeout=10)
        r = requests.get(f"{API}/launch/{self.PID}/status", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("active") is True
        assert "stats" in data


# ===================== /api/review/* =====================
class TestReviewFlow:
    PID = f"TEST_iter7_review_{uuid.uuid4().hex[:8]}"

    def test_create_token_then_get_approve_sign_pdf(self):
        # Register project in projects_list (required by review_get)
        g0 = requests.get(f"{API}/storage/get", params={"key": "wa_editor:projects_list"}, timeout=10)
        try:
            projects = json.loads(g0.json().get("value") or "[]")
        except Exception:
            projects = []
        if not any(p.get("id") == self.PID for p in projects):
            projects.append({"id": self.PID, "name": "TEST iter7 review", "client": "QA",
                             "emoji": "📋", "color": "#111", "strategy": "webinar"})
            requests.post(f"{API}/storage/set", json={
                "key": "wa_editor:projects_list",
                "value": json.dumps(projects), "shared": True
            }, timeout=10)

        # create token
        r = requests.post(f"{API}/review/create", json={"project_id": self.PID}, timeout=10)
        assert r.status_code == 200
        token = r.json().get("token")
        assert token, f"no token in {r.json()}"

        # GET review returns project
        g = requests.get(f"{API}/review/{token}", timeout=10)
        assert g.status_code == 200, f"GET /review/{{token}} failed: {g.status_code} {g.text[:300]}"
        body = g.json()
        assert body.get("project", {}).get("id") == self.PID

        # approve a message
        a = requests.post(f"{API}/review/{token}/approve", json={
            "msgKey": "flow_a.msg_0", "status": "approved", "by": "QA Test"
        }, timeout=15)
        assert a.status_code == 200, f"approve failed: {a.status_code} {a.text[:200]}"

        # sign endpoint (firma) — persists signer + locks
        s = requests.post(f"{API}/review/{token}/sign", json={
            "signer_name": "QA Test",
            "signer_role": "Cliente",
            "signature_data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        }, timeout=15)
        # sign may succeed or reject if already locked — accept 200/409
        assert s.status_code in (200, 409), f"sign unexpected: {s.status_code} {s.text[:200]}"

        # pdf — endpoint is summary.pdf
        p = requests.get(f"{API}/review/{token}/summary.pdf", timeout=30)
        assert p.status_code == 200
        ct = p.headers.get("content-type", "")
        assert "pdf" in ct.lower(), f"expected pdf content-type, got {ct}"
        assert p.content[:4] == b"%PDF", f"expected PDF magic bytes, got {p.content[:8]}"
