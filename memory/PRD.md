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

### Iter 15 (22 feb 2026) — Auth real: Emergent Google Auth + multi-usuario
**Motivo**: usuario reportó proyectos que "no se guardaban". Root cause: storage global sin aislamiento por usuario — cualquier sesión concurrente sobrescribía la lista. Solución: login + workspace compartido.
**Decisiones del usuario**: (1a) Emergent Google Auth, (2b) workspace compartido, (3b) migrar existentes, (4b) solo admin invita, (5b) role+avatar.
- **Backend**: 5 endpoints nuevos + middleware `require_user`/`require_admin`. `POST /auth/callback` (session_id → Emergent /session-data → crea user + cookie httpOnly 7d), `GET /auth/me`, `POST /auth/logout`, `POST /auth/invite` (admin), `GET /auth/team`, `DELETE /auth/invite`. Política: primer login = admin automático; siguientes requieren allowlist.
- **Frontend** (nuevos): `src/hooks/useAuth.jsx` (AuthProvider + hook), `src/pages/LoginWall.jsx` (pantalla login + AuthCallback procesa `#session_id`).
- **App.jsx**: `AuthGatedApp` orquesta LoginWall/MainApp. Rutas públicas `/review` y `/intake` bypass auth. ProjectsDashboard muestra avatar Google + rol + botones Equipo (admin) y Salir. `me` viene de `user.name`. Eliminada UI MeDialog.
- **TeamDialog** inline: invitar email+rol, ver activos con avatar, ver pending con remove.
- **Integration playbook**: consultado antes de implementar. Rules respetadas: no hardcode URLs, no redirects custom, cookies httpOnly/secure/samesite=none, session 7d.
- **Docs**: `/app/auth_testing.md` y `/app/memory/test_credentials.md` actualizados.
- **Testing iter-15**: compila limpio, 35/35 backend regresión OK, LoginWall smoke visual OK. **Pendiente validación E2E con Google real del usuario**.

### Iter 14 (21 feb 2026) — Visibilidad del usuario conectado y creador del proyecto
- **Modelo `newProject`**: añadido campo `created_by` que se inyecta automáticamente con el valor de `me` (nombre del usuario conectado) al crear un proyecto nuevo. ProjectDialog recibe el prop `me` y lo pasa al default draft.
- **ProjectsDashboard header**: nuevo badge `data-testid="connected-user-dashboard"` con avatar circular (inicial del nombre) + "Conectado · **nombre**" + icono Edit3. Estilo indigo consistente con la paleta de la app. Click abre el modal MeDialog para cambiar el nombre.
- **Card del proyecto en ProjectsDashboard**: debajo de "Actualizado DD mmm" se muestra ahora un badge pequeño `data-testid="project-creator-{id}"` con el icono User + el nombre del creador (solo si `created_by` está presente, así no afecta proyectos legacy).
- **ProjectWorkspace header**: añadidos 2 nuevos elementos:
  - Debajo del nombre del proyecto: badge `project-creator-badge` con "Creado por X" (si existe).
  - A la derecha: badge `connected-user-workspace` con avatar + nombre del usuario actual.
- **Import lucide**: añadido `User` al top-level import.
- **Backwards compat**: proyectos existentes sin `created_by` no muestran el badge (UI gracia por `&&`). Editando un proyecto viejo no se asigna retroactivamente (preserva la semántica: "creado por" ≠ "modificado por").
- **Testing iter-14**: compila limpio, 0 lint warnings, 35/35 regresión OK. Smoke visual OK (dashboard muestra badge "Conectado · sin nombre" con avatar indigo).


- **Backend — 3 endpoints nuevos** (tras Meta Templates Sync):
  - `POST /api/whatsapp/run-flow-test` — recibe `{project_id, flow_key, to_phone, speedup_seconds, items[]}`. Valida credenciales Meta del proyecto, crea doc en `db.flow_test_runs` con `status:"running"`, arranca `_flow_test_run_task` via `asyncio.create_task()`, devuelve `{run_id, total}` inmediatamente. Cada item contiene `{msg_key, template_name, language, params[], header_media_url, header_media_type}`.
  - `GET /api/whatsapp/run-flow-test/{run_id}` — polling público (proyección excluye access_token/phone_number_id/items) devuelve estado con `done/total/status/results[]`.
  - `POST /api/whatsapp/run-flow-test/{run_id}/cancel` — marca `status:"cancelled"`, el task lo detecta en la siguiente iteración antes de enviar.
