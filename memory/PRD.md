# WAFLOW — PRD (antes "WhatsApp Flow Editor v5")

## Problem Statement (original, verbatim)
> "Hazme esta nueva app con la info que te adjunto"
>
> Archivos adjuntos: App.jsx (3204 líneas, React + Tailwind + lucide-react), data.js (datos del Excel con flujos, variables y mensajes de una estrategia de lanzamiento webinar), package.json (Vite) y README.md. Branding: logo **FASCINADS** (PNG morado/lila). Nombre del producto: **WAFLOW**.

## Objetivo
Editor colaborativo multi-proyecto de secuencias de mensajes de WhatsApp para agencias / creadores que lanzan webinars o productos evergreen. Equipos pueden compartir proyectos, editar copies, validar con el cliente vía **link mágico público**, monitorizar envíos y generar workflows de n8n.

## User Personas
- **Agencia / Creator owner (Fascinads team)**: crea proyectos por cliente, personaliza variables y copies, aprueba internamente.
- **Copywriter / Strategist**: edita copys, añade comentarios internos, configura A/B testing.
- **Cliente**: revisa y aprueba vía link público `/review/{token}` sin necesidad de cuenta.
- **Integrador técnico**: rellena pestaña Conexiones (Meta API + n8n), configura monitoring.

## Core Requirements
- **13 pestañas por proyecto**: Flujos, Mapa, Calendario, Simulador, Checker, Creativos, Salud, Panel cliente, Versiones, Historial, Conexiones, Captación, Prompt IA
- **2 estrategias**: Lanzamiento Webinar 🎥 y Evergreen / Nurturing ♾️
- **Persistencia compartida** entre equipo (MongoDB backend) para todo excepto el nombre del usuario (localStorage).
- Variables editables/bloqueables, copy edits, creativos, snapshots, historial, variantes A/B, aprobaciones, Meta template metadata, comentarios internos.
- Export JSON completo del proyecto.
- **NEW (iter 2)**: Link mágico de aprobación para cliente (`/review/{token}`) — el cliente ve solo mensajes renderizados y puede aprobar / pedir cambios sin crear cuenta.

## Stack
- **Frontend**: React 19 + CRA + Tailwind + lucide-react. `App.jsx` del usuario + `storage-shim.js` (mapea `window.storage` → backend) + `PublicReviewPage` (ruta `/review/:token`).
- **Backend**: FastAPI + Motor (MongoDB).
- **IA**: Claude Sonnet 4.5 vía `emergentintegrations` con Emergent LLM key.

## What's been implemented

### Iter 1 (21 ene 2026)
- Backend storage compartido (`/api/storage/{set,get,delete}`)
- AI chat (`/api/ai/test-chat`, Claude Sonnet 4.5)
- Events ingest (`/api/events` GET/POST) para pestaña Salud
- WhatsApp relay Meta Graph v21 (`/api/whatsapp/send`)
- Frontend: copia íntegra de `App.jsx`/`data.js`, shim de storage, fuente Inter.

### Iter 2 (21 ene 2026)
- **Branding WAFLOW + logo Fascinads**: logo procesado con PIL a PNG transparente (1819x303), integrado nativamente (sin fondo negro) en headers del dashboard y workspace. Título del browser: "WAFLOW · by Fascinads".
- **Magic approval link**: 
  - Backend: colección `review_tokens`, endpoints `/api/review/create`, `/api/review/{token}` (sanitized GET), `/api/review/{token}/approve`
  - Frontend: `MagicLinkCard` en Panel cliente (genera/copia/abre link), `PublicReviewPage` accesible en `/review/{token}` con:
    - Gate "Antes de empezar" pidiendo nombre del revisor (persistido en localStorage)
    - Progreso X/N aprobados + barra visual
    - Botones Aprobar / Pedir cambios por mensaje
    - Notas del revisor visibles
    - Persistencia real en backend (sobrevive a recargas)
