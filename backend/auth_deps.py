"""FastAPI auth dependencies — `require_user` y `require_admin`.

Extraído de server.py para poder importarse desde routes/ sin import circular.
"""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from db_setup import db

SESSION_COOKIE_NAME = "waflow_session"
SESSION_DURATION_DAYS = 7


def _extract_session_token(request: Request) -> Optional[str]:
    """Cookie (preferente) → Authorization: Bearer (fallback)."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        return token
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None


def _parse_expires_at(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    if isinstance(raw, str):
        try:
            raw = datetime.fromisoformat(raw)
        except Exception:
            return None
    if raw.tzinfo is None:
        raw = raw.replace(tzinfo=timezone.utc)
    return raw


async def _get_session_from_request(request: Request) -> Optional[Dict[str, Any]]:
    """Devuelve el user doc (sin _id) si hay sesión válida; None si no."""
    token = _extract_session_token(request)
    if not token:
        return None
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = _parse_expires_at(session.get("expires_at"))
    if expires_at and expires_at < datetime.now(timezone.utc):
        await db.user_sessions.delete_one({"session_token": token})
        return None
    return await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})


async def require_user(request: Request) -> Dict[str, Any]:
    user = await _get_session_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


async def require_admin(request: Request) -> Dict[str, Any]:
    user = await require_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo el admin puede hacer esta acción")
    return user