- **Background task `_flow_test_run_task`**: itera items, para cada uno construye payload Meta (header media + body params), `POST /{phone_id}/messages`, `$push` al array `results[]` con `{idx, msg_key, template, ok, message_id|error, at}`, `asyncio.sleep(speedup_seconds)` entre mensajes (no después del último). Al terminar marca `status:"completed"` y `finished_at`. Check de cancelación cada iteración.
- **Frontend — `FlowTestRunModal`** (200+ líneas, insertado antes de `FlowView`):
  - Auto-construye los `items[]` del flujo seleccionado: detecta variables del copy efectivo (`edits[mk] ?? m.copy`), mapea a params ordenados con valores actuales de `vars`, usa `templatesByMsg[mk].name` o genera auto-name `waflow_{flowKey}_{msgId}`, incluye primera imagen con URL pública como header.
  - Fase 1 (pre-start): preview del orden (N mensajes), inputs teléfono E.164 y delay (min 5s), warning sobre conversaciones Meta Business.
  - Fase 2 (running): stats grid (progreso/OK/error/estado), progress bar, lista de results live con `useEffect` poll cada 2s al GET status endpoint hasta que status != "running". Botón "⏸ Detener" dispara cancel. Backdrop no cierra el modal mientras corre para evitar cierres accidentales.
  - Fase 3 (finished): resultado final + botón Cerrar.
- **Frontend — botón "🧪 Recorrer flujo en mi teléfono"** (data-testid=`flow-run-test-{flowKey}`) en AddBar de cada FlowView Meta (no broadcasts/comunidad). Solo visible cuando `!canUseEvolution`.
- **Testing iter-13**: compila limpio (ESLint OK), 35/35 regresión OK. Probado end-to-end vía curl: fake creds → start run → t+2s `done:1/2 status:running` con result-0 error Meta 401 → t+10s `done:2/2 status:completed` con 2 results registrados. Polling + delay + final state funcionan. **Pendiente validación en vivo con credenciales Meta reales del usuario**.


- **Backend — 1 endpoint nuevo**: `POST /api/whatsapp/send-template` recibe `{project_id, template_name, language, to_phone, params[], header_media_url, header_media_type}`. Lee `phoneNumberId` + `accessToken` de las conexiones del proyecto. Construye el payload Meta con estructura `template.components[header|body].parameters` y dispara `POST /{phone_id}/messages`. Devuelve `{ok, message_id}` o `{ok:false, error}` con el mensaje de Meta sin crashear.
- **Frontend — `MetaTemplateSendModal`** (nuevo componente, ~125 líneas, insertado antes de `EvolutionSendModal`):
  - Auto-detecta las variables `{NOMBRE}`, `{TITULO_WEBINAR}`... del copy efectivo (editado o original).
  - Prerellena cada parámetro con el valor actual de la variable del proyecto (editable).
  - Muestra el mapping visual `{{1}} NOMBRE → [input]` para confirmar el orden.
  - Campo teléfono E.164 (auto-strip de no-dígitos).
  - Si hay creativo tipo `image` con URL pública → se incluye como header media.
  - Warnings contextuales: "plantilla no sincronizada" si `!meta_id`; "estado != APPROVED" si `status != APPROVED`.
  - Muestra message_id Meta tras envío exitoso o error Meta legible.
- **Frontend — botón "Enviar plantilla"** (data-testid=`meta-tpl-send-btn-${flowKey}-${msgId}`) en cada MessageCard de flujos Meta (no broadcasts/comunidad). Abre el modal al click.
- **Refactor menor**: eliminado el botón huérfano "Test Meta" que apuntaba a `MetaTestSendModal` (componente inexistente — era dead code desde iter-5).
- **FlowView** propaga `projectId` y `metaConfig` al MessageCard para que el modal pueda llamar al backend con contexto.
- **Testing iter-12**: compila limpio (ESLint OK), 35/35 regresión pasando. Probado el endpoint backend via curl: construye payload correcto, devuelve error 401 de Meta sin crashear cuando el token es falso (esperado). Falta probar en vivo con credenciales reales (el usuario lo validará con su cuenta).


