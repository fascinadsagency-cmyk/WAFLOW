"""PostgreSQL master-catalog read-only client.

Conecta al PostgreSQL externo del usuario (su bot WhatsApp en VPS) en modo
read-only. Tres tablas relevantes (Fase 1):
  - wa_launch_config: configuración del lanzamiento activo
  - wa_scheduled_messages: calendario de envíos reales
  - wa_users: leads/contactos por flujo

DSN se lee de env var PG_DSN (formato postgres://user:pass@host:port/db?sslmode=disable).
Si PG_DSN está vacío/no definido → endpoints devuelven 503.
"""
from __future__ import annotations
import os
import asyncpg
from typing import Optional, Dict, Any, List
import logging

_pool: Optional[asyncpg.Pool] = None
_pool_dsn: Optional[str] = None
log = logging.getLogger("waflow.pg")


def _get_dsn() -> Optional[str]:
    dsn = os.environ.get("PG_DSN")
    return dsn.strip() if dsn else None


def is_configured() -> bool:
    return bool(_get_dsn())


async def get_pool() -> Optional[asyncpg.Pool]:
    """Lazy-init del pool. Recrea si la DSN cambia (rotación de password sin reinicio)."""
    global _pool, _pool_dsn
    dsn = _get_dsn()
    if not dsn:
        return None
    if _pool is not None and _pool_dsn != dsn:
        try:
            await _pool.close()
        except Exception:
            pass
        _pool = None
    if _pool is None:
        try:
            _pool = await asyncpg.create_pool(
                dsn=dsn,
                min_size=1,
                max_size=4,
                timeout=8.0,
                command_timeout=8.0,
                # statement_cache_size=0 para PgBouncer compat (por si user usa pooler)
                statement_cache_size=0,
            )
            _pool_dsn = dsn
            log.info("PG pool created")
        except Exception as e:
            log.warning("PG pool creation failed: %s", e)
            return None
    return _pool


async def close_pool() -> None:
    global _pool, _pool_dsn
    if _pool is not None:
        try:
            await _pool.close()
        except Exception:
            pass
        _pool = None
        _pool_dsn = None


async def health_check() -> Dict[str, Any]:
    """Devuelve {ok, configured, version?, error?}."""
    if not is_configured():
        return {"ok": False, "configured": False, "error": "PG_DSN no configurado"}
    pool = await get_pool()
    if pool is None:
        return {"ok": False, "configured": True, "error": "No se pudo crear pool"}
    try:
        async with pool.acquire() as conn:
            version = await conn.fetchval("SELECT version()")
            return {"ok": True, "configured": True, "version": (version or "")[:80]}
    except Exception as e:
        return {"ok": False, "configured": True, "error": str(e)[:200]}


# ============================================================================
# Queries — todas READ-ONLY. Si el DSN apunta a un user con write, no usamos.
# ============================================================================

async def get_active_launch_config() -> Optional[Dict[str, Any]]:
    """Devuelve el launch_config con is_active=true (puede no haber ninguno)."""
    pool = await get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT launch_id, titulo_webinar, fecha_webinar, hora_webinar, "
            "       link_zoom, nombre_producto, precio_producto, is_active, group_jid "
            "FROM wa_launch_config WHERE is_active = TRUE LIMIT 1"
        )
        if not row:
            return None
        return dict(row)


async def list_launch_configs(limit: int = 20) -> List[Dict[str, Any]]:
    """Lista todos los launches (activos + históricos) ordenados por fecha desc."""
    pool = await get_pool()
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT launch_id, titulo_webinar, fecha_webinar, hora_webinar, "
            "       link_zoom, nombre_producto, precio_producto, is_active, group_jid "
            "FROM wa_launch_config "
            "ORDER BY fecha_webinar DESC NULLS LAST LIMIT $1",
            limit,
        )
        return [dict(r) for r in rows]


async def list_scheduled_messages(launch_id: Optional[str] = None, limit: int = 500) -> List[Dict[str, Any]]:
    """Lista mensajes programados (opcionalmente filtrados por launch_id)."""
    pool = await get_pool()
    if pool is None:
        return []
    async with pool.acquire() as conn:
        if launch_id:
            rows = await conn.fetch(
                "SELECT id, launch_id, tipo, step_enviar, estado, scheduled_at, "
                "       activo, total_enviados, total_errores "
                "FROM wa_scheduled_messages WHERE launch_id = $1 "
                "ORDER BY scheduled_at NULLS LAST LIMIT $2",
                launch_id, limit,
            )
        else:
            rows = await conn.fetch(
                "SELECT id, launch_id, tipo, step_enviar, estado, scheduled_at, "
                "       activo, total_enviados, total_errores "
                "FROM wa_scheduled_messages "
                "ORDER BY scheduled_at NULLS LAST LIMIT $1",
                limit,
            )
        return [dict(r) for r in rows]


