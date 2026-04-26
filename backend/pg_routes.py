"""PostgreSQL routes — read-only catálogo maestro del bot WhatsApp.

Extraído de server.py para reducir su superficie de imports y separar
responsabilidades. Todos los endpoints requieren autenticación.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException

import pg_client as _pg
from auth_deps import require_user

router = APIRouter(prefix="/api/pg")


@router.get("/health")
async def pg_health(user: Dict[str, Any] = Depends(require_user)):
    return await _pg.health_check()


@router.post("/cache/clear")
async def pg_cache_clear(user: Dict[str, Any] = Depends(require_user)):
    """Invalida el cache TTL para forzar la próxima query a ir contra PG."""
    _pg.cache_clear()
    return {"ok": True}


def _ensure_configured() -> None:
    if not _pg.is_configured():
        raise HTTPException(status_code=503, detail="PG_DSN no configurado")


@router.get("/launch-config/active")
async def pg_launch_config_active(user: Dict[str, Any] = Depends(require_user)):
    _ensure_configured()
    cfg = await _pg.get_active_launch_config()
    if not cfg:
        return {"ok": True, "config": None, "vars": {}}
    return {"ok": True, "config": cfg, "vars": _pg.map_launch_config_to_vars(cfg)}


@router.get("/launch-config")
async def pg_launch_config_list(limit: int = 20, user: Dict[str, Any] = Depends(require_user)):
    _ensure_configured()
    return {"ok": True, "configs": await _pg.list_launch_configs(limit=min(max(limit, 1), 200))}


@router.get("/scheduled-messages")
async def pg_scheduled_messages(
    launch_id: Optional[str] = None,
    limit: int = 500,
    user: Dict[str, Any] = Depends(require_user),
):
    _ensure_configured()
    return {"ok": True, "messages": await _pg.list_scheduled_messages(launch_id, limit=min(max(limit, 1), 5000))}


@router.get("/users-stats")
async def pg_users_stats(launch_id: Optional[str] = None, user: Dict[str, Any] = Depends(require_user)):
    _ensure_configured()
    return {"ok": True, "stats": await _pg.get_users_stats(launch_id)}