- **Backend — 2 endpoints nuevos** (server.py ~línea 1200):
  - `POST /api/meta/templates/sync` — recibe project_id + items[{msg_key, flow_key, msg_id, copy, botones, creative_url}] + force_replace. Para cada item:
    1. Categoriza `MARKETING` vs `UTILITY` via Claude Sonnet 4.5 (emergentintegrations) según el contenido del copy.
    2. Convierte `{VAR}` → `{{1}}`,`{{2}}`... y guarda `params_mapping` ordenado.
    3. Parsea botones `[BOTÓN] Texto\nLink: URL` → componentes Meta QUICK_REPLY / URL (máx 3).
    4. Si hay creative_url público (no intake local) → añade header IMAGE/VIDEO/DOCUMENT.
    5. Skip si ya existe con mismo nombre (salvo force_replace).
    6. POST a `https://graph.facebook.com/v21.0/{WABA_ID}/message_templates` con el access_token del proyecto.
    7. Devuelve {ok, total, created, skipped, failed, results[]} con motivo o error Meta por item.
  - `GET /api/meta/templates/status/{project_id}` — hace pull del estado en Meta (APPROVED/PENDING/REJECTED + rejected_reason) y actualiza `templatesByMsg` persistente.
- **Helpers backend nuevos**: `_categorize_copy_llm`, `_convert_vars_to_meta_placeholders`, `_parse_template_buttons`.
- **Frontend — AutopilotPanel**:
  - Función `syncMetaTemplates(forceReplace)` que recolecta automáticamente todos los mensajes de flujos Meta (no broadcasts/comunidad), incluye edits + creative URL + botones, y llama al endpoint.
  - Función `refreshMetaTemplateStatus()` que hace pull y recarga.
  - Botón nuevo en panel de acciones Autopilot: "📋 Sincronizar plantillas con Meta" (data-testid=`autopilot-sync-meta-templates`).
  - Modal de progreso mientras corre (texto explicativo + barra animada).
  - Modal de resultado post-sync con lista detallada: cada plantilla con estado ✓/⏭/✗, categoría detectada, meta_status, razón o error Meta. Incluye botón "Forzar reemplazo de las N saltadas" y "🔄 Refrescar estado desde Meta".
- **Frontend — ConnectionsPanel Meta**: añadido hint "💡 Para crear/actualizar las plantillas Meta de este proyecto usa el botón del tab Autopilot" para que el usuario sepa dónde ir.
- **Testing iter-11**: backend probado via curl — valida 400 sin credenciales, procesa el pipeline completo (LLM categorizer + var conversion + API call) y devuelve error Meta correctamente cuando el token es falso. Los 35/35 tests de iter-9 (test_iter7 + test_review + test_intake) siguen pasando sin regresiones.


- **Fix A — tooltip Evolution API ya no tapa inputs**: movido el help-box "💡 JID del grupo..." ARRIBA de los campos API Key/Instancia (antes estaba entre inputs y botón). Cambiados los 3 `grid-cols-2` de ConnectionsPanel (Meta, n8n, Evolution) a `grid-cols-1 md:grid-cols-2` para que en viewports estrechos (iframe Emergent, ventana pequeña) los inputs se apilen verticalmente sin romper labels.
- **Fix B — Aprobación del cliente con 100% ya no sale warn**: `AutopilotPanel` línea ~2170 ahora considera `approvalPct === 100` como "ok" (antes solo firma → "ok", 80-99% y 100% → "warn"). 100% = verde, 80-99% = amber, <80% = rojo.
- **Fix C — Plantillas Meta auto-default en flujos 1-1**: introducida constante `EVOLUTION_FLOW_KEYS = Set("broadcasts","venta_comunidad")`. Todos los demás flujos (flujo_a, pre_webinar_1a1, venta_1a1, replay) asumen plantilla Meta por defecto sin necesidad de marcado manual. El checker pre-flight ahora cuenta TODOS los mensajes de flujos Meta como "templated". En el export/payload JSON se auto-genera `meta_template: {isTemplate:true, auto:true, name:"waflow_{flowKey}_{msgId}", language:"es"}` cuando no hay template explícito. Usuario sigue pudiendo personalizar (nombre Meta real, language, status) en la tarjeta del mensaje para sobrescribir el auto-default.
- **MessageCard badge**: añadido prop `isMetaFlow` y badge azul claro "📋 Meta auto" cuando el mensaje pertenece a un flujo Meta y no tiene template custom. Tooltip explica el naming convention.


