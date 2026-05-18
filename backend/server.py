from fastapi import FastAPI, APIRouter, HTTPException, Query, Request, Response as FastAPIResponse, Depends
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import re as _re

# Setup centralizado: db client + auth deps
from db_setup import client, db
from auth_deps import (
    SESSION_COOKIE_NAME,
    SESSION_DURATION_DAYS,
    require_user,
    require_admin,
)
import pg_client as _pg
import pg_routes

app = FastAPI(title="WhatsApp Flow Editor API")
api_router = APIRouter(prefix="/api")


# ============================================================
# AUTH HELPERS — definidos en auth_deps.py para usarse desde routes/.
# Re-exportados arriba.
# ============================================================


# ============================================================
# KEY-VALUE STORAGE (reemplaza window.storage)
# Colecciones:
#   storage_shared: entradas compartidas entre todo el equipo
# ============================================================
class StorageSetBody(BaseModel):
    key: str
    value: str  # siempre string (el frontend hace JSON.stringify)
    shared: bool = True


class StorageDeleteBody(BaseModel):
    key: str
    shared: bool = True


@api_router.post("/storage/set")
async def storage_set(body: StorageSetBody, user: Dict[str, Any] = Depends(require_user)):
    now = datetime.now(timezone.utc).isoformat()
    await db.storage_shared.update_one(
        {"key": body.key},
        {"$set": {"key": body.key, "value": body.value, "updated_at": now}},
        upsert=True,
    )
    return {"ok": True, "key": body.key}


@api_router.get("/storage/get")
async def storage_get(key: str = Query(...), shared: bool = Query(True), user: Dict[str, Any] = Depends(require_user)):
    doc = await db.storage_shared.find_one({"key": key}, {"_id": 0})
    if not doc:
        return {"value": None}
    return {"value": doc.get("value")}


@api_router.post("/storage/delete")
async def storage_delete(body: StorageDeleteBody, user: Dict[str, Any] = Depends(require_user)):
    await db.storage_shared.delete_one({"key": body.key})
    return {"ok": True}


# ============================================================
# AI CHAT — test del Prompt IA usando Emergent LLM key (Claude Sonnet 4.5)
# ============================================================
class AIChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    text: str


class AIChatBody(BaseModel):
    system_prompt: str
    messages: List[AIChatMessage]
    session_id: Optional[str] = None
    model_provider: str = "anthropic"
    model_name: str = "claude-sonnet-4-5-20250929"


def _build_llm_chat_final_text(messages: List["AIChatMessage"]) -> str:
    """Convierte el historial multi-turn en un bloque textual + último user message.
    Cada llamada crea nueva instancia LlmChat, así que pasamos toda la historia como contexto."""
    if len(messages) <= 1:
        return messages[-1].text
    history_lines: List[str] = []
    for m in messages[:-1]:
        prefix = "Usuario" if m.role == "user" else "Asistente"
        history_lines.append(f"{prefix}: {m.text}")
    history_block = "\n".join(history_lines)
    return f"Historia previa:\n{history_block}\n\nUsuario ahora: {messages[-1].text}"


