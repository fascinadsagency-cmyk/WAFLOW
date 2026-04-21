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


# ============================================================
# TEST CONNECTION — validar credenciales antes de lanzar
# ============================================================
class TestConnectionBody(BaseModel):
    type: str  # "meta" | "evolution" | "n8n_webhook"
    config: Dict[str, Any]


@api_router.post("/test-connection")
async def test_connection(body: TestConnectionBody):
    try:
        async with httpx.AsyncClient(timeout=12.0) as hc:
            if body.type == "meta":
                # GET https://graph.facebook.com/v21.0/{phone_number_id}?fields=verified_name,display_phone_number
                phone_id = body.config.get("phone_number_id") or body.config.get("phoneNumberId")
                token = body.config.get("access_token") or body.config.get("accessToken")
                if not phone_id or not token:
                    return {"ok": False, "error": "Faltan phone_number_id o access_token"}
                r = await hc.get(
                    f"https://graph.facebook.com/v21.0/{phone_id}",
                    params={"fields": "verified_name,display_phone_number,quality_rating"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                data = r.json() if r.content else {}
                if r.status_code < 400:
                    return {"ok": True, "detail": f"Número verificado: {data.get('display_phone_number', '—')} · {data.get('verified_name', '—')} · calidad {data.get('quality_rating', '—')}"}
                return {"ok": False, "error": f"Meta API: {data.get('error', {}).get('message', r.text[:200])}"}

            elif body.type == "evolution":
                # GET {server}/instance/connectionState/{instance}
                server = (body.config.get("server_url") or "").rstrip("/")
                apikey = body.config.get("api_key")
                instance = body.config.get("instance")
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

            elif body.type == "n8n_webhook":
                url = body.config.get("url")
                if not url:
                    return {"ok": False, "error": "Falta URL del webhook"}
                r = await hc.post(
                    url,
                    json={"_waflow_test": True, "ts": datetime.now(timezone.utc).isoformat()},
                    headers={"X-WAFLOW-Test": "1"},
                )
                return {"ok": r.status_code < 400, "detail": f"HTTP {r.status_code} — webhook responde"}

            else:
                return {"ok": False, "error": f"Tipo desconocido: {body.type}"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Timeout. ¿El servidor está online?"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


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
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
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

    # Construir contenido del PDF
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm, leftMargin=2*cm, rightMargin=2*cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Heading1"], textColor=colors.HexColor("#4F46E5"), spaceAfter=6)
    meta_style = ParagraphStyle("meta", parent=styles["Normal"], textColor=colors.HexColor("#6B7280"), fontSize=9)
    h2_style = ParagraphStyle("h2", parent=styles["Heading2"], textColor=colors.HexColor("#111827"), spaceBefore=12, spaceAfter=6)
    msg_id_style = ParagraphStyle("msgid", parent=styles["Normal"], fontName="Courier-Bold", fontSize=9, textColor=colors.HexColor("#111827"))
    body_style = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#1F2937"))
    note_style = ParagraphStyle("note", parent=styles["Italic"], fontSize=9, textColor=colors.HexColor("#92400E"), leftIndent=10)

    story = []
    story.append(Paragraph(f"WAFLOW · Resumen de revisión", title_style))
    story.append(Paragraph(f"<b>Proyecto:</b> {project.get('name','?')} · <b>Cliente:</b> {project.get('client') or '—'}", meta_style))
    story.append(Paragraph(f"Generado: {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}", meta_style))
    story.append(Spacer(1, 0.4*cm))

    total = len(approval)
    approved = sum(1 for v in approval.values() if (v or {}).get("status") == "approved")
    changes = sum(1 for v in approval.values() if (v or {}).get("status") == "changes")

    stats_data = [
        ["Estado", "Cantidad"],
        ["✓ Aprobados", str(approved)],
        ["✎ Con cambios", str(changes)],
        ["Total revisados", str(total)],
    ]
    t = Table(stats_data, colWidths=[6*cm, 3*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4F46E5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F9FAFB")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("Detalle por mensaje", h2_style))

    def render_vars(text: str) -> str:
        if not text:
            return ""
        out = text
        for v in vars_list:
            name = v.get("name")
            if not name:
                continue
            out = out.replace("{" + name + "}", str(v.get("value") or f"{{{name}}}"))
        return out

    # Mostrar solo mensajes con aprobación registrada (lo revisado)
    # Ordenados por msgKey
    for msg_key in sorted(approval.keys()):
        a = approval[msg_key] or {}
        status = a.get("status")
        status_label = "✓ APROBADO" if status == "approved" else ("✎ CAMBIOS" if status == "changes" else "—")
        color = colors.HexColor("#059669") if status == "approved" else (colors.HexColor("#B45309") if status == "changes" else colors.HexColor("#6B7280"))

        story.append(Paragraph(f"<font name='Courier-Bold' color='#111827'>{msg_key}</font> · <font color='{color.hexval()[2:]}'><b>{status_label}</b></font>", body_style))
        story.append(Paragraph(f"<font color='#6B7280' size='9'>Revisado por: {a.get('by','—')}</font>", meta_style))

        edited_copy = edits.get(msg_key)
        if edited_copy:
            rendered = render_vars(edited_copy).replace("\n", "<br/>")
            story.append(Spacer(1, 0.1*cm))
            story.append(Paragraph(rendered, body_style))
        if a.get("comment"):
            story.append(Spacer(1, 0.1*cm))
            story.append(Paragraph(f"<b>Nota del cliente:</b> {a['comment']}", note_style))
        story.append(Spacer(1, 0.3*cm))

    if total == 0:
        story.append(Paragraph("Sin mensajes revisados todavía.", meta_style))

    # Sección de firma si el link está firmado
    if rec.get("locked"):
        story.append(Spacer(1, 0.8*cm))
        story.append(Paragraph("Firma digital de aprobación", h2_style))
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
        story.append(tsig)
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph(
            "<font color='#6B7280' size='8'>Este hash certifica la integridad del contenido aprobado en el momento de la firma. "
            "Cualquier modificación posterior al contenido invalidaría la firma.</font>",
            meta_style,
        ))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()

    filename = f"WAFLOW_{(project.get('name') or 'review').replace(' ', '_')}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