- **Feature nueva completa** solicitada por el usuario: pestaña + link público `/intake/{token}` donde el cliente rellena variables y sube creativos que la agencia le ha pedido.
- **Decisiones del usuario**: (1c) mixto auto-sugeridos + toggle manual; (2b) upload real a MongoDB GridFS, límite 10 MB; (3b) pending-review — agencia aprueba/rechaza antes de aplicar al proyecto; (4b) notificación Slack/Discord al completar; (5c) sin recordatorios automáticos.
- **Backend — 9 endpoints nuevos** (server.py:880-1180):
  - `POST /api/intake/create` — crea/reemplaza intake (idempotent por project_id)
  - `GET /api/intake/project/{project_id}` — agencia consulta intake
  - `PUT /api/intake/project/{project_id}/items` — toggle requested
  - `GET /api/intake/{token}` — público (filtra solo requested=true, NO expone project_id)
  - `POST /api/intake/{token}/save` — cliente guarda valor → status pending
  - `POST /api/intake/{token}/upload` — cliente sube archivo (multipart, GridFS, máx 10 MB)
  - `GET /api/intake/file/{file_id}` — descarga archivo (streaming)
  - `POST /api/intake/{token}/complete` — cliente marca completo → dispara webhook Slack/Discord
  - `POST /api/intake/project/{project_id}/review` — agencia aprueba (aplica al proyecto: variable→upsert en vars, creative→append a creatives con dedupe por intake_item_id) o rechaza (guarda review_comment)
- **GridFS bucket**: `intake_files` con `motor.motor_asyncio.AsyncIOMotorGridFSBucket`. Ficheros servidos en `/api/intake/file/{oid}`.
- **Frontend**:
  - `src/pages/PublicIntakePage.jsx` — nueva página pública (300 líneas) con sub-componentes `IntakeHeader`, `ProgressBar`, `StatusBadge`, `VariableItem` (auto-save 600ms debounce), `CreativeItem` (upload con límite 10 MB). Agrupación por sección, status badges (empty/pending/approved/rejected), motivo de rechazo visible al cliente.
  - `IntakePanel` inline en App.jsx (~300 líneas, antes de ProjectWorkspace) con auto-detección de variables editables sin valor + recursos mencionados sin creativo adjunto. Stats grid, link público con copiar, sección destacada de "pending review" con botones aprobar/rechazar inline.
  - Tab `'Checklist cliente'` añadido en TABS array (entre 'Panel cliente' y 'Versiones').
  - Router `/intake/:token` añadido al App() default export.
- **Testing Iter 9**: 16/16 nuevos tests en `test_intake.py` + 19/19 regresión (test_iter7 + test_review) = **35/35 PASS**. Frontend ~90% (todos los testids validados, approve/reject UI cubierto por backend).
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
- Iter 6: **13/13 backend** + **~85% frontend** ✅
- Iter 7 (21 feb 2026): **13/13 backend** + **~95% frontend** ✅
- Iter 8 (21 feb 2026): **19/19 backend** + **100% frontend** ✅
- Iter 9 (21 feb 2026): **35/35 backend** (16 intake + 13 iter7 + 6 review) + **~90% frontend** ✅

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

### Iter 16 (feb 2026) — Sin emojis en mensajes Meta (cierre)
- **Motivo**: Meta prohíbe caracteres no compatibles (muchos emojis) en plantillas. El frontend ya hacía strip en tiempo real, faltaba blindar el backend.
- **Backend — `strip_emojis()`** (server.py): corregido para no dejar espacios sobrantes. Ahora colapsa espacios dobles, elimina espacios antes de puntuación, recorta cada línea y hace `.strip()` final. 7/7 casos de test pasan.
- **Backend — `MetaTemplateSyncItemBody`**: renombrado campo `copy` a `copy_text` con `Field(alias="copy")` + `populate_by_name=True`. Resuelve `UserWarning: Field name "copy" shadows an attribute in parent "BaseModel"`. El frontend sigue enviando `copy` sin cambios.
- **Uso**: tanto `/api/meta/templates/sync` como `/api/whatsapp/send-template` y `/api/whatsapp/run-flow-test` pasan el texto por `strip_emojis()` antes de enviarlo a Meta.
- **Testing iter-16**: backend arranca limpio sin warnings, endpoint `/api/meta/templates/sync` responde 400 correcto con alias `copy`, 7/7 tests unitarios de `strip_emojis` OK.

