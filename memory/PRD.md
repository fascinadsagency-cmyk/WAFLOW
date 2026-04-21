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

### Iter 4 (21 ene 2026) — Evolution API, mensajes custom desde Mapa, firma 100%, Monitor real, AI chat, bug delete
- **🐛 Bug crítico resuelto**: eliminar proyectos no funcionaba porque `window.confirm()` está bloqueado en el iframe del preview de Emergent. Reemplazado por `ConfirmDialog` custom con modal rojo "Eliminar definitivamente".
- **Evolution API** (self-hosted) integrada para envíos a comunidades/grupos:
  - Backend: `POST /api/evolution/send` relay con `{server_url, api_key, instance, to, message, delay_ms}`
  - UI: nueva sección "🚀 Evolution API" en ConnectionsPanel
  - Visibilidad restringida: botón "Enviar ahora" + badge "🚀 Evolution API activa" **solo en flujos `broadcasts` y `venta_comunidad`**. Los demás flujos muestran badge "📋 Plantilla Meta oficial" (usar `/api/whatsapp/send` con templates aprobadas por Meta para evitar bans).
  - `EvolutionSendModal` con toggle Grupo/Número, delay en segundos, preview del mensaje ya con variables reemplazadas.
- **Mensajes custom desde Mapa + Flujos**:
  - Estado `customMsgs` por flujo guardado en `wa_editor:p:{pid}:custom_msgs`
  - FLOWS se calcula con `useMemo` mergeando template + customs (respetando `position`)
  - Mapa: botón "+ Añadir mensaje" en cada FlowMiniMap + botones `+`/`⊕` entre mensajes para insertar en posición específica
  - Flujos: barra gradient en el header con botón "Añadir mensaje" y contador de customs
  - Los mensajes custom llevan badge "✨ CUSTOM" + borde purple-ring y se propagan automáticamente a Flujos, Mapa, Calendario, Checker, ClientReview, PublicReviewPage. También incluidos en `GET /api/review/{token}`.
  - MessageCard de un custom puede eliminarse con botón 🗑️ (sin confirm nativo).
- **Snapshot firmado al 100%** (cierra el link público):
  - Backend: `POST /api/review/{token}/sign` con `{signer_name, signer_role}` → SHA-256 del contenido canónico + lock del token
  - Locked tokens: `/approve` y `/sign` devuelven **423 Locked**
  - GET review devuelve `{locked, signature: {signer_name, signed_at, signature_hash, signed_stats}}`
  - PDF incluye tabla con firma + hash + disclaimer cuando el token está locked
  - UI PublicReviewPage: card ámbar "Todos los mensajes aprobados" con botón "🔐 Firmar y cerrar revisión" (solo si `approvedCount===total && !locked`). Tras firmar: card indigo con el nombre + hash + fecha, botones Aprobar/Cambios reemplazados por "Revisión firmada y cerrada".
- **MonitoringPanel cableado al endpoint real** `GET /api/events?project_id=X`:
  - Badge `LIVE` (verde) vs `MOCK` (ámbar) según haya eventos reales
  - Botón "Refrescar" manual
  - Fallback a `generateMockEvents` cuando no hay eventos reales
- **AIPromptPanel con mini chat de prueba**:
  - Botón "🧪 Probar prompt" abre panel chat con Claude Sonnet 4.5 (Emergent LLM key, session_id persistente en la sesión)
  - Pinta burbujas tipo WhatsApp con multi-turn
  - Usa el system_prompt actual ya renderizado con variables

## Testing
- Iter 4: **9/9 backend PASS** + **6/6 iter2 regresión** + 5/6 iter3 (la 1 que falla es un test fixture obsoleto con PID que ya no existe, NO es bug real). Frontend: 7/9 verificados end-to-end + 2 por código.
- Durante iter4 el testing_agent detectó y fixeó 2 bugs críticos introducidos accidentalmente: props de MessageCard (isCustom, canUseEvolution...) no destructuradas + useState `showEvoSend` faltante. Fixes aplicados.

## Known mocked / not-yet-wired
- MonitoringPanel mostrará MOCK hasta que tus workflows n8n empiecen a enviar events a `/api/events`.
- Para Meta Cloud API templates oficiales, el endpoint `/api/whatsapp/send` ya existe pero el frontend no tiene aún botón "Enviar via Meta template" (la pestaña Template del MessageCard sí permite guardar la metadata).

## Next Action Items
- **P1** Añadir botón "Enviar via Meta template" en MessageCard para flujos no-broadcast (usar TemplateMeta.name + /api/whatsapp/send)
- **P1** Configurar tus workflows n8n reales para que envíen events a `POST /api/events` → Monitor en LIVE
- **P2** Mostrar todas las AddBars+badges de flujos incluso cuando están colapsados (mejora UX solicitada por testing)
- **P2** Refactor de MessageCard en sub-componentes (400+ líneas, ya se rompió 1 vez al añadir props)
- **P2** Exportar workflow n8n desde el proyecto (con flujos custom incluidos)
- **P3** Rate-limiting en /api/review/* y /api/evolution/send
- **P3** Fix hash `/sign` para que mismo contenido firmado dos veces de mismo hash (separar content_hash de signed_at)

## Credentials / Keys
- `EMERGENT_LLM_KEY` en `/app/backend/.env`
- Meta WhatsApp Cloud + n8n: desde UI (pestaña Conexiones) → MongoDB compartido
- Review tokens: `secrets.token_urlsafe(18)`, públicos por diseño (URL no-enumerable)

