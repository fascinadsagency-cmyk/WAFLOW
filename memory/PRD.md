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

### Iter 6 (21 ene 2026) — Modo Lanzamiento Activo
- **Backend — 4 endpoints nuevos**:
  - `POST /api/launch/deploy`: recibe `{project_id, workflow_json, n8n_webhook_url, snapshot_id}`, hace relay al webhook de deploy de n8n, persiste `wa_editor:p:{pid}:active_launch` con `{launch_id, status, deploy_result, ...}`
  - `GET /api/launch/{pid}/status`: devuelve `{active, launch, stats: {sent, delivered, read, failed, clicked, replied}, delivery_rate, read_rate}` calculados desde `/api/events` del proyecto
  - `POST /api/launch/complete`: archiva launch a `launch_history` (últimos 20) y BORRA `active_launch`
  - `POST /api/launch/{pid}/stop`: igual que complete pero con reason='stopped'
- **Frontend — LaunchWizard modal**:
  - Botón "🚀 Lanzar ahora" gigante rojo/naranja col-span-2 al inicio de las Acciones del Autopilot
  - Disabled si `readyPct<100` OR `status==='frozen'` OR `launchStatus.active`
  - Al abrir: auto-crea snapshot etiquetado "Pre-launch · {fecha}" + abre wizard con 5 steps (📸 snapshot / 🚀 deploy / 📡 polling / ⏱️ 95% / 🔒 auto-freeze)
  - Envía workflow a `/api/launch/deploy`
- **Live Launch card** (aparece bajo el checklist cuando hay launch activo):
  - 4 métricas (Enviados/Entregados/Leídos/Fallidos)
  - Barra de tasa de entrega (verde si ≥95%, indigo si <)
  - Botón "⏹ Cancelar" que llama a `/api/launch/{pid}/stop`
- **Auto-freeze**: cuando `delivery_rate >= 95%`, el frontend llama a `/api/launch/complete` automáticamente y actualiza `project.status='frozen'` via `onUpdateProject`
- **Polling**: cada 30s `GET /api/launch/{pid}/status`. Se corta automáticamente cuando el launch ya no está activo (performance improvement tras feedback del testing agent)
- **ConnectionsPanel**: nuevo campo "Webhook deploy (🚀 Lanzar ahora)" (`n8nDeployWebhookUrl`)
- **createSnapshot** ahora devuelve el ID del snapshot creado (necesario para pasarlo al wizard)

### Iter 8 (21 feb 2026) — Code Review Refactor (3 fases)
- **Fase 1 — Fixes seguros**:
  - `storage-shim.js:72` catch vacío → `console.warn("localStorage delete failed", e)`
  - 20 array-index keys reemplazados por compound keys estables (`btn-${i}-${b}`, `edge-${e.from}-${e.to}-${i}`, `line-${n.id}-${i}`, `chatmsg-${i}-${m.role}`, `chk-${c.type}-${i}-${c.flowKey}-${c.msgKey}`, etc.)
  - `is True`/`is False`/`is None` en tests validados como PEP8-correct (ruff lo confirma) — falso positivo del reporte, no cambiar
- **Fase 2 — Backend complexity + Hook deps**:
  - `test_connection()` (52 líneas, complejidad 19) extraído en 3 async helpers: `_test_meta_connection`, `_test_evolution_connection`, `_test_n8n_connection` — router con dict `handlers`, complejidad del endpoint cae a <5
  - `review_summary_pdf()` (137 líneas, complejidad 29, 34 locals) extraído en 5 helpers: `_pdf_styles`, `_pdf_header`, `_pdf_stats_table`, `_pdf_messages_section`, `_pdf_signature_section` — endpoint reducido a 30 líneas
  - 18 warnings de `react-hooks/exhaustive-deps` eliminados: `fetchEvents` → `useCallback` en MonitoringPanel; 14 `useEffect` de persist añaden `debouncedSave` a deps; `API` envuelto en `useMemo` en PublicReviewPage; `failed.length` inline dentro del useMemo de stats
- **Fase 3 — Refactor arquitectural (nuevos archivos)**:
  - `src/hooks/useConfirm.jsx` — `ConfirmProvider` + `useConfirm` hook + `ConfirmDialog` (z-[70]) extraídos. MainApp migrado de `setConfirmDialog` local a `askConfirm()` hook (handleDelete)
  - `src/pages/PublicReviewPage.jsx` — 280 líneas, dividido en 7 sub-componentes: `ReviewHeader`, `ReviewerNameCard`, `ProgressCard`, `SignatureCard`, `SignCtaCard`, `ReviewMessageCard`, `PublicReviewPage` (main)
  - `src/waflow-utils.js` — utilidades compartidas (`getFlowsForStrategy`, `replaceVars`, `parseButtons`) para evitar ciclos de imports entre App.jsx y PublicReviewPage.jsx