@api_router.post("/ai/test-chat")
async def ai_test_chat(body: AIChatBody, user: Dict[str, Any] = Depends(require_user)):
    """Envía el último mensaje del usuario al modelo con el system prompt (multi-turn stateless)."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"emergentintegrations no disponible: {e}")

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY no configurado")

    user_msgs = [m for m in body.messages if m.role == "user"]
    if not user_msgs:
        raise HTTPException(status_code=400, detail="Se requiere al menos un mensaje del usuario")

    session_id = body.session_id or str(uuid.uuid4())
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=body.system_prompt or "Eres un asistente útil.",
    ).with_model(body.model_provider, body.model_name)

    try:
        final_text = _build_llm_chat_final_text(body.messages)
        response = await chat.send_message(UserMessage(text=final_text))
        return {
            "ok": True,
            "session_id": session_id,
            "response": response,
            "provider": body.model_provider,
            "model": body.model_name,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("AI chat error")
        raise HTTPException(status_code=500, detail=f"Error LLM: {e}")


# ============================================================
# EVENTS — webhooks de n8n para monitoring "Salud"
# ============================================================
class EventBody(BaseModel):
    event: str
    user_id: Optional[str] = None
    flow: Optional[str] = None
    msg_id: Optional[str] = None
    timestamp: Optional[str] = None
    error: Optional[str] = None
    project_id: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


@api_router.post("/events")
async def post_event(body: EventBody):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    if not doc.get("timestamp"):
        doc["timestamp"] = datetime.now(timezone.utc).isoformat()
    await db.events.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@api_router.get("/events")
async def list_events(
    project_id: Optional[str] = None,
    flow: Optional[str] = None,
    limit: int = 500,
    user: Dict[str, Any] = Depends(require_user),
):
    q: Dict[str, Any] = {}
    if project_id:
        q["project_id"] = project_id
    if flow:
        q["flow"] = flow
    cursor = db.events.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit)
    return await cursor.to_list(limit)


# ============================================================
# WHATSAPP — relay opcional a Meta Graph API
# Se envía access_token + phone_number_id desde el cliente (no se guarda).
# ============================================================
class WhatsAppSendBody(BaseModel):
    access_token: str
    phone_number_id: str
    to: str  # número destino formato E.164 sin +
    message: str


@api_router.post("/whatsapp/send")
async def whatsapp_send(body: WhatsAppSendBody, user: Dict[str, Any] = Depends(require_user)):
    """Relay para evitar problemas CORS desde el navegador.
    Envía un mensaje de texto por WhatsApp Cloud API."""
    url = f"https://graph.facebook.com/v21.0/{body.phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": body.to,
        "type": "text",
        "text": {"body": body.message},
    }
    headers = {
        "Authorization": f"Bearer {body.access_token}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client_http:
            r = await client_http.post(url, json=payload, headers=headers)
            data = r.json() if r.content else {}
            return {"ok": r.status_code < 400, "status": r.status_code, "response": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error Meta API: {e}")


class WhatsAppTemplateSendBody(BaseModel):
    project_id: str
    template_name: str
    language: str = "es"
    to_phone: str  # E.164 sin +
    params: List[str] = []  # valores ordenados para {{1}}, {{2}}...
    header_media_url: Optional[str] = None
    header_media_type: Optional[str] = None  # "image" | "video" | "document"


def _build_template_header_component(header_media_url: Optional[str], header_media_type: Optional[str]) -> Optional[Dict[str, Any]]:
    if not header_media_url or not header_media_type:
        return None
    mt = header_media_type.lower()
    media_key = {"image": "image", "video": "video", "document": "document"}.get(mt)
    if not media_key:
        return None
    return {
        "type": "header",
        "parameters": [{"type": media_key, media_key: {"link": header_media_url}}],
    }


def _build_template_body_component(params: List[str]) -> Optional[Dict[str, Any]]:
    if not params:
        return None
    return {
        "type": "body",
        "parameters": [{"type": "text", "text": strip_emojis(str(p))[:1024]} for p in params],
    }


def _build_meta_send_template_payload(body: "WhatsAppTemplateSendBody", to: str) -> Dict[str, Any]:
    components: List[Dict[str, Any]] = []
    header = _build_template_header_component(body.header_media_url, body.header_media_type)
    if header:
        components.append(header)
    body_c = _build_template_body_component(body.params or [])
    if body_c:
        components.append(body_c)

    return {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": body.template_name,
            "language": {"code": body.language or "es"},
            **({"components": components} if components else {}),
        },
    }


async def _post_meta_send(hc: httpx.AsyncClient, phone_id: str, access_token: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    r = await hc.post(
        f"https://graph.facebook.com/v21.0/{phone_id}/messages",
        json=payload,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
    )
    data = r.json() if r.content else {}
    if r.status_code < 400:
        return {"ok": True, "message_id": (data.get("messages") or [{}])[0].get("id"), "response": data}
    err_msg = (data.get("error") or {}).get("message") or str(data)[:300]
    return {"ok": False, "status": r.status_code, "error": err_msg, "response": data}


@api_router.post("/whatsapp/send-template")
async def whatsapp_send_template(body: WhatsAppTemplateSendBody, user: Dict[str, Any] = Depends(require_user)):
    """Envía una plantilla Meta ya aprobada con parámetros rellenos al teléfono destino."""
    connections = await _read_storage(f"wa_editor:p:{body.project_id}:connections") or {}
    phone_id = connections.get("phoneNumberId")
    access_token = connections.get("accessToken")
    if not phone_id or not access_token:
        raise HTTPException(status_code=400, detail="Faltan Phone Number ID y/o Access Token en Conexiones.")

    to = _re.sub(r"\D", "", body.to_phone or "")
    if not to:
        raise HTTPException(status_code=400, detail="Teléfono destino inválido (E.164 sin +).")

    payload = _build_meta_send_template_payload(body, to)
    try:
        async with httpx.AsyncClient(timeout=15.0) as hc:
            return await _post_meta_send(hc, phone_id, access_token, payload)
    except Exception as e:
        return {"ok": False, "error": f"Error Meta API: {str(e)[:300]}"}


# ============================================================
# TEST CONNECTION — validar credenciales antes de lanzar
# ============================================================
class TestConnectionBody(BaseModel):
    type: str  # "meta" | "evolution" | "n8n_webhook"
    config: Dict[str, Any]


@api_router.post("/test-connection")
async def test_connection(body: TestConnectionBody, user: Dict[str, Any] = Depends(require_user)):
    handlers = {
        "meta": _test_meta_connection,
        "evolution": _test_evolution_connection,
        "n8n_webhook": _test_n8n_connection,
    }
    handler = handlers.get(body.type)
    if not handler:
        return {"ok": False, "error": f"Tipo desconocido: {body.type}"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as hc:
            return await handler(hc, body.config or {})
    except httpx.TimeoutException:
        return {"ok": False, "error": "Timeout. ¿El servidor está online?"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


async def _test_meta_connection(hc: httpx.AsyncClient, config: Dict[str, Any]) -> Dict[str, Any]:
    phone_id = config.get("phone_number_id") or config.get("phoneNumberId")
    token = config.get("access_token") or config.get("accessToken")
    if not phone_id or not token:
        return {"ok": False, "error": "Faltan phone_number_id o access_token"}
    r = await hc.get(
        f"https://graph.facebook.com/v21.0/{phone_id}",
        params={"fields": "verified_name,display_phone_number,quality_rating"},
        headers={"Authorization": f"Bearer {token}"},
    )
    data = r.json() if r.content else {}
    if r.status_code < 400:
        return {
            "ok": True,
            "detail": (
                f"Número verificado: {data.get('display_phone_number', '—')} · "
                f"{data.get('verified_name', '—')} · calidad {data.get('quality_rating', '—')}"
            ),
        }
    return {"ok": False, "error": f"Meta API: {data.get('error', {}).get('message', r.text[:200])}"}


async def _test_evolution_connection(hc: httpx.AsyncClient, config: Dict[str, Any]) -> Dict[str, Any]:
    server = (config.get("server_url") or "").rstrip("/")
    apikey = config.get("api_key")
    instance = config.get("instance")
    if not all([server, apikey, instance]):
        return {"ok": False, "error": "Faltan server_url, api_key o instance"}
    r = await hc.get(
        f"{server}/instance/connectionState/{instance}",
        headers={"apikey": apikey},
    )
    data = r.json() if r.content else {}
    if r.status_code < 400:
        state = (data.get("instance") or {}).get("state") or data.get("state", "unknown")
        return {"ok": state == "open", "detail": f"Instancia '{instance}' · estado: {state}"}
    return {"ok": False, "error": f"Evolution: HTTP {r.status_code} — {str(data)[:200]}"}


async def _test_n8n_connection(hc: httpx.AsyncClient, config: Dict[str, Any]) -> Dict[str, Any]:
    url = config.get("url")
    if not url:
        return {"ok": False, "error": "Falta URL del webhook"}
    r = await hc.post(
        url,
        json={"_waflow_test": True, "ts": datetime.now(timezone.utc).isoformat()},
        headers={"X-WAFLOW-Test": "1"},
    )
    return {"ok": r.status_code < 400, "detail": f"HTTP {r.status_code} — webhook responde"}


# ============================================================
# EVOLUTION API — relay para envíos masivos a grupos/comunidades
# Se usa SOLO en flows 'broadcasts' y 'venta_comunidad' para evitar
# bans en Meta Cloud API. Self-hosted, las credenciales se pasan en la
# petición (no se guardan en backend por seguridad; las guarda el cliente).
# ============================================================
class EvolutionSendBody(BaseModel):
    server_url: str              # p.ej. https://evolution.miserver.com
    api_key: str
    instance: str                # nombre de la instancia
    to: str                      # número E.164 (34612345678) o JID (xxx@g.us)
    message: str
    delay_ms: Optional[int] = 0  # delay before send


@api_router.post("/evolution/send")
async def evolution_send(body: EvolutionSendBody, user: Dict[str, Any] = Depends(require_user)):
    url = f"{body.server_url.rstrip('/')}/message/sendText/{body.instance}"
    payload: Dict[str, Any] = {"number": body.to, "text": body.message}
    if body.delay_ms and body.delay_ms > 0:
        payload["delay"] = body.delay_ms
    headers = {"apikey": body.api_key, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as hc:
            r = await hc.post(url, json=payload, headers=headers)
            data: Any = {}
            try:
                data = r.json()
            except Exception:
                data = {"raw": r.text[:500]}
            return {"ok": r.status_code < 400, "status": r.status_code, "response": data, "endpoint": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error Evolution API: {e}")


# ============================================================
# REVIEW SIGN — firmado al 100% que cierra el link y genera hash
# ============================================================
import hashlib


class ReviewSignBody(BaseModel):
    signer_name: str
    signer_role: Optional[str] = ""


@api_router.post("/review/{token}/sign")
async def review_sign(token: str, body: ReviewSignBody):
    rec = await db.review_tokens.find_one({"token": token}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Link no válido")
    if rec.get("locked"):
        raise HTTPException(status_code=423, detail="La revisión ya está firmada y cerrada")

    pid = rec["project_id"]
    approval = await _read_storage(f"wa_editor:p:{pid}:approval") or {}
    edits = await _read_storage(f"wa_editor:p:{pid}:edits") or {}

    # Hash determinista del contenido firmado: aprovals + edits + signer + timestamp
    now_iso = datetime.now(timezone.utc).isoformat()
    canonical = _json.dumps(
        {"approval": approval, "edits": edits, "signer": body.signer_name, "signed_at": now_iso},
        sort_keys=True, ensure_ascii=False,
    )
    sig_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    await db.review_tokens.update_one(
        {"token": token},
        {"$set": {
            "locked": True,
            "signed_at": now_iso,
            "signer_name": body.signer_name,
            "signer_role": body.signer_role or "",
            "signature_hash": sig_hash,
            "signed_stats": {
                "total_reviewed": len(approval),
                "approved": sum(1 for v in approval.values() if (v or {}).get("status") == "approved"),
                "changes": sum(1 for v in approval.values() if (v or {}).get("status") == "changes"),
            },
        }},
    )
    return {
        "ok": True,
        "signed_at": now_iso,
        "signer_name": body.signer_name,
        "signature_hash": sig_hash,
    }


# ============================================================
# MAGIC REVIEW LINK — token público para que el cliente apruebe copys
# Tokens viven en colección review_tokens. El cliente accede por
# /review/:token en el frontend, que llama a estos endpoints.
# ============================================================
import json as _json
import secrets

PROJECTS_LIST_KEY = "wa_editor:projects_list"


async def _read_storage(key: str):
    doc = await db.storage_shared.find_one({"key": key}, {"_id": 0})
    if not doc:
        return None
    try:
        return _json.loads(doc["value"])
    except Exception:
        return None


async def _write_storage(key: str, value: Any):
    now = datetime.now(timezone.utc).isoformat()
    await db.storage_shared.update_one(
        {"key": key},
        {"$set": {"key": key, "value": _json.dumps(value), "updated_at": now}},
        upsert=True,
    )


class ReviewCreateBody(BaseModel):
    project_id: str


@api_router.post("/review/create")
async def review_create(body: ReviewCreateBody):
    # Buscar token existente
    existing = await db.review_tokens.find_one({"project_id": body.project_id}, {"_id": 0})
    if existing:
        return {"token": existing["token"], "path": f"/review/{existing['token']}", "reused": True}
    token = secrets.token_urlsafe(18)
    await db.review_tokens.insert_one({
        "token": token,
        "project_id": body.project_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"token": token, "path": f"/review/{token}", "reused": False}


@api_router.get("/review/{token}")
async def review_get(token: str):
    rec = await db.review_tokens.find_one({"token": token}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Link no válido o expirado")
    pid = rec["project_id"]

    projects = await _read_storage(PROJECTS_LIST_KEY) or []
    project = next((p for p in projects if p.get("id") == pid), None)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    # Sanitizar proyecto (quitar notas internas)
    safe_project = {
        "id": project.get("id"),
        "name": project.get("name"),
        "client": project.get("client"),
        "emoji": project.get("emoji"),
        "color": project.get("color"),
        "strategy": project.get("strategy", "webinar"),
    }

    vars_data = await _read_storage(f"wa_editor:p:{pid}:vars") or []
    edits_data = await _read_storage(f"wa_editor:p:{pid}:edits") or {}
    approval_data = await _read_storage(f"wa_editor:p:{pid}:approval") or {}
    custom_msgs = await _read_storage(f"wa_editor:p:{pid}:custom_msgs") or {}

    signature = None
    if rec.get("locked"):
        signature = {
            "signed_at": rec.get("signed_at"),
            "signer_name": rec.get("signer_name"),
            "signer_role": rec.get("signer_role"),
            "signature_hash": rec.get("signature_hash"),
            "signed_stats": rec.get("signed_stats", {}),
        }

    return {
        "project": safe_project,
        "vars": vars_data,
        "edits": edits_data,
        "approval": approval_data,
        "custom_msgs": custom_msgs,
        "locked": bool(rec.get("locked")),
        "signature": signature,
    }


class ReviewApprovalBody(BaseModel):
    msgKey: str
    status: Optional[str] = None  # 'approved' | 'changes' | null (borrar)
    by: Optional[str] = "Cliente"
    comment: Optional[str] = None


@api_router.post("/review/{token}/approve")
async def review_approve(token: str, body: ReviewApprovalBody):
    rec = await db.review_tokens.find_one({"token": token}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Link no válido")
    if rec.get("locked"):
        raise HTTPException(status_code=423, detail="La revisión ya está firmada y cerrada")
    pid = rec["project_id"]
    key = f"wa_editor:p:{pid}:approval"
    approval = await _read_storage(key) or {}

    if body.status is None:
        approval.pop(body.msgKey, None)
    else:
        entry = {"status": body.status, "by": body.by or "Cliente", "at": int(datetime.now(timezone.utc).timestamp() * 1000)}
        if body.comment:
            entry["comment"] = body.comment
        approval[body.msgKey] = entry

    await _write_storage(key, approval)
    return {"ok": True, "approval": approval.get(body.msgKey)}


# ============================================================
# NOTIFY — al 80% de aprobaciones el cliente puede disparar webhooks
# a Slack / Discord configurados por el equipo en ConnectionsPanel.
# ============================================================
class NotifyBody(BaseModel):
    approved: int
    total: int
    project_name: Optional[str] = ""


async def _post_webhook(hc: httpx.AsyncClient, url: str, payload: Dict[str, Any]) -> Any:
    try:
        r = await hc.post(url, json=payload)
        return r.status_code
    except Exception as e:
        return f"err: {e}"


@api_router.post("/review/{token}/notify")
async def review_notify(token: str, body: NotifyBody):
    rec = await db.review_tokens.find_one({"token": token}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Link no válido")
    pid = rec["project_id"]

    notify_config = await _read_storage(f"wa_editor:p:{pid}:notify_config") or {}
    if notify_config.get("notified_80_at"):
        return {"ok": True, "already_notified": True}

    pct = (body.approved / body.total * 100) if body.total else 0
    if pct < 80:
        return {"ok": True, "notified": False, "pct": pct}

    message = (
        f"🎉 *WAFLOW · {body.project_name or 'Proyecto'}*\n"
        f"El cliente ha aprobado *{body.approved}/{body.total}* mensajes "
        f"({pct:.0f}%). ¡Podéis cerrar la revisión!"
    )

    slack_url = notify_config.get("slack_url")
    discord_url = notify_config.get("discord_url")
    results: Dict[str, Any] = {"slack": None, "discord": None}
    async with httpx.AsyncClient(timeout=10.0) as hc:
        if slack_url:
            results["slack"] = await _post_webhook(hc, slack_url, {"text": message})
        if discord_url:
            results["discord"] = await _post_webhook(hc, discord_url, {"content": message})

    notify_config["notified_80_at"] = datetime.now(timezone.utc).isoformat()
    notify_config["notified_stats"] = {"approved": body.approved, "total": body.total, "pct": pct}
    await _write_storage(f"wa_editor:p:{pid}:notify_config", notify_config)

    return {"ok": True, "notified": True, "pct": pct, "targets": results}


# ============================================================
# PDF SUMMARY — resumen descargable de la revisión
# ============================================================
@api_router.get("/review/{token}/summary.pdf")
async def review_summary_pdf(token: str):
    from fastapi.responses import Response
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate
    from io import BytesIO

    rec = await db.review_tokens.find_one({"token": token}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Link no válido")
    pid = rec["project_id"]

    projects = await _read_storage(PROJECTS_LIST_KEY) or []
    project = next((p for p in projects if p.get("id") == pid), None)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    vars_list = await _read_storage(f"wa_editor:p:{pid}:vars") or []
    edits = await _read_storage(f"wa_editor:p:{pid}:edits") or {}
    approval = await _read_storage(f"wa_editor:p:{pid}:approval") or {}

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm, leftMargin=2*cm, rightMargin=2*cm)
    styles = _pdf_styles()
    story = []
    story.extend(_pdf_header(project, styles))
    story.extend(_pdf_stats_table(approval, styles))
    story.extend(_pdf_messages_section(approval, edits, vars_list, styles))
    story.extend(_pdf_signature_section(rec, styles))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()

    filename = f"WAFLOW_{(project.get('name') or 'review').replace(' ', '_')}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_styles():
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    base = getSampleStyleSheet()
    return {
        "base": base,
        "title": ParagraphStyle("title", parent=base["Heading1"], textColor=colors.HexColor("#4F46E5"), spaceAfter=6),
        "meta": ParagraphStyle("meta", parent=base["Normal"], textColor=colors.HexColor("#6B7280"), fontSize=9),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], textColor=colors.HexColor("#111827"), spaceBefore=12, spaceAfter=6),
        "body": ParagraphStyle("body", parent=base["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#1F2937")),
        "note": ParagraphStyle("note", parent=base["Italic"], fontSize=9, textColor=colors.HexColor("#92400E"), leftIndent=10),
    }


def _pdf_header(project, styles):
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, Spacer
    return [
        Paragraph("WAFLOW · Resumen de revisión", styles["title"]),
        Paragraph(f"<b>Proyecto:</b> {project.get('name','?')} · <b>Cliente:</b> {project.get('client') or '—'}", styles["meta"]),
        Paragraph(f"Generado: {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}", styles["meta"]),
        Spacer(1, 0.4*cm),
    ]


def _pdf_stats_table(approval, styles):
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle, Spacer, Paragraph
    total = len(approval)
    approved = sum(1 for v in approval.values() if (v or {}).get("status") == "approved")
    changes = sum(1 for v in approval.values() if (v or {}).get("status") == "changes")
    t = Table(
        [["Estado", "Cantidad"], ["✓ Aprobados", str(approved)], ["✎ Con cambios", str(changes)], ["Total revisados", str(total)]],
        colWidths=[6*cm, 3*cm],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4F46E5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F9FAFB")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    return [t, Spacer(1, 0.5*cm), Paragraph("Detalle por mensaje", styles["h2"])]


def _pdf_render_vars(text: str, vars_list: List[Dict[str, Any]]) -> str:
    if not text:
        return ""
    out = text
    for v in vars_list:
        name = v.get("name")
        if not name:
            continue
        out = out.replace("{" + name + "}", str(v.get("value") or f"{{{name}}}"))
    return out


def _pdf_status_metadata(status: Optional[str]) -> tuple:
    """Devuelve (label, color) para un status de approval."""
    from reportlab.lib import colors
    if status == "approved":
        return "✓ APROBADO", colors.HexColor("#059669")
    if status == "changes":
        return "✎ CAMBIOS", colors.HexColor("#B45309")
    return "—", colors.HexColor("#6B7280")


def _pdf_render_message_block(msg_key: str, approval_entry: Dict[str, Any], edited_copy: Optional[str], vars_list: List[Dict[str, Any]], styles):
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, Spacer
    label, color = _pdf_status_metadata(approval_entry.get("status"))
    block = [
        Paragraph(
            f"<font name='Courier-Bold' color='#111827'>{msg_key}</font> · "
            f"<font color='{color.hexval()[2:]}'><b>{label}</b></font>",
            styles["body"],
        ),
        Paragraph(f"<font color='#6B7280' size='9'>Revisado por: {approval_entry.get('by', '—')}</font>", styles["meta"]),
    ]
    if edited_copy:
        block.append(Spacer(1, 0.1 * cm))
        block.append(Paragraph(_pdf_render_vars(edited_copy, vars_list).replace("\n", "<br/>"), styles["body"]))
    if approval_entry.get("comment"):
        block.append(Spacer(1, 0.1 * cm))
        block.append(Paragraph(f"<b>Nota del cliente:</b> {approval_entry['comment']}", styles["note"]))
    block.append(Spacer(1, 0.3 * cm))
    return block


def _pdf_messages_section(approval, edits, vars_list, styles):
    from reportlab.platypus import Paragraph
    if not approval:
        return [Paragraph("Sin mensajes revisados todavía.", styles["meta"])]
    story = []
    for msg_key in sorted(approval.keys()):
        entry = approval[msg_key] or {}
        story.extend(_pdf_render_message_block(msg_key, entry, edits.get(msg_key), vars_list, styles))
    return story


def _pdf_signature_section(rec, styles):
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
    if not rec.get("locked"):
        return []
    sig_data = [
        ["Firmado por", rec.get("signer_name", "—")],
        ["Rol", rec.get("signer_role") or "—"],
        ["Fecha y hora (UTC)", rec.get("signed_at", "—")],
        ["Hash SHA-256", rec.get("signature_hash", "—")],
        ["Estado", "🔐 Revisión cerrada y firmada"],
    ]
    tsig = Table(sig_data, colWidths=[4.5*cm, 12*cm])
    tsig.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F4F6")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#111827")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("PADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return [
        Spacer(1, 0.8*cm),
        Paragraph("Firma digital de aprobación", styles["h2"]),
        tsig,
        Spacer(1, 0.2*cm),
        Paragraph(
            "<font color='#6B7280' size='8'>Este hash certifica la integridad del contenido aprobado en el momento de la firma. "
            "Cualquier modificación posterior al contenido invalidaría la firma.</font>",
            styles["meta"],
        ),
    ]


# ============================================================
# LAUNCH — modo lanzamiento activo: deploy + polling + auto-freeze
# ============================================================
class LaunchDeployBody(BaseModel):
    project_id: str
    project_name: str
    workflow_json: Dict[str, Any]
    n8n_webhook_url: str
    snapshot_id: Optional[str] = None


@api_router.post("/launch/deploy")
async def launch_deploy(body: LaunchDeployBody, user: Dict[str, Any] = Depends(require_user)):
    """Envía el workflow JSON al webhook de despliegue de n8n del usuario.
    n8n debe tener un Webhook node configurado que acepte el workflow y:
    - (A) lo cree vía /rest/workflows (n8n API), o
    - (B) simplemente lo almacene para revisión manual.
    Guarda el estado del launch en storage_shared para que el frontend pueda pollear.
    """
    launch_id = secrets.token_urlsafe(12)
    started_at = datetime.now(timezone.utc).isoformat()

    relay_result: Dict[str, Any] = {"ok": False, "status": None}
    try:
        async with httpx.AsyncClient(timeout=20.0) as hc:
            r = await hc.post(
                body.n8n_webhook_url,
                json={
                    "launch_id": launch_id,
                    "project_id": body.project_id,
                    "project_name": body.project_name,
                    "snapshot_id": body.snapshot_id,
                    "workflow": body.workflow_json,
                    "triggered_at": started_at,
                },
            )
            relay_result = {
                "ok": r.status_code < 400,
                "status": r.status_code,
                "response": (r.json() if r.content and r.headers.get("content-type", "").startswith("application/json") else r.text[:400]),
            }
    except Exception as e:
        relay_result = {"ok": False, "status": 0, "error": str(e)}

    launch = {
        "launch_id": launch_id,
        "project_id": body.project_id,
        "snapshot_id": body.snapshot_id,
        "started_at": started_at,
        "status": "running" if relay_result["ok"] else "deploy_failed",
        "deploy_result": relay_result,
        "n8n_webhook_url_masked": body.n8n_webhook_url[:40] + "…" if len(body.n8n_webhook_url) > 40 else body.n8n_webhook_url,
        "auto_frozen": False,
    }
    await _write_storage(f"wa_editor:p:{body.project_id}:active_launch", launch)
    return {"ok": relay_result["ok"], "launch_id": launch_id, "status": launch["status"], "deploy_result": relay_result}


@api_router.get("/launch/{project_id}/status")
async def launch_status(project_id: str, user: Dict[str, Any] = Depends(require_user)):
    """Estado del lanzamiento activo + stats agregados de /api/events del proyecto."""
    launch = await _read_storage(f"wa_editor:p:{project_id}:active_launch")
    if not launch:
        return {"active": False}

    # Stats desde events del proyecto — aggregation en MongoDB (sin límite de 5000)
    pipeline = [
        {"$match": {"project_id": project_id}},
        {"$group": {"_id": "$event", "count": {"$sum": 1}}},
    ]
    counts_by_event = {doc["_id"]: doc["count"] async for doc in db.events.aggregate(pipeline)}
    stats = {
        "sent": counts_by_event.get("message_sent", 0),
        "delivered": counts_by_event.get("message_delivered", 0),
        "read": counts_by_event.get("message_read", 0),
        "failed": counts_by_event.get("message_failed", 0),
        "clicked": counts_by_event.get("button_clicked", 0),
        "replied": counts_by_event.get("reply_received", 0),
        "total_events": sum(counts_by_event.values()),
    }
    delivery_rate = round((stats["delivered"] / stats["sent"] * 100), 1) if stats["sent"] > 0 else 0
    read_rate = round((stats["read"] / stats["delivered"] * 100), 1) if stats["delivered"] > 0 else 0

    return {
        "active": True,
        "launch": launch,
        "stats": stats,
        "delivery_rate": delivery_rate,
        "read_rate": read_rate,
    }


class LaunchCompleteBody(BaseModel):
    project_id: str
    reason: Optional[str] = "manual"


@api_router.post("/launch/complete")
async def launch_complete(body: LaunchCompleteBody, user: Dict[str, Any] = Depends(require_user)):
    """Marca el launch como completado (manual o auto). Archiva en histórico y BORRA active_launch."""
    launch = await _read_storage(f"wa_editor:p:{body.project_id}:active_launch")
    if not launch:
        raise HTTPException(status_code=404, detail="No hay launch activo")
    launch["status"] = "completed"
    launch["completed_at"] = datetime.now(timezone.utc).isoformat()
    launch["complete_reason"] = body.reason
    # Archivar en histórico (últimos 20)
    history_key = f"wa_editor:p:{body.project_id}:launch_history"
    history = await _read_storage(history_key) or []
    history.insert(0, launch)
    await _write_storage(history_key, history[:20])
    # Borrar active_launch (ya no está activo)
    await db.storage_shared.delete_one({"key": f"wa_editor:p:{body.project_id}:active_launch"})
    return {"ok": True, "launch": launch}


@api_router.post("/launch/{project_id}/stop")
async def launch_stop(project_id: str, user: Dict[str, Any] = Depends(require_user)):
    """Cancela el launch activo. Archiva en histórico y BORRA active_launch."""
    launch = await _read_storage(f"wa_editor:p:{project_id}:active_launch")
    if not launch:
        raise HTTPException(status_code=404, detail="No hay launch activo")
    launch["status"] = "stopped"
    launch["stopped_at"] = datetime.now(timezone.utc).isoformat()
    history_key = f"wa_editor:p:{project_id}:launch_history"
    history = await _read_storage(history_key) or []
    history.insert(0, launch)
    await _write_storage(history_key, history[:20])
    await db.storage_shared.delete_one({"key": f"wa_editor:p:{project_id}:active_launch"})
    return {"ok": True, "launch": launch}


# ============================================================
# CLIENT INTAKE — checklist colaborativo agencia ↔ cliente
# Link público /intake/{token} donde el cliente rellena variables + sube creativos.
# Flujo: agencia marca qué pedir (mixto auto+manual) → cliente rellena →
# pending review → agencia aprueba → aplica al proyecto.
# ============================================================
import secrets as _secrets
from fastapi import UploadFile, File, Form
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

_gridfs_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="intake_files")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


class IntakeCreateBody(BaseModel):
    project_id: str
    items: List[Dict[str, Any]]  # [{id, type:'variable'|'creative', key, label, section, example?, requested: bool}]


class IntakeUpdateItemsBody(BaseModel):
    items: List[Dict[str, Any]]


class IntakeClientSaveBody(BaseModel):
    item_id: str
    value: Optional[str] = None  # None para borrar


class IntakeReviewBody(BaseModel):
    item_id: str
    action: str  # "approve" | "reject"
    comment: Optional[str] = None


async def _get_intake(token: str) -> Dict[str, Any]:
    rec = await db.intake_tokens.find_one({"token": token}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Link de intake no válido")
    return rec


@api_router.post("/intake/create")
async def intake_create(body: IntakeCreateBody, user: Dict[str, Any] = Depends(require_user)):
    """Agencia crea o reemplaza el intake del proyecto. Devuelve token."""
    existing = await db.intake_tokens.find_one({"project_id": body.project_id}, {"_id": 0})
    token = existing["token"] if existing else _secrets.token_urlsafe(18)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "token": token,
        "project_id": body.project_id,
        "items": body.items,
        "created_at": existing.get("created_at") if existing else now,
        "updated_at": now,
        "completed_at": existing.get("completed_at") if existing else None,
    }
    await db.intake_tokens.update_one({"token": token}, {"$set": doc}, upsert=True)
    return {"ok": True, "token": token}


@api_router.get("/intake/project/{project_id}")
async def intake_get_for_project(project_id: str, user: Dict[str, Any] = Depends(require_user)):
    """Agencia consulta el intake del proyecto (si existe)."""
    rec = await db.intake_tokens.find_one({"project_id": project_id}, {"_id": 0})
    if not rec:
        return {"exists": False}
    return {"exists": True, **rec}


@api_router.put("/intake/project/{project_id}/items")
async def intake_update_items(project_id: str, body: IntakeUpdateItemsBody, user: Dict[str, Any] = Depends(require_user)):
    """Agencia actualiza qué pedir (toggle requested, añadir/quitar custom)."""
    rec = await db.intake_tokens.find_one({"project_id": project_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Primero crea el intake")
    now = datetime.now(timezone.utc).isoformat()
    await db.intake_tokens.update_one(
        {"project_id": project_id},
        {"$set": {"items": body.items, "updated_at": now}},
    )
    return {"ok": True}


@api_router.get("/intake/{token}")
async def intake_public_get(token: str):
    """Cliente obtiene su checklist (vista pública, sin project id expuesto)."""
    rec = await _get_intake(token)
    # Solo devolver items requested=true al cliente + project name para contexto
    projects = await _read_storage(PROJECTS_LIST_KEY) or []
    project = next((p for p in projects if p.get("id") == rec["project_id"]), None)
    visible = [it for it in rec.get("items", []) if it.get("requested")]
    return {
        "token": token,
        "project_name": (project or {}).get("name", "Proyecto"),
        "project_emoji": (project or {}).get("emoji", "🚀"),
        "items": visible,
        "completed_at": rec.get("completed_at"),
    }


@api_router.post("/intake/{token}/save")
async def intake_client_save(token: str, body: IntakeClientSaveBody):
    """Cliente guarda un valor (texto) → queda en status 'pending'."""
    rec = await _get_intake(token)
    items = rec.get("items", [])
    idx = next((i for i, it in enumerate(items) if it.get("id") == body.item_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    it = items[idx]
    if not it.get("requested"):
        raise HTTPException(status_code=403, detail="Este item no fue solicitado")
    now = datetime.now(timezone.utc).isoformat()
    if body.value is None or body.value == "":
        it["client_value"] = None
        it["status"] = "empty"
    else:
        it["client_value"] = body.value
        it["status"] = "pending"
        it["submitted_at"] = now
    items[idx] = it
    await db.intake_tokens.update_one(
        {"token": token},
        {"$set": {"items": items, "updated_at": now}},
    )
    return {"ok": True, "status": it["status"]}


@api_router.post("/intake/{token}/upload")
async def intake_client_upload(token: str, item_id: str = Form(...), file: UploadFile = File(...)):
    """Cliente sube archivo (GridFS). Límite 10 MB. Queda en status 'pending'."""
    rec = await _get_intake(token)
    items = rec.get("items", [])
    idx = next((i for i, it in enumerate(items) if it.get("id") == item_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    if not items[idx].get("requested"):
        raise HTTPException(status_code=403, detail="Este item no fue solicitado")
    # Leer contenido con límite
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Archivo supera {MAX_UPLOAD_BYTES // 1024 // 1024} MB")
    # Borrar fichero anterior si existía
    old_id = items[idx].get("client_file_id")
    if old_id:
        try:
            await _gridfs_bucket.delete(old_id)
        except Exception:
            pass
    # Subir
    file_id = await _gridfs_bucket.upload_from_stream(
        file.filename or "unnamed",
        contents,
        metadata={"content_type": file.content_type, "token": token, "item_id": item_id},
    )
    now = datetime.now(timezone.utc).isoformat()
    it = items[idx]
    it["client_file_id"] = str(file_id)
    it["client_file_name"] = file.filename
    it["client_file_type"] = file.content_type
    it["client_file_size"] = len(contents)
    it["status"] = "pending"
    it["submitted_at"] = now
    items[idx] = it
    await db.intake_tokens.update_one(
        {"token": token},
        {"$set": {"items": items, "updated_at": now}},
    )
    return {"ok": True, "file_id": str(file_id), "size": len(contents)}


@api_router.get("/intake/file/{file_id}")
async def intake_get_file(file_id: str):
    """Descargar un fichero subido por el cliente (público via file_id no-enumerable)."""
    from bson import ObjectId
    try:
        oid = ObjectId(file_id)
    except Exception:
        raise HTTPException(status_code=404, detail="file_id inválido")
    try:
        stream = await _gridfs_bucket.open_download_stream(oid)
    except Exception:
        raise HTTPException(status_code=404, detail="Fichero no encontrado")
    content_type = (stream.metadata or {}).get("content_type") or "application/octet-stream"
    filename = stream.filename or "file"
    async def _iter():
        while True:
            chunk = await stream.readchunk()
            if not chunk:
                break
            yield chunk
    return StreamingResponse(
        _iter(),
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@api_router.post("/intake/{token}/complete")
async def intake_client_complete(token: str):
    """Cliente marca como 'listo para revisar'. Dispara notificación Slack/Discord."""
    rec = await _get_intake(token)
    now = datetime.now(timezone.utc).isoformat()
    await db.intake_tokens.update_one(
        {"token": token},
        {"$set": {"completed_at": now, "updated_at": now}},
    )
    # Notificar webhook del proyecto si está configurado
    pid = rec["project_id"]
    notify_config = await _read_storage(f"wa_editor:p:{pid}:notify_config") or {}
    pending_count = sum(1 for it in rec.get("items", []) if it.get("status") == "pending")
    projects = await _read_storage(PROJECTS_LIST_KEY) or []
    project = next((p for p in projects if p.get("id") == pid), None)
    project_name = (project or {}).get("name", pid)
    text = f"✅ *WAFLOW · Intake completado*\nProyecto: *{project_name}*\nEl cliente ha marcado {pending_count} datos como listos para revisar."
    for url_key, fmt in [("slack_url", "slack"), ("discord_url", "discord")]:
        url = notify_config.get(url_key)
        if not url:
            continue
        try:
            async with httpx.AsyncClient(timeout=8.0) as hc:
                if fmt == "slack":
                    await hc.post(url, json={"text": text})
                else:
                    await hc.post(url, json={"content": text})
        except Exception:
            pass
    return {"ok": True, "pending_count": pending_count, "completed_at": now}


async def _apply_approved_variable(project_id: str, item: Dict[str, Any]) -> None:
    vars_key = f"wa_editor:p:{project_id}:vars"
    vars_list = await _read_storage(vars_key) or []
    name = item.get("key")
    value = item.get("client_value") or ""
    vidx = next((i for i, v in enumerate(vars_list) if v.get("name") == name), None)
    if vidx is not None:
        vars_list[vidx]["value"] = value
    else:
        vars_list.append({
            "name": name,
            "value": value,
            "category": item.get("section") or "Cliente",
            "editable": True,
        })
    await _write_storage(vars_key, vars_list)


async def _apply_approved_creative(project_id: str, item: Dict[str, Any]) -> None:
    if not item.get("client_file_id"):
        return
    creatives_key = f"wa_editor:p:{project_id}:creatives"
    creatives = await _read_storage(creatives_key) or []
    # Dedupe por intake_item_id
    creatives = [c for c in creatives if c.get("intake_item_id") != item.get("id")]
    creatives.append({
        "id": f"cli_{item['client_file_id']}",
        "name": item.get("client_file_name") or item.get("label"),
        "type": _detect_creative_type(item.get("client_file_type") or ""),
        "url": f"/api/intake/file/{item['client_file_id']}",
        "source": "client_intake",
        "intake_item_id": item.get("id"),
        "messageKey": None,
    })
    await _write_storage(creatives_key, creatives)


async def _approve_intake_item(project_id: str, item: Dict[str, Any]) -> None:
    """Marca item como approved y aplica el efecto correspondiente según su tipo."""
    if item.get("type") == "variable":
        await _apply_approved_variable(project_id, item)
    elif item.get("type") == "creative":
        await _apply_approved_creative(project_id, item)


@api_router.post("/intake/project/{project_id}/review")
async def intake_agency_review(project_id: str, body: IntakeReviewBody, user: Dict[str, Any] = Depends(require_user)):
    """Agencia aprueba o rechaza un item pendiente. Si aprueba → aplica al proyecto."""
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action debe ser 'approve' o 'reject'")

    rec = await db.intake_tokens.find_one({"project_id": project_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Intake no encontrado")

    items = rec.get("items", [])
    idx = next((i for i, it in enumerate(items) if it.get("id") == body.item_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    item = items[idx]
    if item.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Item no está pending (status={item.get('status')})")

    now = datetime.now(timezone.utc).isoformat()
    if body.action == "reject":
        item["status"] = "rejected"
        item["review_comment"] = body.comment
    else:
        item["status"] = "approved"
        await _approve_intake_item(project_id, item)

    item["reviewed_at"] = now
    items[idx] = item
    await db.intake_tokens.update_one(
        {"project_id": project_id},
        {"$set": {"items": items, "updated_at": now}},
    )
    return {"ok": True, "status": item["status"]}


def _detect_creative_type(content_type: str) -> str:
    ct = (content_type or "").lower()
    if ct.startswith("image/gif"):
        return "gif"
    if ct.startswith("image/"):
        return "image"
    if ct.startswith("video/"):
        return "video"
    return "doc"


# ============================================================
# META WHATSAPP TEMPLATES SYNC — creación directa via Graph API
# Itera los flujos Meta del proyecto, categoriza el copy con LLM (MARKETING/UTILITY),
# convierte {VAR} a {{1}},{{2}}... y crea las plantillas en el WABA del usuario.
# ============================================================


class MetaTemplatesSyncBody(BaseModel):
    project_id: str
    force_replace: bool = False


# Regex emoji (Extended_Pictographic + variation selectors + ZWJ) — defensive strip
# antes de enviar a Meta. Complementa el strip del frontend.
EMOJI_RE_PY = _re.compile(
    "[\U0001F000-\U0001FFFF"
    "\u2600-\u27BF"
    "\u2300-\u23FF"
    "\uFE00-\uFE0F"
    "\u200D\u20E3"
    "\u2190-\u21FF"
    "\u2B00-\u2BFF"
    "\u3000-\u303F]",
    flags=_re.UNICODE,
)


def strip_emojis(text: str) -> str:
    if not text:
        return text or ""
    out = EMOJI_RE_PY.sub("", text)
    # Colapsa espacios dobles que queden + espacios antes de puntuación + trim por línea
    out = _re.sub(r"[ \t]{2,}", " ", out)
    out = _re.sub(r" +([,.!?;:])", r"\1", out)
    # Recorta espacios por línea para no dejar sobras al final de cada renglón
    out = "\n".join(line.strip() for line in out.split("\n"))
    return out.strip()


async def _categorize_copy_llm(copy_text: str) -> str:
    """LLM: MARKETING vs UTILITY según el contenido del copy."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception:
        return "MARKETING"  # fallback seguro
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return "MARKETING"
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"categorize_{uuid.uuid4()}",
            system_message=(
                "Eres clasificador de plantillas WhatsApp Business. Responde SOLO con 'MARKETING' o 'UTILITY'.\n"
                "- UTILITY: confirmación de registro, recordatorio (sin promoción), actualización de estado, ticket,"
                " código de acceso, confirmación de pedido, aviso técnico. Sin CTA de venta.\n"
                "- MARKETING: promoción, descuento, nurturing, venta, invitación a evento con promesa de valor,"
                " testimonio, urgencia. Contiene CTA de compra, acción comercial o engagement."
            ),
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(UserMessage(text=f"Categoriza este mensaje WhatsApp:\n\n{copy_text[:600]}"))
        resp_upper = (resp or "").strip().upper()
        if "UTILITY" in resp_upper and "MARKETING" not in resp_upper:
            return "UTILITY"
        return "MARKETING"
    except Exception:
        return "MARKETING"


