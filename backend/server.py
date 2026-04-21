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

    return {
        "project": safe_project,
        "vars": vars_data,
        "edits": edits_data,
        "approval": approval_data,
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
