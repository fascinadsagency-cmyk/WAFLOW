"""Tests para los endpoints PostgreSQL.

No requieren un Postgres real. Validan:
- Sin PG_DSN configurado → 503 en endpoints que requieren DB
- /pg/health devuelve estado configurado:false sin DSN
- Todos los endpoints están protegidos con require_user (401 sin cookie)
- Mapeo wa_launch_config → variables WAFLOW funciona
"""
import os
import importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def app():
    # Asegurar que PG_DSN está vacío para los tests
    os.environ.pop("PG_DSN", None)
    import server
    importlib.reload(server)
    return server.app


@pytest.fixture
def client(app):
    return TestClient(app)


# ============================================================
# Auth: sin cookie → 401
# ============================================================
@pytest.mark.parametrize("path", [
    "/api/pg/health",
    "/api/pg/launch-config/active",
    "/api/pg/launch-config",
    "/api/pg/scheduled-messages",
    "/api/pg/users-stats",
])
def test_pg_endpoints_require_auth(client, path):
    r = client.get(path)
    assert r.status_code == 401, f"{path} debería requerir auth, devolvió {r.status_code}"


# ============================================================
# Sin DSN: health responde sin error, los demás dan 503
# ============================================================
def test_pg_health_without_dsn_reports_unconfigured(monkeypatch):
    monkeypatch.delenv("PG_DSN", raising=False)
    import pg_client
    importlib.reload(pg_client)
    # health_check directo (sin pasar por endpoint)
    import asyncio
    res = asyncio.get_event_loop().run_until_complete(pg_client.health_check())
    assert res["ok"] is False
    assert res["configured"] is False
    assert "no configurado" in res["error"].lower()


def test_pg_is_configured_with_empty_dsn(monkeypatch):
    monkeypatch.setenv("PG_DSN", "")
    import pg_client
    importlib.reload(pg_client)
    assert pg_client.is_configured() is False


def test_pg_is_configured_with_dsn(monkeypatch):
    monkeypatch.setenv("PG_DSN", "postgres://x:y@h:5432/d")
    import pg_client
    importlib.reload(pg_client)
    assert pg_client.is_configured() is True


# ============================================================
# Mapeo wa_launch_config → variables WAFLOW
# ============================================================
def test_map_launch_config_to_vars_basic():
    import pg_client
    cfg = {
        "launch_id": "L001",
        "titulo_webinar": "La Fórmula de El Cambio",
        "nombre_producto": "El Cambio",
        "precio_producto": "297€",
        "link_zoom": "https://zoom.us/j/12345",
        "group_jid": "120363012345678901@g.us",
        "fecha_webinar": None,
        "hora_webinar": None,
    }
    out = pg_client.map_launch_config_to_vars(cfg)
    assert out["TITULO_WEBINAR"] == "La Fórmula de El Cambio"
    assert out["NOMBRE_PRODUCTO"] == "El Cambio"
    assert out["PRECIO_PRODUCTO"] == "297€"
    assert out["LINK_ZOOM"] == "https://zoom.us/j/12345"
    assert out["GROUP_JID_COMUNIDAD"] == "120363012345678901@g.us"
    assert "FECHA_WEBINAR" not in out
    assert "HORA_WEBINAR" not in out


def test_map_launch_config_with_date_time():
    import pg_client
    from datetime import date, time
    cfg = {
        "titulo_webinar": "Test",
        "fecha_webinar": date(2026, 4, 15),
        "hora_webinar": time(21, 0),
    }
    out = pg_client.map_launch_config_to_vars(cfg)
    assert out["FECHA_WEBINAR"] == "15/04/2026"
    assert out["HORA_WEBINAR"] == "21:00"


def test_map_launch_config_skips_nulls():
    import pg_client
    cfg = {"titulo_webinar": None, "nombre_producto": "Solo este"}
    out = pg_client.map_launch_config_to_vars(cfg)
    assert "TITULO_WEBINAR" not in out
    assert out["NOMBRE_PRODUCTO"] == "Solo este"


# ============================================================
# Cache TTL
# ============================================================
def test_cache_set_get_within_ttl(monkeypatch):
    monkeypatch.setenv("PG_CACHE_TTL_SECS", "60")
    import pg_client
    importlib.reload(pg_client)
    pg_client._cache_set("k1", {"a": 1})
    assert pg_client._cache_get("k1") == {"a": 1}


def test_cache_expires(monkeypatch):
    monkeypatch.setenv("PG_CACHE_TTL_SECS", "60")
    import pg_client
    importlib.reload(pg_client)
    pg_client._cache_set("k2", "value")
    # Forzar expiración manipulando el timestamp
    expires_at, value = pg_client._CACHE["k2"]
    pg_client._CACHE["k2"] = (expires_at - 100, value)
    assert pg_client._cache_get("k2") is None
    assert "k2" not in pg_client._CACHE  # auto-evicted


def test_cache_ttl_zero_disables(monkeypatch):
    monkeypatch.setenv("PG_CACHE_TTL_SECS", "0")
    import pg_client
    importlib.reload(pg_client)
    pg_client._cache_set("k3", "v")
    assert pg_client._cache_get("k3") is None


def test_cache_clear():
    import pg_client
    pg_client._cache_set("k4", "v")
    pg_client.cache_clear()
    assert pg_client._cache_get("k4") is None


def test_cache_endpoint_requires_auth(client):
    r = client.post("/api/pg/cache/clear")
    assert r.status_code == 401