def _convert_vars_to_meta_placeholders(text: str) -> (str, List[str]):
    """Convierte {NOMBRE} {TITULO_WEBINAR} → {{1}} {{2}}... y devuelve (texto_convertido, lista_ordenada_de_nombres)."""
    if not text:
        return text or "", []
    # Buscar en orden de aparición, únicos
    seen: List[str] = []
    def _repl(match):
        name = match.group(1)
        if name not in seen:
            seen.append(name)
        idx = seen.index(name) + 1
        return f"{{{{{idx}}}}}"
    converted = _re.sub(r"\{([A-Z_][A-Z0-9_]*)\}", _repl, text)
    return converted, seen


def _parse_template_buttons(botones_str: str) -> List[Dict[str, Any]]:
    """Convierte '[BOTÓN] Texto\\nLink: https://...' a componentes Meta de tipo BUTTONS."""
    if not botones_str or botones_str.startswith("N/A"):
        return []
    buttons: List[Dict[str, Any]] = []
    lines = botones_str.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = _re.match(r"\[BOTÓN\]\s*(.+)", line)
        if m:
            text = m.group(1).strip()
            # Mirar si la siguiente línea es Link:
            url = None
            if i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                m2 = _re.match(r"Link:\s*(https?://\S+)", nxt)
                if m2:
                    url = m2.group(1)
                    i += 1
            if url:
                buttons.append({"type": "URL", "text": text[:25], "url": url[:2000]})
            else:
                buttons.append({"type": "QUICK_REPLY", "text": text[:25]})
            # Meta permite máximo 3 QUICK_REPLY o 2 URL; cortar a 3 en total
            if len(buttons) >= 3:
                break
        i += 1
    return buttons