def _build_users_filter(launch_id: Optional[str]) -> tuple:
    """Devuelve (where_clause, where_keyword, params)."""
    if launch_id:
        return "WHERE launch_id = $1", "AND", [launch_id]
    return "", "WHERE", []


async def _count_users(conn, where: str, params: list) -> int:
    return await conn.fetchval(f"SELECT COUNT(*) FROM wa_users {where}", *params) or 0


async def _count_users_with(conn, where: str, kw: str, condition: str, params: list) -> int:
    return await conn.fetchval(
        f"SELECT COUNT(*) FROM wa_users {where} {kw} {condition}", *params
    ) or 0


async def _group_count(conn, column: str, where: str, params: list, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    sql = f"SELECT {column}, COUNT(*) as n FROM wa_users {where} GROUP BY {column} ORDER BY n DESC"
    if limit:
        sql += f" LIMIT {int(limit)}"
    return [dict(r) for r in await conn.fetch(sql, *params)]


async def _top_tags(conn, where: str, params: list, limit: int = 20) -> List[Dict[str, Any]]:
    sql = (
        f"SELECT tag, COUNT(*) as n FROM ("
        f"  SELECT UNNEST(tags) as tag FROM wa_users {where}"
        f") t WHERE tag IS NOT NULL GROUP BY tag ORDER BY n DESC LIMIT {int(limit)}"
    )
    return [{"tag": r["tag"], "n": r["n"]} for r in await conn.fetch(sql, *params)]


def _format_step_buckets(rows: List[Dict[str, Any]], col: str) -> List[Dict[str, Any]]:
    return [{"step": r[col] or "(null)", "n": r["n"]} for r in rows]


def _calc_tasa_compra(compradores: int, total: int) -> float:
    if not total:
        return 0
    return round(compradores / total * 100, 2)


async def get_users_stats(launch_id: Optional[str] = None) -> Dict[str, Any]:
    """Estadísticas agregadas de wa_users (total, compradores, steps, tags, reactivaciones)."""
    pool = await get_pool()
    if pool is None:
        return {"configured": False}

    where, kw, params = _build_users_filter(launch_id)
    async with pool.acquire() as conn:
        total = await _count_users(conn, where, params)
        compradores = await _count_users_with(conn, where, kw, "es_comprador = TRUE", params)
        reactivaciones = await _count_users_with(conn, where, kw, "reactivacion_count > 0", params)
        flow_steps = await _group_count(conn, "flow_step", where, params)
        venta_steps = await _group_count(conn, "venta_step", where, params)
        tags = await _top_tags(conn, where, params, limit=20)

    return {
        "configured": True,
        "launch_id": launch_id,
        "total": total,
        "compradores": compradores,
        "tasa_compra_pct": _calc_tasa_compra(compradores, total),
        "reactivaciones": reactivaciones,
        "flow_steps": _format_step_buckets(flow_steps, "flow_step"),
        "venta_steps": _format_step_buckets(venta_steps, "venta_step"),
        "top_tags": tags,
    }


# Mapeo wa_launch_config → variables WAFLOW. Ajustable cuando aparezcan más tablas.
LAUNCH_CONFIG_TO_VARS = {
    "titulo_webinar": "TITULO_WEBINAR",
    "nombre_producto": "NOMBRE_PRODUCTO",
    "precio_producto": "PRECIO_PRODUCTO",
    "link_zoom": "LINK_ZOOM",
    "group_jid": "GROUP_JID_COMUNIDAD",
}


def map_launch_config_to_vars(cfg: Dict[str, Any]) -> Dict[str, str]:
    """Convierte un row de wa_launch_config en {VAR_NAME: value} listo para mergear."""
    out: Dict[str, str] = {}
    for col, var in LAUNCH_CONFIG_TO_VARS.items():
        v = cfg.get(col)
        if v is None:
            continue
        out[var] = str(v)
    # Combinar fecha + hora si ambas existen
    fecha = cfg.get("fecha_webinar")
    hora = cfg.get("hora_webinar")
    if fecha:
        out["FECHA_WEBINAR"] = fecha.strftime("%d/%m/%Y") if hasattr(fecha, "strftime") else str(fecha)
    if hora:
        out["HORA_WEBINAR"] = hora.strftime("%H:%M") if hasattr(hora, "strftime") else str(hora)
    return out
