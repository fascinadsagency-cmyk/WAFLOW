"""Iter-6 tests: LAUNCH flow (deploy, status, complete, stop) + regressions."""
import os
import json
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

TEST_PID = "TEST_iter6_launch"
CLEANUP_KEYS = [
    f"wa_editor:p:{TEST_PID}:active_launch",
    f"wa_editor:p:{TEST_PID}:launch_history",
]


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    """Cleanup before and after."""
    for k in CLEANUP_KEYS:
        try:
            requests.post(f"{API}/storage/delete", json={"key": k, "shared": True}, timeout=10)
        except Exception:
            pass
    yield
    for k in CLEANUP_KEYS:
        try:
            requests.post(f"{API}/storage/delete", json={"key": k, "shared": True}, timeout=10)
        except Exception:
            pass


WORKFLOW = {"name": "TEST_wf", "nodes": [{"name": "Webhook", "type": "n8n-nodes-base.webhook"}], "connections": {}}


class TestLaunchDeploy:
    """POST /api/launch/deploy"""

    def test_deploy_success_webhook(self):
        r = requests.post(f"{API}/launch/deploy", json={
            "project_id": TEST_PID,
            "project_name": "TEST iter6",
            "workflow_json": WORKFLOW,
            "n8n_webhook_url": "https://httpbin.org/status/200",
            "snapshot_id": "snap_test_1",
        }, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True, f"expected ok=true, got {data}"
        assert "launch_id" in data
        assert data["status"] == "running"
        assert data["deploy_result"]["ok"] is True
        assert data["deploy_result"]["status"] == 200

        # verify persisted
        g = requests.get(f"{API}/storage/get", params={"key": f"wa_editor:p:{TEST_PID}:active_launch"}, timeout=10)
        assert g.status_code == 200
        stored = json.loads(g.json()["value"])
        assert stored["status"] == "running"
        assert stored["launch_id"] == data["launch_id"]

    def test_deploy_failed_webhook_still_persists(self):
        # use bad webhook but endpoint should still create record
        r = requests.post(f"{API}/launch/deploy", json={
            "project_id": TEST_PID,
            "project_name": "TEST iter6",
            "workflow_json": WORKFLOW,
            "n8n_webhook_url": "https://httpbin.org/status/500",
        }, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is False
        assert data["status"] == "deploy_failed"
        # still has launch_id
        assert "launch_id" in data

        g = requests.get(f"{API}/storage/get", params={"key": f"wa_editor:p:{TEST_PID}:active_launch"}, timeout=10)
        stored = json.loads(g.json()["value"])
        assert stored["status"] == "deploy_failed"


class TestLaunchStatus:
    """GET /api/launch/{pid}/status"""

    def test_status_no_active(self):
        no_pid = "TEST_no_such_launch_pid"
        # cleanup just in case
        requests.post(f"{API}/storage/delete", json={"key": f"wa_editor:p:{no_pid}:active_launch"}, timeout=10)
        r = requests.get(f"{API}/launch/{no_pid}/status", timeout=10)
        assert r.status_code == 200
        assert r.json() == {"active": False}

    def test_status_active_after_deploy(self):
        # deploy first
        requests.post(f"{API}/launch/deploy", json={
            "project_id": TEST_PID,
            "project_name": "TEST iter6",
            "workflow_json": WORKFLOW,
            "n8n_webhook_url": "https://httpbin.org/status/200",
        }, timeout=30)
        # seed some events
        for ev in ["message_sent", "message_sent", "message_delivered", "message_read", "message_failed"]:
            requests.post(f"{API}/events", json={"event": ev, "project_id": TEST_PID}, timeout=10)

        r = requests.get(f"{API}/launch/{TEST_PID}/status", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["active"] is True
        assert "launch" in data
        assert "stats" in data
        assert data["stats"]["sent"] >= 2
        assert data["stats"]["delivered"] >= 1
        assert data["stats"]["failed"] >= 1
        assert "delivery_rate" in data
        assert isinstance(data["delivery_rate"], (int, float))


class TestLaunchStopComplete:
    def test_stop_marks_stopped(self):
        # ensure active
        requests.post(f"{API}/launch/deploy", json={
            "project_id": TEST_PID,
            "project_name": "TEST iter6",
            "workflow_json": WORKFLOW,
            "n8n_webhook_url": "https://httpbin.org/status/200",
        }, timeout=30)
        r = requests.post(f"{API}/launch/{TEST_PID}/stop", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["launch"]["status"] == "stopped"
        assert "stopped_at" in data["launch"]

    def test_stop_no_active_404(self):
        no_pid = "TEST_no_launch_to_stop"
        requests.post(f"{API}/storage/delete", json={"key": f"wa_editor:p:{no_pid}:active_launch"}, timeout=10)
        r = requests.post(f"{API}/launch/{no_pid}/stop", timeout=10)
        assert r.status_code == 404

    def test_complete_archives_to_history(self):
        # re-deploy
        requests.post(f"{API}/launch/deploy", json={
            "project_id": TEST_PID,
            "project_name": "TEST iter6",
            "workflow_json": WORKFLOW,
            "n8n_webhook_url": "https://httpbin.org/status/200",
        }, timeout=30)
        r = requests.post(f"{API}/launch/complete", json={"project_id": TEST_PID, "reason": "auto_95pct"}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["launch"]["status"] == "completed"
        assert data["launch"]["complete_reason"] == "auto_95pct"

        # verify history entry exists
        g = requests.get(f"{API}/storage/get", params={"key": f"wa_editor:p:{TEST_PID}:launch_history"}, timeout=10)
        history = json.loads(g.json()["value"])
        assert isinstance(history, list)
        assert len(history) >= 1
        assert history[0]["status"] == "completed"

    def test_complete_no_active_404(self):
        # after previous test, still exists (marked completed but present). Use fresh pid
        no_pid = "TEST_no_launch_to_complete"
        requests.post(f"{API}/storage/delete", json={"key": f"wa_editor:p:{no_pid}:active_launch"}, timeout=10)
        r = requests.post(f"{API}/launch/complete", json={"project_id": no_pid}, timeout=10)
        assert r.status_code == 404


class TestRegressions:
    """Regressions: storage, events, evolution, whatsapp should still work."""

    def test_storage_set_get(self):
        key = "TEST_iter6_regress_storage"
        r = requests.post(f"{API}/storage/set", json={"key": key, "value": '{"hello":"world"}', "shared": True}, timeout=10)
        assert r.status_code == 200
        g = requests.get(f"{API}/storage/get", params={"key": key}, timeout=10)
        assert g.status_code == 200
        assert g.json()["value"] == '{"hello":"world"}'
        requests.post(f"{API}/storage/delete", json={"key": key, "shared": True}, timeout=10)

    def test_events_post_list(self):
        r = requests.post(f"{API}/events", json={"event": "TEST_iter6_regress", "project_id": TEST_PID}, timeout=10)
        assert r.status_code == 200
        assert "id" in r.json()
        g = requests.get(f"{API}/events", params={"project_id": TEST_PID}, timeout=10)
        assert g.status_code == 200
        assert isinstance(g.json(), list)

    def test_review_create(self):
        r = requests.post(f"{API}/review/create", json={"project_id": TEST_PID}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data["path"].startswith("/review/")

    def test_evolution_send_bad_url(self):
        # Only test the endpoint shape — use invalid url so we don't spam anyone
        r = requests.post(f"{API}/evolution/send", json={
            "server_url": "https://invalid.localhost.invalid",
            "api_key": "x", "instance": "y", "to": "34600000000", "message": "TEST"
        }, timeout=40)
        # either 500 or 200 with ok=false — endpoint must not crash with validation error
        assert r.status_code in (200, 500)

    def test_whatsapp_send_bad_creds(self):
        r = requests.post(f"{API}/whatsapp/send", json={
            "access_token": "badtoken", "phone_number_id": "0",
            "to": "34600000000", "message": "TEST iter6"
        }, timeout=30)
        # endpoint reachable — Meta will return 4xx but our relay returns 200 with ok=false
        assert r.status_code == 200
        data = r.json()
        assert "ok" in data
        assert data["ok"] is False