EVOLUTION_FLOW_KEYS_SET = {"broadcasts", "venta_comunidad"}


def _flatten_project_meta_messages(project_id: str, strategy: str, custom_msgs: Dict[str, List[Dict]], edits: Dict[str, str]) -> List[Dict[str, Any]]:
    """Obtiene todos los mensajes de flujos Meta del proyecto con su copy editado aplicado."""
    # Importar los flujos base (no podemos importar el front, así que replicamos la estructura mínima).
    # Nota: en MVP usamos el copy que viene editado ya; si no hay edits, el cliente debe enviar el copy via otra ruta.
    # Aquí esperamos que el frontend nos mande los mensajes directamente en el body.
    return []


class MetaTemplateSyncItemBody(BaseModel):
    model_config = {"populate_by_name": True}

    msg_key: str            # "flujo_a:M1"
    flow_key: str
    msg_id: str
    copy_text: str = Field(alias="copy")  # copy editado final (sin reemplazar variables)
    botones: Optional[str] = None
    creative_url: Optional[str] = None  # URL pública o /api/intake/file/{id} para header


class MetaTemplatesSyncFullBody(BaseModel):
    project_id: str
    items: List[MetaTemplateSyncItemBody]
    force_replace: bool = False


# --- Helpers de meta_templates_sync -----------------------------------------
def _build_meta_template_name(flow_key: str, msg_id: str) -> str:
    tpl_name = f"waflow_{flow_key}_{msg_id}".lower()
    return _re.sub(r"[^a-z0-9_]", "_", tpl_name)[:512]