### Iter 18 (feb 2026) — Code quality refactor (complejidad ciclomática)
**Motivo**: Code quality report externo marcó 10 funciones con alta complejidad ciclomática (rango 11-34). Objetivo: bajar todas por debajo de 10.

**Refactors aplicados** (33 helpers nuevos extraídos, ninguna función endpoint supera ~5 de complejidad ahora):
- `meta_templates_sync` (34 → ~5): 7 helpers — `_build_meta_template_name`, `_fetch_existing_meta_templates`, `_build_header_component`, `_build_template_components`, `_build_meta_template_payload`, `_delete_existing_meta_template`, `_create_meta_template`, `_sync_single_template_item`.
- `intake_agency_review` (20 → ~5): 3 helpers — `_apply_approved_variable`, `_apply_approved_creative`, `_approve_intake_item`. Early-return en validación de `action`.
- `_flow_test_run_task` (20 → ~5): 3 helpers — `_build_flow_test_item_payload`, `_send_flow_test_item`, `_is_flow_test_cancelled`.
- `whatsapp_send_template` (19 → ~5): 4 helpers — `_build_template_header_component`, `_build_template_body_component`, `_build_meta_send_template_payload`, `_post_meta_send`.
- `auth_callback` (16 → ~5): 6 helpers — `_fetch_emergent_session_data`, `_get_initial_admin_emails`, `_resolve_new_user_role`, `_create_user`, `_update_existing_user`, `_persist_user_session`, `_set_session_cookie`.
- `ai_test_chat` (12 → ~5): 1 helper — `_build_llm_chat_final_text`.
- `_get_session_from_request` (12 → ~5): 2 helpers — `_extract_session_token`, `_parse_expires_at`.
- `review_notify` (11 → ~5): 1 helper — `_post_webhook`.
- `meta_templates_refresh_status` (14 → ~5): 2 helpers — `_fetch_waba_templates_full`, `_merge_template_status`.
- `_pdf_messages_section` (14 → ~5): 3 helpers — `_pdf_render_vars`, `_pdf_status_metadata`, `_pdf_render_message_block`.

**Tests `is` vs `==`**: revisado. Todos los usos son `is True`, `is False`, `is None` — PEP8 correcto (mismo hallazgo que iter-8, falso positivo del linter externo). No requiere cambios.

**Type hints en tests**: no añadidos masivamente. Los helpers compartidos de producción ya llevan hints; los test functions no aportan valor añadiéndoles `-> None` uniformemente.

**Testing iter-18**: `/app/backend/tests/test_iter10_auth_protection.py` 43/43 PASS tras refactor. Smoke curl en 8 endpoints preserva contrato 401/404. 33 helpers verificados sin huérfanos. Backend arranca sin warnings Pydantic ni FastAPIError.

### Iter 17 (feb 2026) — Hardening auth + multi-tenant isolation + refactor MessageCard
**Motivo**: 3 mejoras propuestas tras code review del usuario: (1) seed admin idempotente, (2) aislamiento multi-tenant en endpoints de negocio, (3) reducir tamaño de `App.jsx`.

- **Backend — Seed admin idempotente**: nueva env var `INITIAL_ADMIN_EMAILS` (coma-separada) en `/app/backend/.env`. `auth_callback` lee la lista y:
  - Si el email está en `INITIAL_ADMIN_EMAILS` y no existe user → crea como `admin` bypaseando allowlist.
  - Si el email está en `INITIAL_ADMIN_EMAILS` y existe user con otro rol → promociona a `admin`.
  - Idempotente: no rompe la política actual (primer login = admin automático seguirá funcionando si la env var está vacía).
