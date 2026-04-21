from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone
import httpx
import re as _re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="WhatsApp Flow Editor API")
api_router = APIRouter(prefix="/api")


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
async def storage_set(body: StorageSetBody):
    now = datetime.now(timezone.utc).isoformat()
    await db.storage_shared.update_one(
        {"key": body.key},
        {"$set": {"key": body.key, "value": body.value, "updated_at": now}},
        upsert=True,
    )
    return {"ok": True, "key": body.key}


@api_router.get("/storage/get")
async def storage_get(key: str = Query(...), shared: bool = Query(True)):
    doc = await db.storage_shared.find_one({"key": key}, {"_id": 0})
    if not doc:
        return {"value": None}
    return {"value": doc.get("value")}


@api_router.post("/storage/delete")
async def storage_delete(body: StorageDeleteBody):
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


@api_router.post("/ai/test-chat")
async def ai_test_chat(body: AIChatBody):
    """Envía el último mensaje del usuario al modelo con el system prompt.
    Multi-turn: reenvía todo el historial para cada llamada (stateless).
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"emergentintegrations no disponible: {e}")

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY no configurado")

    session_id = body.session_id or str(uuid.uuid4())

    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=body.system_prompt or "Eres un asistente útil.",
    ).with_model(body.model_provider, body.model_name)

    # La librería mantiene historia por session_id; para simular multi-turn stateless,
    # reenviamos los mensajes previos antes del último. Si hay solo uno, directo.
    try:
        last_user_text = None
        # Reenviar mensajes previos en orden (todos los user excepto el último)
        user_msgs = [m for m in body.messages if m.role == "user"]
        if not user_msgs:
            raise HTTPException(status_code=400, detail="Se requiere al menos un mensaje del usuario")

        # Para historial multi-turn: re-enviamos solo el último user (la librería gestiona su propia historia por session_id,
        # pero como cada llamada crea nueva instancia, pasamos todo el contexto como user message)
        if len(body.messages) > 1:
            # Construir contexto textual con historia previa
            history_lines = []
            for m in body.messages[:-1]:
                prefix = "Usuario" if m.role == "user" else "Asistente"
                history_lines.append(f"{prefix}: {m.text}")
            history_block = "\n".join(history_lines)
            last = body.messages[-1]
            final_text = f"Historia previa:\n{history_block}\n\nUsuario ahora: {last.text}"
        else:
            final_text = body.messages[-1].text

        user_message = UserMessage(text=final_text)
        response = await chat.send_message(user_message)

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
async def whatsapp_send(body: WhatsAppSendBody):
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


@api_router.post("/whatsapp/send-template")
async def whatsapp_send_template(body: WhatsAppTemplateSendBody):
    """Envía una plantilla Meta ya aprobada con parámetros rellenos al teléfono destino.
    Lee phone_number_id + access_token de las conexiones del proyecto."""
    connections = await _read_storage(f"wa_editor:p:{body.project_id}:connections") or {}
    phone_id = connections.get("phoneNumberId")
    access_token = connections.get("accessToken")
    if not phone_id or not access_token:
        raise HTTPException(status_code=400, detail="Faltan Phone Number ID y/o Access Token en Conexiones.")

    to = _re.sub(r"\D", "", body.to_phone or "")
    if not to:
        raise HTTPException(status_code=400, detail="Teléfono destino inválido (E.164 sin +).")

    components: List[Dict[str, Any]] = []
    if body.header_media_url and body.header_media_type:
        mt = body.header_media_type.lower()
        media_key = {"image": "image", "video": "video", "document": "document"}.get(mt)
        if media_key:
            components.append({
                "type": "header",
                "parameters": [{"type": media_key, media_key: {"link": body.header_media_url}}],
            })
    if body.params:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)[:1024]} for p in body.params],
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": body.template_name,
            "language": {"code": body.language or "es"},
            **({"components": components} if components else {}),
        },
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as hc:
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
    except Exception as e:
        return {"ok": False, "error": f"Error Meta API: {str(e)[:300]}"}


# ============================================================
# TEST CONNECTION — validar credenciales antes de lanzar
# ============================================================
class TestConnectionBody(BaseModel):
    type: str  # "meta" | "evolution" | "n8n_webhook"
    config: Dict[str, Any]


@api_router.post("/test-connection")
async def test_connection(body: TestConnectionBody):
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
async def evolution_send(body: EvolutionSendBody):
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

    slack_url = notify_config.get("slack_url")
    discord_url = notify_config.get("discord_url")

    message = (
        f"🎉 *WAFLOW · {body.project_name or 'Proyecto'}*\n"
        f"El cliente ha aprobado *{body.approved}/{body.total}* mensajes "
        f"({pct:.0f}%). ¡Podéis cerrar la revisión!"
    )

    results = {"slack": None, "discord": None}
    async with httpx.AsyncClient(timeout=10.0) as hclient:
        if slack_url:
            try:
                r = await hclient.post(slack_url, json={"text": message})
                results["slack"] = r.status_code
            except Exception as e:
                results["slack"] = f"err: {e}"
        if discord_url:
            try:
                r = await hclient.post(discord_url, json={"content": message})
                results["discord"] = r.status_code
            except Exception as e:
                results["discord"] = f"err: {e}"

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


def _pdf_messages_section(approval, edits, vars_list, styles):
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Spacer

    def render_vars(text):
        if not text:
            return ""
        out = text
        for v in vars_list:
            name = v.get("name")
            if not name:
                continue
            out = out.replace("{" + name + "}", str(v.get("value") or f"{{{name}}}"))
        return out

    story = []
    if not approval:
        story.append(Paragraph("Sin mensajes revisados todavía.", styles["meta"]))
        return story

    for msg_key in sorted(approval.keys()):
        a = approval[msg_key] or {}
        status = a.get("status")
        status_label = "✓ APROBADO" if status == "approved" else ("✎ CAMBIOS" if status == "changes" else "—")
        color = colors.HexColor("#059669") if status == "approved" else (colors.HexColor("#B45309") if status == "changes" else colors.HexColor("#6B7280"))
        story.append(Paragraph(
            f"<font name='Courier-Bold' color='#111827'>{msg_key}</font> · <font color='{color.hexval()[2:]}'><b>{status_label}</b></font>",
            styles["body"],
        ))
        story.append(Paragraph(f"<font color='#6B7280' size='9'>Revisado por: {a.get('by','—')}</font>", styles["meta"]))
        edited_copy = edits.get(msg_key)
        if edited_copy:
            story.append(Spacer(1, 0.1*cm))
            story.append(Paragraph(render_vars(edited_copy).replace("\n", "<br/>"), styles["body"]))
        if a.get("comment"):
            story.append(Spacer(1, 0.1*cm))
            story.append(Paragraph(f"<b>Nota del cliente:</b> {a['comment']}", styles["note"]))
        story.append(Spacer(1, 0.3*cm))
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
async def launch_deploy(body: LaunchDeployBody):
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
async def launch_status(project_id: str):
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
async def launch_complete(body: LaunchCompleteBody):
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
async def launch_stop(project_id: str):
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
async def intake_create(body: IntakeCreateBody):
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
async def intake_get_for_project(project_id: str):
    """Agencia consulta el intake del proyecto (si existe)."""
    rec = await db.intake_tokens.find_one({"project_id": project_id}, {"_id": 0})
    if not rec:
        return {"exists": False}
    return {"exists": True, **rec}


@api_router.put("/intake/project/{project_id}/items")
async def intake_update_items(project_id: str, body: IntakeUpdateItemsBody):
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


@api_router.post("/intake/project/{project_id}/review")
async def intake_agency_review(project_id: str, body: IntakeReviewBody):
    """Agencia aprueba o rechaza un item pendiente. Si aprueba → aplica al proyecto."""
    rec = await db.intake_tokens.find_one({"project_id": project_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Intake no encontrado")
    items = rec.get("items", [])
    idx = next((i for i, it in enumerate(items) if it.get("id") == body.item_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    it = items[idx]
    if it.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Item no está pending (status={it.get('status')})")
    now = datetime.now(timezone.utc).isoformat()
    if body.action == "reject":
        it["status"] = "rejected"
        it["review_comment"] = body.comment
        it["reviewed_at"] = now
    elif body.action == "approve":
        it["status"] = "approved"
        it["reviewed_at"] = now
        # Aplicar al proyecto
        if it.get("type") == "variable":
            vars_key = f"wa_editor:p:{project_id}:vars"
            vars_list = await _read_storage(vars_key) or []
            vidx = next((i for i, v in enumerate(vars_list) if v.get("name") == it.get("key")), None)
            if vidx is not None:
                vars_list[vidx]["value"] = it.get("client_value") or ""
            else:
                vars_list.append({
                    "name": it.get("key"),
                    "value": it.get("client_value") or "",
                    "category": it.get("section") or "Cliente",
                    "editable": True,
                })
            await _write_storage(vars_key, vars_list)
        elif it.get("type") == "creative" and it.get("client_file_id"):
            creatives_key = f"wa_editor:p:{project_id}:creatives"
            creatives = await _read_storage(creatives_key) or []
            # Dedupe por intake_item_id: si ya hay un creative de este item, reemplazarlo
            creatives = [c for c in creatives if c.get("intake_item_id") != it.get("id")]
            creatives.append({
                "id": f"cli_{it['client_file_id']}",
                "name": it.get("client_file_name") or it.get("label"),
                "type": _detect_creative_type(it.get("client_file_type") or ""),
                "url": f"/api/intake/file/{it['client_file_id']}",
                "source": "client_intake",
                "intake_item_id": it.get("id"),
                "messageKey": None,
            })
            await _write_storage(creatives_key, creatives)
    else:
        raise HTTPException(status_code=400, detail="action debe ser 'approve' o 'reject'")
    items[idx] = it
    await db.intake_tokens.update_one(
        {"project_id": project_id},
        {"$set": {"items": items, "updated_at": now}},
    )
    return {"ok": True, "status": it["status"]}


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
    msg_key: str            # "flujo_a:M1"
    flow_key: str
    msg_id: str
    copy: str               # copy editado final (sin reemplazar variables)
    botones: Optional[str] = None
    creative_url: Optional[str] = None  # URL pública o /api/intake/file/{id} para header


class MetaTemplatesSyncFullBody(BaseModel):
    project_id: str
    items: List[MetaTemplateSyncItemBody]
    force_replace: bool = False


@api_router.post("/meta/templates/sync")
async def meta_templates_sync(body: MetaTemplatesSyncFullBody):
    """Sincroniza plantillas Meta para un proyecto. Itera los items, categoriza con LLM,
    convierte variables, y crea cada plantilla en el WABA vía Graph API.
    """
    # Leer credenciales Meta del proyecto
    connections = await _read_storage(f"wa_editor:p:{body.project_id}:connections") or {}
    waba_id = connections.get("wabaId")
    access_token = connections.get("accessToken")
    if not waba_id or not access_token:
        raise HTTPException(status_code=400, detail="Faltan credenciales Meta: WABA ID y/o Access Token en Conexiones.")

    # Leer plantillas ya creadas (templatesByMsg)
    existing_templates_state = await _read_storage(f"wa_editor:p:{body.project_id}:templates") or {}

    results: List[Dict[str, Any]] = []
    total = len(body.items)
    created = 0
    skipped = 0
    failed = 0

    async with httpx.AsyncClient(timeout=30.0) as hc:
        # 1) Listar plantillas existentes en Meta para detectar duplicados
        existing_names = set()
        try:
            r = await hc.get(
                f"https://graph.facebook.com/v21.0/{waba_id}/message_templates",
                params={"fields": "name,status", "limit": 200},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if r.status_code < 400:
                for tpl in (r.json().get("data") or []):
                    existing_names.add(tpl.get("name"))
        except Exception:
            pass

        for it in body.items:
            tpl_name = f"waflow_{it.flow_key}_{it.msg_id}".lower()
            tpl_name = _re.sub(r"[^a-z0-9_]", "_", tpl_name)[:512]

            # Skip si existe y no hay force_replace
            if tpl_name in existing_names and not body.force_replace:
                results.append({"msg_key": it.msg_key, "template_name": tpl_name, "ok": True, "status": "skipped", "reason": "Ya existe en Meta"})
                skipped += 1
                continue

            # Categorizar con LLM
            category = await _categorize_copy_llm(it.copy)

            # Convertir variables
            body_text, var_names = _convert_vars_to_meta_placeholders(it.copy)

            # Truncar a 1024 chars (límite Meta)
            if len(body_text) > 1024:
                body_text = body_text[:1021] + "..."

            components: List[Dict[str, Any]] = []

            # Header media si hay creative_url pública (skip /api/ locales porque Meta no puede acceder)
            header_example = None
            if it.creative_url and it.creative_url.startswith(("http://", "https://")) and "/api/intake/file/" not in it.creative_url:
                # Determinar tipo por extensión simple
                url_lower = it.creative_url.lower()
                if any(url_lower.endswith(x) for x in [".jpg", ".jpeg", ".png", ".webp"]):
                    components.append({
                        "type": "HEADER", "format": "IMAGE",
                        "example": {"header_handle": [it.creative_url]},
                    })
                elif any(url_lower.endswith(x) for x in [".mp4", ".mov"]):
                    components.append({
                        "type": "HEADER", "format": "VIDEO",
                        "example": {"header_handle": [it.creative_url]},
                    })
                elif url_lower.endswith(".pdf"):
                    components.append({
                        "type": "HEADER", "format": "DOCUMENT",
                        "example": {"header_handle": [it.creative_url]},
                    })

            # Body
            body_component: Dict[str, Any] = {"type": "BODY", "text": body_text}
            if var_names:
                body_component["example"] = {"body_text": [["ejemplo_" + v.lower() for v in var_names]]}
            components.append(body_component)

            # Footer fijo con marca
            components.append({"type": "FOOTER", "text": "Powered by WAFLOW"})

            # Buttons si aplica
            btns = _parse_template_buttons(it.botones or "")
            if btns:
                components.append({"type": "BUTTONS", "buttons": btns})

            payload = {
                "name": tpl_name,
                "language": "es",
                "category": category,
                "components": components,
            }

            # Delete si force_replace y existe
            if body.force_replace and tpl_name in existing_names:
                try:
                    await hc.delete(
                        f"https://graph.facebook.com/v21.0/{waba_id}/message_templates",
                        params={"name": tpl_name},
                        headers={"Authorization": f"Bearer {access_token}"},
                    )
                except Exception:
                    pass

            # Crear
            try:
                r = await hc.post(
                    f"https://graph.facebook.com/v21.0/{waba_id}/message_templates",
                    json=payload,
                    headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                )
                data = r.json() if r.content else {}
                if r.status_code < 400:
                    meta_id = data.get("id")
                    meta_status = data.get("status") or "PENDING"
                    results.append({
                        "msg_key": it.msg_key, "template_name": tpl_name,
                        "ok": True, "status": "created",
                        "meta_id": meta_id, "meta_status": meta_status, "category": category,
                        "params_mapping": var_names,
                    })
                    # Persistir en templatesByMsg
                    existing_templates_state[it.msg_key] = {
                        "isTemplate": True, "auto": False,
                        "name": tpl_name, "language": "es", "category": category,
                        "status": meta_status, "meta_id": meta_id,
                        "params_mapping": var_names, "synced_at": datetime.now(timezone.utc).isoformat(),
                    }
                    created += 1
                else:
                    err_msg = (data.get("error") or {}).get("message") or str(data)[:300]
                    results.append({"msg_key": it.msg_key, "template_name": tpl_name, "ok": False, "status": "error", "error": err_msg})
                    failed += 1
            except Exception as e:
                results.append({"msg_key": it.msg_key, "template_name": tpl_name, "ok": False, "status": "error", "error": str(e)[:300]})
                failed += 1

    # Guardar estado actualizado
    await _write_storage(f"wa_editor:p:{body.project_id}:templates", existing_templates_state)

    return {"ok": True, "total": total, "created": created, "skipped": skipped, "failed": failed, "results": results}


@api_router.get("/meta/templates/status/{project_id}")
async def meta_templates_refresh_status(project_id: str):
    """Pull del estado actual de cada plantilla WAFLOW en el WABA del proyecto."""
    connections = await _read_storage(f"wa_editor:p:{project_id}:connections") or {}
    waba_id = connections.get("wabaId")
    access_token = connections.get("accessToken")
    if not waba_id or not access_token:
        raise HTTPException(status_code=400, detail="Faltan credenciales Meta.")

    templates_state = await _read_storage(f"wa_editor:p:{project_id}:templates") or {}

    async with httpx.AsyncClient(timeout=15.0) as hc:
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
        meta_data = {tpl.get("name"): tpl for tpl in (r.json().get("data") or [])}

    # Actualizar cada template con nuevo status
    updated = 0
    for msg_key, tpl_info in templates_state.items():
        name = tpl_info.get("name") if isinstance(tpl_info, dict) else None
        if not name or name not in meta_data:
            continue
        meta_tpl = meta_data[name]
        new_status = meta_tpl.get("status", tpl_info.get("status"))
        if new_status != tpl_info.get("status"):
            updated += 1
        tpl_info["status"] = new_status
        tpl_info["meta_id"] = meta_tpl.get("id", tpl_info.get("meta_id"))
        tpl_info["rejected_reason"] = meta_tpl.get("rejected_reason")
        tpl_info["last_status_check"] = datetime.now(timezone.utc).isoformat()
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
        for idx, it in enumerate(items):
            # Check if cancelled
            current = await db.flow_test_runs.find_one({"run_id": run_id}, {"status": 1, "_id": 0})
            if current and current.get("status") == "cancelled":
                await db.flow_test_runs.update_one(
                    {"run_id": run_id},
                    {"$set": {"finished_at": datetime.now(timezone.utc).isoformat()}},
                )
                return

            components: List[Dict[str, Any]] = []
            if it.get("header_media_url") and it.get("header_media_type"):
                mt = (it["header_media_type"] or "").lower()
                if mt in {"image", "video", "document"}:
                    components.append({
                        "type": "header",
                        "parameters": [{"type": mt, mt: {"link": it["header_media_url"]}}],
                    })
            if it.get("params"):
                components.append({
                    "type": "body",
                    "parameters": [{"type": "text", "text": str(p)[:1024]} for p in it["params"]],
                })
            payload = {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "template",
                "template": {
                    "name": it["template_name"],
                    "language": {"code": it.get("language") or "es"},
                    **({"components": components} if components else {}),
                },
            }
            item_result: Dict[str, Any]
            try:
                r = await hc.post(
                    f"https://graph.facebook.com/v21.0/{phone_id}/messages",
                    json=payload,
                    headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                )
                data = r.json() if r.content else {}
                if r.status_code < 400:
                    item_result = {
                        "idx": idx, "msg_key": it["msg_key"], "template": it["template_name"],
                        "ok": True, "message_id": (data.get("messages") or [{}])[0].get("id"),
                        "at": datetime.now(timezone.utc).isoformat(),
                    }
                else:
                    err_msg = (data.get("error") or {}).get("message") or str(data)[:200]
                    item_result = {
                        "idx": idx, "msg_key": it["msg_key"], "template": it["template_name"],
                        "ok": False, "error": err_msg,
                        "at": datetime.now(timezone.utc).isoformat(),
                    }
            except Exception as e:
                item_result = {
                    "idx": idx, "msg_key": it["msg_key"], "template": it["template_name"],
                    "ok": False, "error": f"Red: {str(e)[:200]}",
                    "at": datetime.now(timezone.utc).isoformat(),
                }

            await db.flow_test_runs.update_one(
                {"run_id": run_id},
                {
                    "$push": {"results": item_result},
                    "$set": {"done": idx + 1, "last_update": datetime.now(timezone.utc).isoformat()},
                },
            )

            # Sleep entre mensajes (no después del último)
            if idx < len(items) - 1:
                await _asyncio.sleep(speedup)

    await db.flow_test_runs.update_one(
        {"run_id": run_id},
        {"$set": {"status": "completed", "finished_at": datetime.now(timezone.utc).isoformat()}},
    )


@api_router.post("/whatsapp/run-flow-test")
async def start_flow_test_run(body: FlowTestRunBody):
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
async def cancel_flow_test_run(run_id: str):
    r = await db.flow_test_runs.update_one(
        {"run_id": run_id, "status": "running"},
        {"$set": {"status": "cancelled"}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Run no encontrado o ya terminado")
    return {"ok": True}


# ============================================================
# ROOT
# ============================================================
@api_router.get("/")
async def root():
    return {"message": "WhatsApp Flow Editor API running"}


# Include router
app.include_router(api_router)

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