async def _fetch_existing_meta_templates(hc: httpx.AsyncClient, waba_id: str, access_token: str) -> set:
    try:
        r = await hc.get(
            f"https://graph.facebook.com/v21.0/{waba_id}/message_templates",
            params={"fields": "name,status", "limit": 200},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if r.status_code >= 400:
            return set()
        return {tpl.get("name") for tpl in (r.json().get("data") or []) if tpl.get("name")}
    except Exception:
        return set()


def _build_header_component(creative_url: Optional[str]) -> Optional[Dict[str, Any]]:
    """Construye el componente HEADER Meta a partir de una URL pública, o None."""
    if not creative_url or not creative_url.startswith(("http://", "https://")):
        return None
    if "/api/intake/file/" in creative_url:
        return None  # Meta no puede acceder a nuestros GridFS locales
    url_lower = creative_url.lower()
    if any(url_lower.endswith(x) for x in (".jpg", ".jpeg", ".png", ".webp")):
        fmt = "IMAGE"
    elif any(url_lower.endswith(x) for x in (".mp4", ".mov")):
        fmt = "VIDEO"
    elif url_lower.endswith(".pdf"):
        fmt = "DOCUMENT"
    else:
        return None
    return {"type": "HEADER", "format": fmt, "example": {"header_handle": [creative_url]}}


def _build_template_components(body_text: str, var_names: List[str], header: Optional[Dict[str, Any]], buttons: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    components: List[Dict[str, Any]] = []
    if header:
        components.append(header)
    body_component: Dict[str, Any] = {"type": "BODY", "text": body_text}
    if var_names:
        body_component["example"] = {"body_text": [["ejemplo_" + v.lower() for v in var_names]]}
    components.append(body_component)
    components.append({"type": "FOOTER", "text": "Powered by WAFLOW"})
    if buttons:
        components.append({"type": "BUTTONS", "buttons": buttons})
    return components


async def _build_meta_template_payload(item: "MetaTemplateSyncItemBody") -> Dict[str, Any]:
    """Construye el payload Meta completo para un item (categorización LLM + variables + componentes)."""
    category = await _categorize_copy_llm(item.copy_text)
    copy_clean = strip_emojis(item.copy_text)
    body_text, var_names = _convert_vars_to_meta_placeholders(copy_clean)
    if len(body_text) > 1024:
        body_text = body_text[:1021] + "..."
    header = _build_header_component(item.creative_url)
    buttons = _parse_template_buttons(item.botones or "")
    components = _build_template_components(body_text, var_names, header, buttons)
    return {
        "payload": {"name": "", "language": "es", "category": category, "components": components},
        "category": category,
        "var_names": var_names,
    }


async def _delete_existing_meta_template(hc: httpx.AsyncClient, waba_id: str, access_token: str, tpl_name: str) -> None:
    try:
        await hc.delete(
            f"https://graph.facebook.com/v21.0/{waba_id}/message_templates",
            params={"name": tpl_name},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    except Exception:
        pass


async def _create_meta_template(
    hc: httpx.AsyncClient, waba_id: str, access_token: str,
    tpl_name: str, payload: Dict[str, Any],
) -> Dict[str, Any]:
    """POST a Meta para crear la plantilla. Devuelve {ok, meta_id, meta_status, error}."""
    payload_named = {**payload, "name": tpl_name}
    try:
        r = await hc.post(
            f"https://graph.facebook.com/v21.0/{waba_id}/message_templates",
            json=payload_named,
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        )
        data = r.json() if r.content else {}
        if r.status_code < 400:
            return {"ok": True, "meta_id": data.get("id"), "meta_status": data.get("status") or "PENDING"}
        err_msg = (data.get("error") or {}).get("message") or str(data)[:300]
        return {"ok": False, "error": err_msg}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}


async def _sync_single_template_item(
    hc: httpx.AsyncClient,
    item: "MetaTemplateSyncItemBody",
    waba_id: str,
    access_token: str,
    existing_names: set,
    force_replace: bool,
    existing_templates_state: Dict[str, Any],
) -> Dict[str, Any]:
    """Procesa un único item de sync. Devuelve el result dict + muta existing_templates_state al éxito."""
    tpl_name = _build_meta_template_name(item.flow_key, item.msg_id)

    if tpl_name in existing_names and not force_replace:
        return {"msg_key": item.msg_key, "template_name": tpl_name, "ok": True, "status": "skipped", "reason": "Ya existe en Meta"}

    built = await _build_meta_template_payload(item)
    payload = built["payload"]
    category = built["category"]
    var_names = built["var_names"]

    if force_replace and tpl_name in existing_names:
        await _delete_existing_meta_template(hc, waba_id, access_token, tpl_name)

    res = await _create_meta_template(hc, waba_id, access_token, tpl_name, payload)
    if not res["ok"]:
        return {"msg_key": item.msg_key, "template_name": tpl_name, "ok": False, "status": "error", "error": res["error"]}

    existing_templates_state[item.msg_key] = {
        "isTemplate": True, "auto": False,
        "name": tpl_name, "language": "es", "category": category,
        "status": res["meta_status"], "meta_id": res["meta_id"],
        "params_mapping": var_names, "synced_at": datetime.now(timezone.utc).isoformat(),
    }
    return {
        "msg_key": item.msg_key, "template_name": tpl_name,
        "ok": True, "status": "created",
        "meta_id": res["meta_id"], "meta_status": res["meta_status"],
        "category": category, "params_mapping": var_names,
    }


@api_router.post("/meta/templates/sync")
async def meta_templates_sync(body: MetaTemplatesSyncFullBody, user: Dict[str, Any] = Depends(require_user)):
    """Sincroniza plantillas Meta para un proyecto. Delega cada item en _sync_single_template_item."""
    connections = await _read_storage(f"wa_editor:p:{body.project_id}:connections") or {}
    waba_id = connections.get("wabaId")
    access_token = connections.get("accessToken")
    if not waba_id or not access_token:
        raise HTTPException(status_code=400, detail="Faltan credenciales Meta: WABA ID y/o Access Token en Conexiones.")

    existing_templates_state = await _read_storage(f"wa_editor:p:{body.project_id}:templates") or {}
    results: List[Dict[str, Any]] = []
    created = skipped = failed = 0

    async with httpx.AsyncClient(timeout=30.0) as hc:
        existing_names = await _fetch_existing_meta_templates(hc, waba_id, access_token)
        for item in body.items:
            result = await _sync_single_template_item(
                hc, item, waba_id, access_token, existing_names, body.force_replace, existing_templates_state,
            )
            results.append(result)
            status = result.get("status")
            if status == "created":
                created += 1
            elif status == "skipped":
                skipped += 1
            else:
                failed += 1

    await _write_storage(f"wa_editor:p:{body.project_id}:templates", existing_templates_state)
    return {"ok": True, "total": len(body.items), "created": created, "skipped": skipped, "failed": failed, "results": results}


async def _fetch_waba_templates_full(hc: httpx.AsyncClient, waba_id: str, access_token: str) -> Dict[str, Dict[str, Any]]:
    """Devuelve dict {name: tpl_data} con status/rejected_reason/category/id desde Meta."""
    try:
        r = await hc.get(
            f"https://graph.facebook.com/v21.0/{waba_id}/message_templates",
            params={"fields": "name,status,rejected_reason,category,id", "limit": 200},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Meta API error: {e}")
    if r.status_code >= 400:
        err = r.json().get("error", {}).get("message", r.text[:200])
        raise HTTPException(status_code=r.status_code, detail=f"Meta API: {err}")
    return {tpl.get("name"): tpl for tpl in (r.json().get("data") or []) if tpl.get("name")}


def _merge_template_status(tpl_info: Dict[str, Any], meta_tpl: Dict[str, Any]) -> bool:
    """Aplica el status de Meta sobre tpl_info in-place. Devuelve True si el status cambió."""
    new_status = meta_tpl.get("status", tpl_info.get("status"))
    changed = new_status != tpl_info.get("status")
    tpl_info["status"] = new_status
    tpl_info["meta_id"] = meta_tpl.get("id", tpl_info.get("meta_id"))
    tpl_info["rejected_reason"] = meta_tpl.get("rejected_reason")
    tpl_info["last_status_check"] = datetime.now(timezone.utc).isoformat()
    return changed


@api_router.get("/meta/templates/status/{project_id}")
async def meta_templates_refresh_status(project_id: str, user: Dict[str, Any] = Depends(require_user)):
    """Pull del estado actual de cada plantilla WAFLOW en el WABA del proyecto."""
    connections = await _read_storage(f"wa_editor:p:{project_id}:connections") or {}
    waba_id = connections.get("wabaId")
    access_token = connections.get("accessToken")
    if not waba_id or not access_token:
        raise HTTPException(status_code=400, detail="Faltan credenciales Meta.")

    templates_state = await _read_storage(f"wa_editor:p:{project_id}:templates") or {}

    async with httpx.AsyncClient(timeout=15.0) as hc:
        meta_data = await _fetch_waba_templates_full(hc, waba_id, access_token)

    updated = 0
    for msg_key, tpl_info in templates_state.items():
        if not isinstance(tpl_info, dict):
            continue
        name = tpl_info.get("name")
        if not name or name not in meta_data:
            continue
        if _merge_template_status(tpl_info, meta_data[name]):
            updated += 1
        templates_state[msg_key] = tpl_info

    await _write_storage(f"wa_editor:p:{project_id}:templates", templates_state)
    return {"ok": True, "updated": updated, "total_meta": len(meta_data), "tracked": len(templates_state)}


# ============================================================
# FLOW TEST RUNS — secuencia completa de mensajes en modo QA
# Envía N plantillas Meta aprobadas al teléfono de pruebas con delay configurable.
# Corre en background; el frontend polea el progreso via GET run-flow-test/{run_id}.
# ============================================================
import asyncio as _asyncio


class FlowTestRunItem(BaseModel):
    msg_key: str
    template_name: str
    language: str = "es"
    params: List[str] = []
    header_media_url: Optional[str] = None
    header_media_type: Optional[str] = None


class FlowTestRunBody(BaseModel):
    project_id: str
    flow_key: str
    to_phone: str
    speedup_seconds: int = 15
    items: List[FlowTestRunItem]


def _build_flow_test_item_payload(item: Dict[str, Any], to: str) -> Dict[str, Any]:
    components: List[Dict[str, Any]] = []
    if item.get("header_media_url") and item.get("header_media_type"):
        mt = (item["header_media_type"] or "").lower()
        if mt in {"image", "video", "document"}:
            components.append({
                "type": "header",
                "parameters": [{"type": mt, mt: {"link": item["header_media_url"]}}],
            })
    if item.get("params"):
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": strip_emojis(str(p))[:1024]} for p in item["params"]],
        })
    return {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": item["template_name"],
            "language": {"code": item.get("language") or "es"},
            **({"components": components} if components else {}),
        },
    }


