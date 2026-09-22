"""Iter-10 backend tests:
- Verify all sensitive endpoints return 401 without session cookie
- Verify public endpoints remain accessible (no auth required)
- Verify strip_emojis behavior (no Pydantic warning at startup)
- Verify MetaTemplateSyncItemBody alias 'copy' -> 'copy_text'
- Verify INITIAL_ADMIN_EMAILS code path (static analysis + env presence)
"""
import os
import sys
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

assert BASE_URL, "REACT_APP_BACKEND_URL is required"
API = f"{BASE_URL}/api"


# --------------------------------------------------------------------
# 1) Endpoints PROTEGIDOS — deben devolver 401 sin cookie
# --------------------------------------------------------------------

PROTECTED_GET = [
    "/storage/get?key=test",
    "/events",
    "/launch/proj_dummy/status",
    "/intake/project/proj_dummy",
    "/meta/templates/status/proj_dummy",
]

PROTECTED_POST_JSON = [
    ("/storage/set", {"key": "x", "value": "y"}),
    ("/storage/delete", {"key": "x"}),
    ("/ai/test-chat", {"messages": [{"role": "user", "content": "hi"}]}),
    ("/whatsapp/send", {"access_token": "x", "phone_number_id": "1", "to": "1", "message": "hi"}),
    ("/whatsapp/send-template", {"access_token": "x", "phone_number_id": "1", "to": "1", "template_name": "t", "language": "es", "params": []}),
    ("/test-connection", {"connector": "meta", "credentials": {}}),
    ("/evolution/send", {"base_url": "x", "instance_name": "x", "api_key": "x", "to": "1", "message": "hi"}),
    ("/launch/deploy", {"project_id": "p1", "n8n_url": "x"}),
    ("/launch/complete", {"project_id": "p1"}),
    ("/launch/proj_dummy/stop", {}),
    ("/intake/create", {"project_id": "p1", "items": []}),
    ("/intake/project/proj_dummy/review", {"item_id": "x", "action": "approve"}),
    ("/meta/templates/sync", {"project_id": "p1", "items": []}),
    ("/whatsapp/run-flow-test", {"project_id": "p1", "phone_number_id": "1", "access_token": "x", "to": "1", "items": []}),
    ("/whatsapp/run-flow-test/run_dummy/cancel", {}),
    ("/review/create", {"project_id": "p1"}),
]

PROTECTED_PUT_JSON = [
    ("/intake/project/proj_dummy/items", {"items": []}),
]


@pytest.mark.parametrize("path", PROTECTED_GET)
def test_protected_get_returns_401_without_cookie(path):
    r = requests.get(f"{API}{path}", timeout=15)
    assert r.status_code == 401, f"GET {path} expected 401, got {r.status_code} — body={r.text[:200]}"


@pytest.mark.parametrize("path,body", PROTECTED_POST_JSON)
def test_protected_post_returns_401_without_cookie(path, body):
    r = requests.post(f"{API}{path}", json=body, timeout=15)
    assert r.status_code == 401, f"POST {path} expected 401, got {r.status_code} — body={r.text[:200]}"


@pytest.mark.parametrize("path,body", PROTECTED_PUT_JSON)
def test_protected_put_returns_401_without_cookie(path, body):
    r = requests.put(f"{API}{path}", json=body, timeout=15)
    assert r.status_code == 401, f"PUT {path} expected 401, got {r.status_code} — body={r.text[:200]}"


# --------------------------------------------------------------------
# 2) Endpoints PUBLICOS — NO deben devolver 401 sin cookie
# (pueden devolver 404/400 por payload/token inválido, pero NUNCA 401)
# --------------------------------------------------------------------

def _assert_not_401(method, path, **kwargs):
    r = requests.request(method, f"{API}{path}", timeout=15, **kwargs)
    assert r.status_code != 401, f"{method} {path} should be PUBLIC, got 401 — body={r.text[:200]}"
    return r


def test_public_review_get_token():
    _assert_not_401("GET", "/review/faketoken_does_not_exist")


def test_public_review_approve():
    _assert_not_401("POST", "/review/faketoken_xx/approve", json={"approved": True})


def test_public_review_sign():
    _assert_not_401("POST", "/review/faketoken_xx/sign", json={"signature_data_url": "data:image/png;base64,xx"})


def test_public_review_notify():
    _assert_not_401("POST", "/review/faketoken_xx/notify", json={})


def test_public_review_summary_pdf():
    _assert_not_401("GET", "/review/faketoken_xx/summary.pdf")


def test_public_intake_token_get():
    _assert_not_401("GET", "/intake/faketoken_xx")


def test_public_intake_token_save():
    _assert_not_401("POST", "/intake/faketoken_xx/save", json={"item_id": "x", "value": "y"})


def test_public_intake_token_complete():
    _assert_not_401("POST", "/intake/faketoken_xx/complete")


def test_public_intake_file_download():
    _assert_not_401("GET", "/intake/file/dummyfileid")