- **App.jsx**: 5211 → 4851 líneas (-360)
- **Testing iter 8**: 19/19 backend PASS + Frontend 100% (useConfirm end-to-end, PublicReviewPage extraída renderiza 73 msgs + PDF descargable, smoke tabs Salud + Prompt IA + Conexiones)

## Testing
- Iter 6: **13/13 backend** (8 nuevos launch + 5 regresión) + **~85% frontend** end-to-end ✅
- Iter 7 (21 feb 2026): **13/13 backend** (7 test-connection + 3 smoke + 2 launch + 1 review) + **~95% frontend** ✅
- Iter 8 (21 feb 2026): **19/19 backend** (sin regresiones) + **100% frontend** (6/6 flujos testeados) ✅

### Iter 7 (21 feb 2026) — Validación beta interna
- **useConfirm global** (ConfirmProvider + ConfirmDialog z-[70] + hook `useConfirm()`) montado en `<App>` para reemplazar `window.confirm` (bloqueado en iframe Emergent)
- **Botones "Probar conexión"** para Meta/Evolution/n8n en ConnectionsPanel con data-testid (`test-meta-btn`, `test-evolution-btn`) — backend `POST /api/test-connection` valida credenciales sin lanzar campañas
- **Botón "Test Send"** Meta (`meta-send-test-btn`) para enviar mensaje real antes del launch
- **Checker reforzado**: detección de placeholders sin cerrar, límites de longitud, variables sin definir, botones sin user_id
- **Fix compilación**: `testing`/`testResult` duplicados en ConnectionsPanel → renombrados a `sendingMsg`/`sendMsgResult`; código huérfano `irmDialog(null)}` al final del archivo → eliminado
- **P1 resuelto**: `launch_status` migrado de `.find().to_list(5000)` a **aggregation pipeline `$group`** → sin límite, más eficiente, soporta webinars >5k events
- **P1 resuelto**: Indicador de uso LLM en AIPromptPanel (badge `💳 N mensajes · créditos Emergent LLM` con gradiente indigo→amber→red según volumen)
- **Hardening `/api/test-connection`**: header `X-WAFLOW-Test: 1` en POST a webhooks n8n para que el cliente filtre payloads de prueba
- Fixes backend: aggregation mantiene 13/13 tests en verde (pytest_iter7.xml)
- Fix menor: `App.jsx` comentario `fixed inset-0 z-[60]` → `z-[70]` para ConfirmDialog (garantiza estar sobre todos los modales z-50)
- El único flujo NO testeable end-to-end en UI fue clicar el botón con `readyPct=100` (requiere seed de todos los checks OK). El endpoint `/api/launch/deploy` sí está 100% cubierto por pytest (httpbin 200 success + httpbin 500 fail).
- Post-iter6 improvements aplicados:
  - `complete` y `stop` ahora borran `active_launch` (no solo cambian status) → más robusto, no deja cards fantasma
  - Polling se auto-para cuando no hay launch activo → ahorra 1 req/30s por proyecto parked
  - URL del nodo Evolution en export n8n con prefix `=` (expression mode)

## Known limitations (para priorizar si escala)
- `launch_status` calcula stats en Python con `.find().to_list(5000)`. Para proyectos >5k events migrar a aggregation pipeline `$group`.
- `/api/launch/deploy` acepta cualquier string como webhook URL (no valida contra `HttpUrl`). httpx bloquea ~2s con hosts inválidos y devuelve `deploy_failed` pero validar con pydantic sería más limpio.
- `stopLaunch` UI usa `window.confirm` — parar un launch en producción es irreversible, debería usar el `ConfirmDialog` custom como deleteProject.
- `App.jsx` supera las **5100 líneas**. Urgente extraer `AutopilotPanel` y `LaunchWizard` a archivos separados antes de iter-7.
- **Nueva pestaña "Autopilot"** (primera en la barra, icono ⚡):
  - Header hero: `{readyPct}% listo para lanzar` con barra de progreso; cambia a gradiente slate-oscuro + "🔒 Proyecto congelado" cuando status='frozen'
  - Timeline de 5 fases: Setup → Copies → Creativos → Deploy → Launch (con emojis, estados done/active/pending)
  - **Pre-flight checklist** con 7-8 items booleanos calculados en tiempo real:
    - Variables rellenas (% editables con valor)
    - Aprobación del cliente (lee el review_token, detecta `locked` y `signer_name`)
    - Plantillas Meta marcadas (mínimo 3 templates asignadas)
    - Meta Cloud API configurada (phone_id + access_token)
    - n8n webhook configurado
    - **Evolution API** (solo si hay mensajes en broadcasts/venta_comunidad)
    - Creativos en mensajes clave (% de primeros 2 de cada flujo)
    - Notificaciones Slack/Discord (opcional)
  - Cada check es clickable: navega a la pestaña correspondiente
  - Status pill: ✓ OK / ⚠ AVISO / ✗ FALTA