async def _send_flow_test_item(
    hc: httpx.AsyncClient, phone_id: str, access_token: str,
    idx: int, item: Dict[str, Any], payload: Dict[str, Any],
) -> Dict[str, Any]:
    base = {
        "idx": idx, "msg_key": item["msg_key"], "template": item["template_name"],
        "at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        r = await hc.post(
            f"https://graph.facebook.com/v21.0/{phone_id}/messages",
            json=payload,
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        )
        data = r.json() if r.content else {}
        if r.status_code < 400:
            return {**base, "ok": True, "message_id": (data.get("messages") or [{}])[0].get("id")}
        err_msg = (data.get("error") or {}).get("message") or str(data)[:200]
        return {**base, "ok": False, "error": err_msg}
    except Exception as e:
        return {**base, "ok": False, "error": f"Red: {str(e)[:200]}"}


async def _is_flow_test_cancelled(run_id: str) -> bool:
    current = await db.flow_test_runs.find_one({"run_id": run_id}, {"status": 1, "_id": 0})
    return bool(current and current.get("status") == "cancelled")


async def _flow_test_run_task(run_id: str):
    """Background: itera los mensajes y los envía a Meta con sleep entre ellos."""
    rec = await db.flow_test_runs.find_one({"run_id": run_id})
    if not rec:
        return
    phone_id = rec["phone_number_id"]
    access_token = rec["access_token"]
    speedup = max(1, int(rec.get("speedup_seconds", 15)))
    items = rec.get("items", [])
    to = rec["to_phone"]

    async with httpx.AsyncClient(timeout=20.0) as hc:
        for idx, item in enumerate(items):
            if await _is_flow_test_cancelled(run_id):
                await db.flow_test_runs.update_one(
                    {"run_id": run_id},
                    {"$set": {"finished_at": datetime.now(timezone.utc).isoformat()}},
                )
                return

            payload = _build_flow_test_item_payload(item, to)
            item_result = await _send_flow_test_item(hc, phone_id, access_token, idx, item, payload)

            await db.flow_test_runs.update_one(
                {"run_id": run_id},
                {
                    "$push": {"results": item_result},
                    "$set": {"done": idx + 1, "last_update": datetime.now(timezone.utc).isoformat()},
                },
            )

            if idx < len(items) - 1:
                await _asyncio.sleep(speedup)

    await db.flow_test_runs.update_one(
        {"run_id": run_id},
        {"$set": {"status": "completed", "finished_at": datetime.now(timezone.utc).isoformat()}},
    )


