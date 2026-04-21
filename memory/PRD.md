# WhatsApp Flow Editor v5 — PRD

## Problem Statement (original, verbatim)
> "Hazme esta nueva app con la info que te adjunto"
> 
> Archivos adjuntos: App.jsx (3204 líneas, React + Tailwind + lucide-react), data.js (datos del Excel con flujos, variables y mensajes de una estrategia de lanzamiento webinar), package.json (Vite) y README.md.

## Objetivo
Editor colaborativo multi-proyecto de secuencias de mensajes de WhatsApp para agencias / creadores que lanzan webinars o productos evergreen. Equipos pueden compartir proyectos, editar copies, validar con el cliente, monitorizar envíos reales y generar los workflows de n8n para captación y envío.

## User Personas
- **Agencia / Creator owner**: crea proyectos por cliente, personaliza variables y copies, aprueba.
- **Copywriter / Strategist**: edita copys, añade comentarios internos, configura A/B testing.
- **Cliente**: revisa y aprueba en el "Panel cliente".
- **Integrador técnico**: rellena pestaña Conexiones (Meta API + n8n), configura monitoring.

## Core Requirements (static)
- **13 pestañas por proyecto**: Flujos, Mapa, Calendario, Simulador, Checker, Creativos, Salud, Panel cliente, Versiones, Historial, Conexiones, Captación, Prompt IA
- **2 estrategias**: Lanzamiento Webinar 🎥 y Evergreen / Nurturing ♾️
- **Persistencia compartida** entre equipo (MongoDB backend) para todo excepto el nombre del usuario (localStorage).
- Variables editables/bloqueables, copy edits, creativos, snapshots, historial, variantes A/B, aprobaciones, Meta template metadata, comentarios internos por mensaje.
- Export JSON completo del proyecto.

## Stack
- **Frontend**: React 19 + CRA + Tailwind + lucide-react. Un único `App.jsx` del usuario, sin modificar, más `storage-shim.js` que expone `window.storage` mapeándolo al backend.
- **Backend**: FastAPI + Motor (MongoDB). Endpoints en `/api/`.
- **IA**: Claude Sonnet 4.5 vía `emergentintegrations` con Emergent LLM key.

## What's been implemented (Jan 2026 — initial delivery)
- Backend (`/app/backend/server.py`):
  - `POST /api/storage/set`, `GET /api/storage/get`, `POST /api/storage/delete` — key/value compartido en MongoDB
  - `POST /api/events`, `GET /api/events` — ingesta y listado de eventos para pestaña Salud (n8n webhook)
  - `POST /api/ai/test-chat` — prueba del Prompt IA (Claude Sonnet 4.5, multi-turn stateless)
  - `POST /api/whatsapp/send` — relay a Meta Graph API v21.0 (evita CORS en browser)
- Frontend:
  - App.jsx + data.js del usuario copiados tal cual
  - `storage-shim.js` reemplaza `window.storage` (shared=true → backend; shared=false → localStorage)
  - Fuente Inter (400/500/600/700) precargada
- Testing: 7/7 tests backend passing, flujo end-to-end frontend validado con persistencia real confirmada tras recarga.

## Known mocked / not-yet-wired
- `MonitoringPanel` en App.jsx genera eventos mock con `generateMockEvents()`. Endpoint `/api/events` existe y funciona, pero la UI de Salud aún no hace fetch real — queda como siguiente paso cuando se conecten los workflows de n8n reales.
- `AIPromptPanel` permite editar el system prompt pero no tiene un "Probar" UI que invoque `/api/ai/test-chat`. Endpoint está listo para cuando se añada el botón de prueba.

## Next Action Items (P0/P1 backlog)
- **P1** Cablear MonitoringPanel al endpoint real `GET /api/events?project_id=...`
- **P1** Añadir mini chat de prueba dentro de AIPromptPanel que use `POST /api/ai/test-chat`
- **P2** Añadir `data-testid` a botones/tabs clave para tests automatizados más robustos
- **P2** Migrar `@app.on_event("shutdown")` a FastAPI lifespan handler
- **P2** Honrar o eliminar el flag `shared` en backend (actualmente aceptado pero no usado)
- **P3** Refactor de App.jsx (3204 líneas) en sub-componentes por pestaña para mantenibilidad

## Credentials / Keys in use
- `EMERGENT_LLM_KEY` (en /app/backend/.env) — cuenta de universal key del usuario
- Meta WhatsApp Cloud y n8n: credenciales se introducen en la propia UI (pestaña Conexiones) y se almacenan en la colección MongoDB compartida — aviso ya visible en la UI indicando mover a backend real en producción.