- Fix: tarjeta de proyecto con fecha "—" cuando falta `updated_at`/`created_at`.

### Iter 3 (21 ene 2026) — PDF resumen, webhooks, adjuntar creativos, mini-mapas, var picker
- **PDF resumen descargable**: endpoint `GET /api/review/{token}/summary.pdf` genera PDF con ReportLab (proyecto, stats, detalle por mensaje aprobado/con cambios + notas del cliente). Botón visible al pie de la PublicReviewPage.
- **Webhooks Slack/Discord al ≥80% de aprobación**:
  - Endpoint `POST /api/review/{token}/notify` idempotente (flag `notified_80_at` en `wa_editor:p:{pid}:notify_config`)
  - UI en Conexiones (sección "🔔 Notificaciones al equipo" con 2 URLs + botón resetear)
  - Trigger automático desde PublicReviewPage cuando aprobaciones/total cruzan 80%
- **Adjuntar creativo desde cada mensaje**:
  - `AttachCreativeModal` con 2 tabs: Biblioteca (creativos existentes) + "+ Subir nuevo"
  - Botón "📎 Adjuntar creativo" en la barra de acciones de cada MessageCard
  - Handlers `attachCreative`/`removeCreativeAssoc` en ProjectWorkspace con log en historial
- **Mini-mapas por flujo en pestaña Mapa**:
  - Componente `FlowMiniMap` que muestra mensajes como chips conectados por →
  - Si el flujo tiene ramas, las muestra como bloques separados
  - Click en un chip abre el flujo en pestaña Flujos
- **Variables UI mejorada**:
  - `VarPicker` dentro del modo edición de MessageCard: buscador + variables agrupadas por categoría + sección "🤖 Runtime (rellena n8n)" con NOMBRE, USER_ID, EMAIL, PHONE
  - Click en variable → inserta `{VAR_NAME}` en la posición del cursor del textarea
  - Cada variable muestra su descripción (valor actual o hint de runtime)
  - Panel lateral Variables: bloque informativo explicando por qué hay variables 🔒 bloqueadas (técnicas/tracking) + tooltip en cada botón de candado

## Testing
- Iter 1: 7/7 backend tests + flujo UI end-to-end ✅
- Iter 2: 6/6 nuevos backend tests (review endpoints) + flujo UI completo ✅
- Iter 3: 13/13 backend tests (7 nuevos PDF+notify + 6 regresión iter2) + 5/6 flujos UI (el 6º gated por modal preexistente, código verificado) ✅

## Known mocked / not-yet-wired
- `MonitoringPanel`: datos **MOCK** (`generateMockEvents`). Endpoint `/api/events` real ya existe pero la UI no lo consume.
- `AIPromptPanel`: editor de prompt sin botón "Probar chat". Endpoint `/api/ai/test-chat` listo.

## Next Action Items
- **P1** Cablear MonitoringPanel al endpoint real `GET /api/events?project_id=...`
- **P1** Añadir mini chat de prueba en AIPromptPanel usando `/api/ai/test-chat`
- **P2** Añadir `data-testid` a botones y tabs pre-existentes
- **P2** Migrar `@app.on_event("shutdown")` a lifespan handler FastAPI
- **P2** Refactor de App.jsx (~3800 líneas) en sub-componentes por pestaña
- **P3** Rate-limiting por token en `/api/review/*`
- **P3** Debounce del notify trigger en PublicReviewPage
- **P3** UX: desacoplar prompt "Cómo te llamas?" del click Editar (si ya existe nombre no bloquea)

## Credentials / Keys
- `EMERGENT_LLM_KEY` en `/app/backend/.env`
- Meta WhatsApp Cloud + n8n: desde UI (pestaña Conexiones) → MongoDB compartido
- Review tokens: `secrets.token_urlsafe(18)`, públicos por diseño (URL no-enumerable)