@api_router.post("/whatsapp/run-flow-test")
async def start_flow_test_run(body: FlowTestRunBody, user: Dict[str, Any] = Depends(require_user)):
    """Arranca un run de prueba: envía secuencialmente las plantillas al teléfono con delay."""
    connections = await _read_storage(f"wa_editor:p:{body.project_id}:connections") or {}
    phone_id = connections.get("phoneNumberId")
    access_token = connections.get("accessToken")
    if not phone_id or not access_token:
        raise HTTPException(status_code=400, detail="Faltan Phone Number ID y/o Access Token en Conexiones.")
    to = _re.sub(r"\D", "", body.to_phone or "")
    if not to:
        raise HTTPException(status_code=400, detail="Teléfono destino inválido (E.164 sin +).")
    if not body.items:
        raise HTTPException(status_code=400, detail="No hay mensajes para enviar.")

    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.flow_test_runs.insert_one({
        "run_id": run_id,
        "project_id": body.project_id,
        "flow_key": body.flow_key,
        "to_phone": to,
        "phone_number_id": phone_id,
        "access_token": access_token,
        "speedup_seconds": body.speedup_seconds,
        "items": [it.dict() for it in body.items],
        "total": len(body.items),
        "done": 0,
        "results": [],
        "status": "running",
        "started_at": now,
        "last_update": now,
    })
    _asyncio.create_task(_flow_test_run_task(run_id))
    return {"ok": True, "run_id": run_id, "total": len(body.items)}


@api_router.get("/whatsapp/run-flow-test/{run_id}")
async def get_flow_test_run(run_id: str):
    rec = await db.flow_test_runs.find_one(
        {"run_id": run_id},
        {"_id": 0, "access_token": 0, "phone_number_id": 0, "items": 0},
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Run no encontrado")
    return rec


@api_router.post("/whatsapp/run-flow-test/{run_id}/cancel")
async def cancel_flow_test_run(run_id: str, user: Dict[str, Any] = Depends(require_user)):
    r = await db.flow_test_runs.update_one(
        {"run_id": run_id, "status": "running"},
        {"$set": {"status": "cancelled"}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Run no encontrado o ya terminado")
    return {"ok": True}


# ============================================================
# AUTH — Emergent Google Auth
# REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
# Flow:
#   1) Frontend redirects to https://auth.emergentagent.com/?redirect=<origin>/
#   2) User returns with #session_id=... → frontend POST /api/auth/callback
#   3) Backend GETs https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data
#   4) Backend creates/updates user, stores session in db.user_sessions, sets httpOnly cookie
#   5) Frontend calls /api/auth/me on load to check session
# ============================================================
# Nota: SESSION_COOKIE_NAME, SESSION_DURATION_DAYS y los helpers require_user/require_admin
# están definidos arriba del archivo para poder usarlos en los Depends() de endpoints.


class AuthCallbackBody(BaseModel):
    session_id: str


async def _fetch_emergent_session_data(session_id: str) -> Dict[str, Any]:
    """Consulta session-data de Emergent Auth. Lanza HTTPException en error."""
    try:
        async with httpx.AsyncClient(timeout=12.0) as hc:
            r = await hc.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
            )
        if r.status_code >= 400:
            raise HTTPException(status_code=401, detail="session_id inválido o expirado")
        return r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error Emergent Auth: {e}")


def _get_initial_admin_emails() -> set:
    raw = os.environ.get("INITIAL_ADMIN_EMAILS", "") or ""
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


async def _resolve_new_user_role(email: str, is_initial_admin: bool) -> tuple:
    """Decide rol y invited_by para un email que aún no existe en db.users. Puede lanzar 403."""
    if is_initial_admin:
        return "admin", None
    user_count = await db.users.count_documents({})
    if user_count == 0:
        return "admin", None
    allow_entry = await db.auth_allowlist.find_one({"email": email}, {"_id": 0})
    if not allow_entry:
        raise HTTPException(status_code=403, detail="Tu email no está autorizado. Pide al admin que te invite.")
    return allow_entry.get("role", "editor"), allow_entry.get("invited_by")


async def _create_user(email: str, name: str, picture: Optional[str], google_id: Optional[str], role: str, invited_by: Optional[str]) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    new_user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": email,
        "name": name,
        "google_id": google_id,
        "avatar_url": picture,
        "role": role,
        "workspace_id": "default",
        "created_at": now,
        "invited_by": invited_by,
    }
    await db.users.insert_one(new_user)
    existing = {**new_user}
    existing.pop("_id", None)
    return existing


async def _update_existing_user(existing: Dict[str, Any], name: str, picture: Optional[str], google_id: Optional[str], is_initial_admin: bool) -> Dict[str, Any]:
    """Refresca datos del usuario desde Google y promociona a admin si aplica."""
    update_set = {
        "name": name,
        "avatar_url": picture,
        "google_id": google_id,
        "last_login_at": datetime.now(timezone.utc),
    }
    if is_initial_admin and existing.get("role") != "admin":
        update_set["role"] = "admin"
        existing["role"] = "admin"
    await db.users.update_one({"user_id": existing["user_id"]}, {"$set": update_set})
    existing["name"] = name
    existing["avatar_url"] = picture
    return existing


async def _persist_user_session(user_id: str, session_token: str) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DURATION_DAYS)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": expires_at,
    })


def _set_session_cookie(response: FastAPIResponse, session_token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=SESSION_DURATION_DAYS * 24 * 3600,
    )