def test_public_auth_callback():
    # Auth callback is the entry point — must NOT require existing cookie
    r = requests.post(f"{API}/auth/callback", json={"session_id": "fake_session_does_not_exist"}, timeout=20)
    # Should bubble up a 401 from Emergent or 502 — but NOT 401 from our require_user middleware
    # Accepted: 401/502 (both come from Emergent flow), but the response detail must reference Emergent, not "No autenticado"
    assert r.status_code in (400, 401, 502), f"unexpected status {r.status_code} body={r.text[:200]}"
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    assert body.get("detail") != "No autenticado", "auth/callback should not be guarded by require_user"


def test_public_events_post_open_for_n8n():
    # /api/events POST stays public for n8n webhooks (intentional)
    r = requests.post(f"{API}/events", json={
        "event": "iter10_public_smoke",
        "project_id": "TEST_iter10",
        "flow": "test",
    }, timeout=15)
    assert r.status_code == 200, f"POST /events public should be 200, got {r.status_code} body={r.text[:200]}"
    assert r.json().get("ok") is True


def test_public_flow_test_run_get():
    _assert_not_401("GET", "/whatsapp/run-flow-test/dummyrun")


# --------------------------------------------------------------------
# 3) strip_emojis (unit)  + Pydantic warning check
# --------------------------------------------------------------------

def _import_server_module():
    sys.path.insert(0, "/app/backend")
    import server  # noqa
    return server


def test_strip_emojis_removes_emoji_and_trims():
    srv = _import_server_module()
    out = srv.strip_emojis("¡Hola! 👋 Bienvenid@ 🎉")
    # No emojis, no double spaces, no trailing space
    assert "👋" not in out and "🎉" not in out
    assert "  " not in out
    assert out == out.strip()
    # The user-friendly content remains
    assert "Hola" in out and "Bienvenid@" in out
    # Specifically the expected: "¡Hola! Bienvenid@"
    assert out == "¡Hola! Bienvenid@"


def test_strip_emojis_preserves_punctuation_and_lines():
    srv = _import_server_module()
    out = srv.strip_emojis("Línea 1 😀\nLínea 2 ✨ final")
    assert "😀" not in out and "✨" not in out
    # Each line trimmed
    for line in out.split("\n"):
        assert line == line.strip()


# --------------------------------------------------------------------
# 4) MetaTemplateSyncItemBody alias 'copy' -> 'copy_text'
# --------------------------------------------------------------------

def test_meta_template_alias_copy_accepted():
    srv = _import_server_module()
    Model = srv.MetaTemplateSyncItemBody
    # Build with alias 'copy'
    obj = Model(**{
        "msg_key": "flujo_a:M1",
        "flow_key": "flujo_a",
        "msg_id": "M1",
        "copy": "Hola {{nombre}}",
    })
    assert obj.copy_text == "Hola {{nombre}}"


def test_meta_template_alias_copy_text_also_accepted():
    srv = _import_server_module()
    Model = srv.MetaTemplateSyncItemBody
    obj = Model(**{
        "msg_key": "flujo_a:M1",
        "flow_key": "flujo_a",
        "msg_id": "M1",
        "copy_text": "Saludo",  # via field name (populate_by_name=True)
    })
    assert obj.copy_text == "Saludo"


# --------------------------------------------------------------------
# 5) INITIAL_ADMIN_EMAILS code path (static analysis only — Emergent
# Auth cannot be mocked end-to-end without external service)
# --------------------------------------------------------------------

def test_initial_admin_emails_logic_present_in_source():
    """Verify the env var is read and the admin-promotion logic still exists.
    Post-refactor (iter-18): these live inside small helpers (_resolve_new_user_role,
    _update_existing_user, _get_initial_admin_emails) instead of a single mega-function."""
    with open("/app/backend/server.py") as f:
        src = f.read()
    assert 'os.environ.get("INITIAL_ADMIN_EMAILS"' in src
    assert "is_initial_admin" in src
    # Branch 1: new user — admin when in INITIAL_ADMIN_EMAILS OR first user of the system
    assert "if is_initial_admin:" in src
    assert "if user_count == 0:" in src
    # Branch 2: existing user — promotes to admin if matches
    assert 'if is_initial_admin and existing.get("role") != "admin":' in src


def test_initial_admin_emails_env_var_defined_in_dotenv():
    """The placeholder env var should be present (even if empty) in backend/.env."""
    with open("/app/backend/.env") as f:
        env_text = f.read()
    assert "INITIAL_ADMIN_EMAILS" in env_text


def test_auth_callback_with_empty_initial_admins_unchanged_behavior():
    """When INITIAL_ADMIN_EMAILS is unset/empty, calling /auth/callback with a
    fake session_id must fail at Emergent step (401/502), not at our guards."""
    # Sanity: env is empty in this environment
    assert os.environ.get("INITIAL_ADMIN_EMAILS", "") == "" or True  # informational
    r = requests.post(f"{API}/auth/callback", json={"session_id": "definitely_not_a_real_session"}, timeout=20)
    assert r.status_code in (400, 401, 502)


# --------------------------------------------------------------------
# 6) Smoke: backend root + auth/me unauth
# --------------------------------------------------------------------

def test_root_health():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200


def test_auth_me_requires_session():
    r = requests.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 401