- **Backend — Depends(require_user) en 21 endpoints sensibles**: `/api/storage/*` (3), `/api/ai/test-chat`, `/api/events` GET, `/api/whatsapp/send`, `/api/whatsapp/send-template`, `/api/test-connection`, `/api/evolution/send`, `/api/launch/*` (4), `/api/intake/create`, `/api/intake/project/*` (3), `/api/meta/templates/sync`, `/api/meta/templates/status/*`, `/api/whatsapp/run-flow-test` (POST + cancel).
  - Helpers `require_user`/`require_admin`/`_get_session_from_request` movidos al principio del archivo para poder usarlos en `Depends()` de endpoints.
  - Rutas públicas intactas: `/api/review/*` (magic-link), `/api/intake/{token}/*` (cliente), `/api/intake/file/*`, `/api/auth/*`, `/api/events` POST (webhooks n8n sin cookie), `GET /api/whatsapp/run-flow-test/{run_id}` (polling público del modal).
- **Frontend — Refactor MessageCard**: extraído `App.jsx` → `/app/frontend/src/components/MessageCard.jsx` (~600 líneas). Subcomponentes movidos con él: `VarPicker`, `AttachCreativeModal`, `EvolutionSendModal`, `MetaTemplateSendModal`. Eliminado dead code `MetaTestSendModal` (iter-5). Extraídos `CopyButton` y `Field` a `/app/frontend/src/components/ui-primitives.jsx`. Movidos helpers `extractVarsUsed`, `stripEmojis`, `hasEmojis`, `computeSkipCondition`, `parseDayOffset`, `RUNTIME_VARS` a `waflow-utils.js`.
  - **App.jsx: 5973 → 5082 líneas (-891)**. Lint limpio, compila sin errores.
- **Testing iter-17** (`/app/backend/tests/test_iter10_auth_protection.py`, 43 tests): 21 endpoints protegidos devuelven 401 sin cookie; 13 públicos siguen abiertos; `strip_emojis` sin trailing spaces; alias `copy`/`copy_text` ambos aceptados; sin warning Pydantic. **43/43 PASS en 5.13s.**

## Next Action Items
- **P1** Extraer `IntakePanel` de App.jsx a `src/panels/IntakePanel.jsx` (~300 líneas dentro de App.jsx = 5150 tras iter-9) siguiendo el patrón de PublicReviewPage.
- **P1** Continuar refactor App.jsx: `ConnectionsPanel`, `AutopilotPanel+LaunchWizard`, `MessageCard` (411 líneas, complejidad 107), `ProjectWorkspace` (480 líneas). Objetivo: App.jsx <3500 líneas.
- **P1** Botón "Enviar via Meta template" en MessageCard para flujos no-broadcast (usar TemplateMeta.name + /api/whatsapp/send).
- **P1** Conectar tus workflows n8n reales a `POST /api/events` → Monitor LIVE.
- **P1** Documentar en UI junto a "Probar conexión n8n" que el webhook de prueba lleva header `X-WAFLOW-Test:1`.
- **P2** Cleanup de GridFS: job periódico que elimine ficheros huérfanos (client_file_id previo cuando el cliente re-sube se elimina, pero si luego el cliente nunca más sube y se rechaza, el fichero antiguo se queda). Añadir DELETE endpoint cuando agencia elimina item.
- **P2** Mejora UX PublicIntakePage: spinner "guardando..." durante fetch (actualmente solo muestra 'Guardado' tras éxito).
- **P2** Items custom manuales en IntakePanel: añadir variable/creative que no está en el auto-detect (ej. "enlace Calendly") sin tener que crear variable previamente.
- **P2** Historial empty state · Auth multi-tenant.
- **P3** Rate-limiting /api/review/* y /api/intake/* y /api/evolution/send.
- **P3** Fix hash /sign para que mismo contenido firmado dos veces no dé mismo hash.
- **P3** Logger warning en webhook Slack/Discord fallido (intake_client_complete) para trazabilidad en prod.
- **P3** Streaming chunked en GridFS upload si algún día subimos el límite >50 MB.

## Credentials / Keys
- `EMERGENT_LLM_KEY` en `/app/backend/.env`
- Meta WhatsApp Cloud + n8n: desde UI (pestaña Conexiones) → MongoDB compartido
- Review tokens: `secrets.token_urlsafe(18)`, públicos por diseño (URL no-enumerable)