@api_router.post("/auth/callback")
async def auth_callback(body: AuthCallbackBody, response: FastAPIResponse):
    """Procesa session_id de Emergent Auth, crea/actualiza user, setea cookie."""
    data = await _fetch_emergent_session_data(body.session_id)

    email = (data.get("email") or "").strip().lower()
    name = data.get("name") or "Sin nombre"
    picture = data.get("picture")
    session_token = data.get("session_token")
    google_id = data.get("id")
    if not email or not session_token:
        raise HTTPException(status_code=400, detail="Respuesta Emergent Auth incompleta")

    is_initial_admin = email in _get_initial_admin_emails()

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if not existing:
        role, invited_by = await _resolve_new_user_role(email, is_initial_admin)
        existing = await _create_user(email, name, picture, google_id, role, invited_by)
    else:
        existing = await _update_existing_user(existing, name, picture, google_id, is_initial_admin)

    await _persist_user_session(existing["user_id"], session_token)
    _set_session_cookie(response, session_token)

    existing.pop("created_at", None)
    return {
        "ok": True,
        "user": {
            "user_id": existing["user_id"],
            "email": existing["email"],
            "name": existing["name"],
            "avatar_url": existing.get("avatar_url"),
            "role": existing.get("role", "editor"),
            "workspace_id": existing.get("workspace_id", "default"),
        },
    }


@api_router.get("/auth/me")
async def auth_me(user: Dict[str, Any] = Depends(require_user)):
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "avatar_url": user.get("avatar_url"),
        "role": user.get("role", "editor"),
        "workspace_id": user.get("workspace_id", "default"),
    }


# ============================================================
# EMERGENCY LOGIN — email + password.
# Pensado para casos donde Emergent Auth está caído (403) o el admin
# necesita acceder sin Google. Coexiste con el callback OAuth.
# ============================================================
import bcrypt as _bcrypt


def _hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = ""


@api_router.post("/auth/register")
async def auth_register(body: RegisterBody, response: FastAPIResponse):
    """Registro con email+password.
    Política: solo se permite si el email está en INITIAL_ADMIN_EMAILS, en
    db.auth_allowlist, o si NO hay ningún user en la BD (primer admin).
    Crea user + sesión + cookie en una sola llamada.
    """
    email = (body.email or "").strip().lower()
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password debe tener al menos 8 caracteres")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email. Usa Iniciar sesión.")

    initial_admins = {e.strip().lower() for e in os.environ.get("INITIAL_ADMIN_EMAILS", "").split(",") if e.strip()}
    user_count = await db.users.count_documents({})
    is_initial_admin = email in initial_admins
    is_first_user = user_count == 0

    if is_initial_admin or is_first_user:
        role = "admin"
        invited_by = None
    else:
        allow_entry = await db.auth_allowlist.find_one({"email": email}, {"_id": 0})
        if not allow_entry:
            raise HTTPException(status_code=403, detail="Tu email no está autorizado. Pide al admin que te invite.")
        role = allow_entry.get("role", "editor")
        invited_by = allow_entry.get("invited_by")

    now = datetime.now(timezone.utc)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    name = (body.name or "").strip() or email.split("@")[0]
    new_user = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "google_id": None,
        "avatar_url": None,
        "role": role,
        "workspace_id": "default",
        "created_at": now,
        "invited_by": invited_by,
        "password_hash": _hash_password(body.password),
        "password_updated_at": now,
    }
    await db.users.insert_one(new_user)

    # Crear sesión + cookie (auto-login tras registro)
    session_token = uuid.uuid4().hex + uuid.uuid4().hex
    expires_at = now + timedelta(days=SESSION_DURATION_DAYS)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": now,
        "expires_at": expires_at,
        "method": "register",
    })
    response.set_cookie(
        key=SESSION_COOKIE_NAME, value=session_token,
        httponly=True, secure=True, samesite="none", path="/",
        max_age=SESSION_DURATION_DAYS * 24 * 3600,
    )
    return {
        "ok": True,
        "user": {
            "user_id": user_id, "email": email, "name": name,
            "avatar_url": None, "role": role, "workspace_id": "default",
        },
    }


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@api_router.post("/auth/change-password")
async def auth_change_password(body: ChangePasswordBody, user: Dict[str, Any] = Depends(require_user)):
    """Permite a un usuario logueado cambiar su propio password."""
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password nuevo debe tener al menos 8 caracteres")
    full_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    current_hash = (full_user or {}).get("password_hash") or ""
    if not current_hash or not _verify_password(body.current_password, current_hash):
        raise HTTPException(status_code=401, detail="Password actual incorrecto")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "password_hash": _hash_password(body.new_password),
            "password_updated_at": datetime.now(timezone.utc),
        }},
    )
    return {"ok": True}


class EmergencyLoginBody(BaseModel):
    email: EmailStr
    password: str


@api_router.post("/auth/login")
async def auth_login(body: EmergencyLoginBody, response: FastAPIResponse):
    """Login con email+password. Requiere que el user EXISTA en db.users y
    tenga `password_hash`. Para inicializar/cambiar el hash usar
    POST /api/auth/set-emergency-password.
    """
    email = (body.email or "").strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    pwd_hash = user.get("password_hash") or ""
    if not pwd_hash or not _verify_password(body.password, pwd_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    # Reutilizar el sistema de sesiones existente (cookie waflow_session)
    session_token = uuid.uuid4().hex + uuid.uuid4().hex  # 64 chars
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DURATION_DAYS)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": expires_at,
        "method": "password",
    })
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=SESSION_DURATION_DAYS * 24 * 3600,
    )
    return {
        "ok": True,
        "user": {
            "user_id": user["user_id"],
            "email": user["email"],
            "name": user.get("name"),
            "avatar_url": user.get("avatar_url"),
            "role": user.get("role", "editor"),
            "workspace_id": user.get("workspace_id", "default"),
        },
    }


class SetPasswordBody(BaseModel):
    email: EmailStr
    new_password: str
    bootstrap_secret: str


@api_router.post("/auth/set-emergency-password")
async def auth_set_emergency_password(body: SetPasswordBody):
    """Setea/actualiza `password_hash` de un user existente.
    Requiere conocer EMERGENCY_BOOTSTRAP_SECRET (env var) para evitar abusos.
    El secret (256-bit) es la única autorización — funciona aunque INITIAL_ADMIN_EMAILS
    no esté seteado (útil para bootstrapping inicial de producción).
    """
    secret_env = os.environ.get("EMERGENCY_BOOTSTRAP_SECRET", "")
    if not secret_env or body.bootstrap_secret != secret_env:
        raise HTTPException(status_code=403, detail="Bootstrap secret inválido")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password debe tener al menos 8 caracteres")
    email = (body.email or "").strip().lower()
    # Si INITIAL_ADMIN_EMAILS está seteado, restringimos a ese set (defensa en profundidad).
    # Si NO está seteado (caso producción recién deployada), el secret 256-bit es suficiente.
    initial_admins_raw = os.environ.get("INITIAL_ADMIN_EMAILS", "").strip()
    if initial_admins_raw:
        initial_admins = {e.strip().lower() for e in initial_admins_raw.split(",") if e.strip()}
        if email not in initial_admins:
            raise HTTPException(status_code=403, detail=f"Email {email} no está en INITIAL_ADMIN_EMAILS")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        # Crear user si no existe (bootstrap inicial). Auto-promote a admin.
        from uuid import uuid4
        new_user = {
            "user_id": f"user_{uuid4().hex[:12]}",
            "email": email,
            "name": email.split("@")[0],
            "role": "admin",
            "workspace_id": "default",
            "password_hash": _hash_password(body.new_password),
            "password_updated_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
            "avatar_url": None,
        }
        await db.users.insert_one(new_user)
        return {"ok": True, "email": email, "created": True}
    await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": _hash_password(body.new_password), "password_updated_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True, "email": email, "created": False}



@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: FastAPIResponse):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie(SESSION_COOKIE_NAME, path="/", samesite="none", secure=True)
    return {"ok": True}


class InviteBody(BaseModel):
    email: EmailStr
    role: str = "editor"  # editor|viewer|admin


@api_router.post("/auth/invite")
async def auth_invite(body: InviteBody, admin: Dict[str, Any] = Depends(require_admin)):
    if body.role not in {"admin", "editor", "viewer"}:
        raise HTTPException(status_code=400, detail="role debe ser admin, editor o viewer")
    email_norm = str(body.email).strip().lower()
    await db.auth_allowlist.update_one(
        {"email": email_norm},
        {"$set": {
            "email": email_norm,
            "role": body.role,
            "invited_by": admin["user_id"],
            "invited_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True, "email": email_norm, "role": body.role}


@api_router.get("/auth/team")
async def auth_team(admin: Dict[str, Any] = Depends(require_admin)):
    """Lista usuarios actuales + pendientes de activación (allowlist sin user creado)."""
    users = await db.users.find({}, {"_id": 0, "google_id": 0}).to_list(length=500)
    allow = await db.auth_allowlist.find({}, {"_id": 0}).to_list(length=500)
    active_emails = {u["email"] for u in users}
    pending = [a for a in allow if a["email"] not in active_emails]
    return {"users": users, "pending": pending}


@api_router.delete("/auth/invite")
async def auth_invite_remove(email: str = Query(...), admin: Dict[str, Any] = Depends(require_admin)):
    email_norm = email.strip().lower()
    r = await db.auth_allowlist.delete_one({"email": email_norm})
    return {"ok": True, "removed": r.deleted_count}


# ============================================================
# POSTGRESQL READ-ONLY (catálogo maestro del bot WhatsApp del usuario)
# Endpoints definidos en pg_routes.py — incluidos al final.
# Si PG_DSN no está definido, todos los endpoints devuelven 503.
# ============================================================
# (router incluido tras api_router más abajo)


# ============================================================
# ROOT
# ============================================================
@api_router.get("/")
async def root():
    return {"message": "WhatsApp Flow Editor API running"}


# Include routers
app.include_router(api_router)
app.include_router(pg_routes.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    try:
        await _pg.close_pool()
    except Exception:
        pass