- **Acciones 1-click**:
  - **Exportar workflow n8n** (`.json` ~100KB): Webhook entrada → Code normaliza → Wait por flujo → httpRequest por mensaje. Usa n8n-nodes-base.httpRequest con expressions (`={{ $env.EVOLUTION_URL }}...`, `={{ $env.PHONE_NUMBER_ID }}...`). Detecta automáticamente si usar Evolution (broadcasts/venta_comunidad) o Meta Graph (resto con template si está marcado). Metadata incluye project_id, estrategia, timestamp, notas de env vars requeridas.
  - **Crear snapshot manual** con label custom
  - **Abrir link mágico cliente** (link público, detecta si ya firmado)
  - **Descargar PDF resumen** (incluye firma si está locked)
  - **Congelar/Descongelar proyecto**: persiste `project.status='frozen'` en projects_list; header muestra badge "🔒 CONGELADO"
- **onUpdateProject(id, patch)** callback propagado de MainApp → ProjectWorkspace para persistir cambios de metadata (status, etc.)
- **Fix menor**: URL del nodo Evolution en JSON exportado ahora usa prefix `=` (expression mode correcto en n8n)

## Testing
- Iter 5: **19/19 backend** (4 nuevos + 15 regresión iter3+4) + **14/14 frontend** end-to-end ✅ incluyendo download JSON n8n 102KB con 81 nodes parseables, freeze/unfreeze con badge, checklist navegación, snapshot via prompt, todas las regresiones iter-4 estables.

## Known mocked / not-yet-wired
- `MonitoringPanel`: LIVE cuando n8n envíe events reales, MOCK mientras tanto (fallback automático).

## Next Action Items
- **P1** Continuar refactor arquitectural de App.jsx (4851 líneas aún): extraer `ConnectionsPanel` (~200 líneas), `AutopilotPanel`+`LaunchWizard` (~500), `MessageCard` (~411, complejidad 107 según reporte), `ProjectWorkspace` (~480). Objetivo: <3000 líneas en App.jsx.
- **P1** Añadir `data-testid="delete-project-${id}"` al botón Trash2 de ProjectsDashboard (App.jsx:1405) — reportado por testing agent, facilitará QA automatizado sin depender del hover.
- **P1** Añadir botón "Enviar via Meta template" en MessageCard para flujos no-broadcast (usar TemplateMeta.name + /api/whatsapp/send)
- **P1** Conectar tus workflows n8n reales a `POST /api/events` → Monitor LIVE
- **P1** Documentar en UI (help text junto a "Probar conexión n8n") que el webhook de prueba lleva header `X-WAFLOW-Test: 1` y el cliente debe filtrarlo en su flow de producción.
- **P2** Crear flujos desde cero (hoy solo se añaden mensajes a las 6 plantillas)
- **P2** Historial empty state con copy explicativo cuando 0 snapshots
- **P2** Multi-tenant auth (Login/Register) — pendiente tras validación beta
- **P2** Tests unitarios React Testing Library para sub-componentes de PublicReviewPage (ReviewHeader, ReviewerNameCard, etc.) y useConfirm hook
- **P3** Rate-limiting en /api/review/* y /api/evolution/send
- **P3** Fix hash `/sign` para que mismo contenido firmado dos veces no dé mismo hash (separar content_hash de signed_at)
- **P3** Persistencia `waflow_me` entre sesiones (confirmar que el shim guarda en backend y no solo memory)

## Credentials / Keys
- `EMERGENT_LLM_KEY` en `/app/backend/.env`
- Meta WhatsApp Cloud + n8n: desde UI (pestaña Conexiones) → MongoDB compartido
- Review tokens: `secrets.token_urlsafe(18)`, públicos por diseño (URL no-enumerable)

