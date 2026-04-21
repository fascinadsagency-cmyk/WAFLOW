import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Copy, Check, Download, Search, MessageCircle, Radio, DollarSign, Users,
  PlayCircle, ChevronDown, ChevronRight, FileJson, Eye, EyeOff, Smartphone,
  X, RotateCcw, Save, Cloud, CloudOff, Map, Image as ImageIcon, Plug, Bot,
  Upload, Link as LinkIcon, Send, AlertTriangle, Trash2, Play, ArrowLeft,
  Plus, Folder, Archive, Edit3, Calendar as CalIcon, GitBranch, Clock, Activity,
  History, FlaskConical, FileCheck, MessageSquare, CheckCircle2, AlertCircle,
  Share2, ExternalLink, ClipboardCheck, GitCommit, TrendingUp, Zap, User
} from "lucide-react";

import { ConfirmProvider, useConfirm } from "./hooks/useConfirm";
import PublicReviewPage from "./pages/PublicReviewPage";
import PublicIntakePage from "./pages/PublicIntakePage";

// === DATOS DEL EXCEL (importados desde data.js) ===
import { RAW_DATA as RAW } from "./data.js";

const cleanVariablesBase = RAW.variables.filter(v => v.name !== "VARIABLE" && v.name && v.name.trim() !== "");

const CALENDAR_VARS = [
  { category: "📆 CALENDARIOS", name: "LINK_GCAL_AVISO", value: "https://calendar.google.com/calendar/render?action=TEMPLATE&text={TITULO_WEBINAR}&dates={FECHA_WEBINAR_GCAL}/{FECHA_WEBINAR_GCAL_END}&details={PROMESA_WEBINAR}&location={LINK_ZOOM}", editable: true },
  { category: "📆 CALENDARIOS", name: "LINK_OUTLOOK_AVISO", value: "https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject={TITULO_WEBINAR}&startdt={FECHA_WEBINAR_ISO}&enddt={FECHA_WEBINAR_ISO_END}&body={PROMESA_WEBINAR}&location={LINK_ZOOM}", editable: true },
  { category: "📆 CALENDARIOS", name: "LINK_APPLE_ICS", value: "{DOMINIO_BASE}/calendar/webinar.ics", editable: true },
  { category: "📆 CALENDARIOS", name: "FECHA_WEBINAR_GCAL", value: "20260415T210000", editable: true },
  { category: "📆 CALENDARIOS", name: "FECHA_WEBINAR_GCAL_END", value: "20260415T223000", editable: true },
  { category: "📆 CALENDARIOS", name: "FECHA_WEBINAR_ISO", value: "2026-04-15T21:00:00", editable: true },
  { category: "📆 CALENDARIOS", name: "FECHA_WEBINAR_ISO_END", value: "2026-04-15T22:30:00", editable: true },
];

const WEBINAR_DEFAULT_VARS = [...cleanVariablesBase, ...CALENDAR_VARS];

const RUNTIME_VARS = new Set([
  "NOMBRE", "USER_ID", "EMAIL", "PHONE",
  "RESPUESTA_MOTIVACION", "RESPUESTA_DOLOR", "RESPUESTA_OBJETIVO", "RESPUESTA_MIEDO",
  "RESPUESTA_M3", "RESPUESTA_M4", "RESPUESTA_INGRESOS", "RESPUESTA_ESPECIFICA",
  "RANGO_FACTURACION", "TITULO_GUIA_SEGUN_PERFIL"
]);

// === FLUJOS DE LA ESTRATEGIA WEBINAR (tu Excel) ===
const FLOWS_WEBINAR_DEF = [
  { key: "flujo_a",         label: "Flujo A — Escribe primero",  iconName: "MessageCircle", color: "#25D366", items: RAW.flujo_a,         branching: true  },
  { key: "pre_webinar_1a1", label: "1-1 Pre-webinar",            iconName: "Users",         color: "#128C7E", items: RAW.pre_webinar_1a1, branching: false },
  { key: "broadcasts",      label: "Broadcasts programados",     iconName: "Radio",         color: "#075E54", items: RAW.broadcasts,      branching: false },
  { key: "venta_1a1",       label: "Venta 1-1 post-webinar",     iconName: "DollarSign",    color: "#128C7E", items: RAW.venta_1a1,       branching: false },
  { key: "venta_comunidad", label: "Venta comunidad",            iconName: "Users",         color: "#25D366", items: RAW.venta_comunidad, branching: false },
  { key: "replay",          label: "Replay — no asistentes",     iconName: "PlayCircle",    color: "#075E54", items: RAW.replay,          branching: false },
];

// === FLUJOS DE LA ESTRATEGIA EVERGREEN (plantilla base, editable) ===
const FLOWS_EVERGREEN_DEF = [
  {
    key: "welcome", label: "Bienvenida", iconName: "MessageCircle", color: "#25D366", branching: false,
    items: [
      { id: "W1", dia: "T+0", timing: "Inmediato", objetivo: "Bienvenida y expectativas", tipo: "Texto",
        copy: "¡Hola {NOMBRE}! 👋 Gracias por unirte. Durante los próximos días voy a compartirte lo mejor que tenemos para ayudarte con {TEMA_PRINCIPAL}.\n\n¿Te parece?",
        botones: "[BOTÓN] Sí, adelante\n[BOTÓN] Cuéntame más", recursos: "" },
    ],
  },
  {
    key: "nurturing", label: "Nurturing / Valor", iconName: "Radio", color: "#128C7E", branching: false,
    items: [
      { id: "N1", dia: "T+2", timing: "2 días después", objetivo: "Aportar valor sin vender", tipo: "Texto + recurso",
        copy: "{NOMBRE}, te comparto este recurso que seguro te ayuda:\n\n{LINK_RECURSO}",
        botones: "[BOTÓN] Ver recurso", recursos: "" },
      { id: "N2", dia: "T+5", timing: "5 días", objetivo: "Caso de éxito", tipo: "Storytelling",
        copy: "¿Te acuerdas de {NOMBRE_EXPERTO}? Pues quiero contarte cómo logró...", botones: "N/A", recursos: "" },
    ],
  },
  {
    key: "venta_evergreen", label: "Venta permanente", iconName: "DollarSign", color: "#075E54", branching: false,
    items: [
      { id: "V1", dia: "T+7", timing: "Tras engagement detectado", objetivo: "Presentar oferta", tipo: "Texto + CTA",
        copy: "{NOMBRE}, basándome en lo que me has contado creo que {NOMBRE_PRODUCTO} puede ayudarte mucho.\n\n¿Te paso los detalles?",
        botones: "[BOTÓN] Sí, cuéntame\n[BOTÓN] Ahora no", recursos: "" },
    ],
  },
];

const EVERGREEN_DEFAULT_VARS = [
  { category: "🎯 CONTENIDO", name: "TEMA_PRINCIPAL", value: "tu tema", editable: true },
  { category: "🔗 ENLACES", name: "LINK_RECURSO", value: "https://tudominio.com/recurso", editable: true },
  { category: "💰 PRODUCTO", name: "NOMBRE_PRODUCTO", value: "Tu Producto", editable: true },
  { category: "💰 PRODUCTO", name: "PRECIO_PRODUCTO", value: "497€", editable: true },
  { category: "👤 MARCA", name: "NOMBRE_MARCA", value: "Tu Marca", editable: true },
  { category: "👤 MARCA", name: "NOMBRE_EXPERTO", value: "Tu Nombre", editable: true },
  { category: "⚙️ TÉCNICO", name: "NUMERO_SOPORTE", value: "+34XXXXXXXXX", editable: true },
];

const STRATEGY_TEMPLATES = {
  webinar: {
    key: "webinar",
    label: "Lanzamiento Webinar",
    emoji: "🎥",
    description: "Secuencia pre-webinar + webinar en directo + post-webinar (venta + replay)",
    flowsDef: FLOWS_WEBINAR_DEF,
    defaultVars: WEBINAR_DEFAULT_VARS,
  },
  evergreen: {
    key: "evergreen",
    label: "Evergreen / Nurturing",
    emoji: "♾️",
    description: "Secuencia perpetua activada por comportamiento (no por fecha fija)",
    flowsDef: FLOWS_EVERGREEN_DEF,
    defaultVars: EVERGREEN_DEFAULT_VARS,
  },
};

const ICON_MAP = { MessageCircle, Users, Radio, DollarSign, PlayCircle };

function getFlowsForStrategy(strategyKey) {
  const tpl = STRATEGY_TEMPLATES[strategyKey] || STRATEGY_TEMPLATES.webinar;
  return tpl.flowsDef.map(f => ({ ...f, icon: ICON_MAP[f.iconName] || MessageCircle }));
}

function getDefaultVarsForStrategy(strategyKey) {
  const tpl = STRATEGY_TEMPLATES[strategyKey] || STRATEGY_TEMPLATES.webinar;
  return JSON.parse(JSON.stringify(tpl.defaultVars)); // clon profundo
}

// === PERSISTENCIA MULTIPROYECTO + COMPARTIDO EN EQUIPO ===
const SHARED = true;
const K_PROJECTS = "wa_editor:projects_list";
const K_ACTIVE = "wa_editor:active_project";
const K_ME = "wa_editor:me";
const pk = (pid, sub) => `wa_editor:p:${pid}:${sub}`;

async function saveToStorage(key, value, shared = SHARED) {
  try {
    if (window.storage && window.storage.set) {
      await window.storage.set(key, JSON.stringify(value), shared);
      return true;
    }
  } catch (e) { console.warn("save fail", key, e); }
  return false;
}
async function loadFromStorage(key, shared = SHARED) {
  try {
    if (window.storage && window.storage.get) {
      const r = await window.storage.get(key, shared);
      if (r && r.value) return JSON.parse(r.value);
    }
  } catch (e) { /* ok */ }
  return null;
}
async function deleteFromStorage(key, shared = SHARED) {
  try {
    if (window.storage && window.storage.delete) {
      await window.storage.delete(key, shared);
      return true;
    }
  } catch (e) { console.warn("delete fail", key, e); }
  return false;
}

// === UTILS ===
function replaceVars(text, vars) {
  if (!text) return "";
  let out = text;
  (vars || []).forEach(v => {
    if (!v.name) return;
    const re = new RegExp(`\\{${v.name}\\}`, "g");
    out = out.replace(re, v.value || `{${v.name}}`);
  });
  return out;
}
function extractVarsUsed(text) {
  if (!text) return [];
  const matches = text.match(/\{([A-Z_][A-Z0-9_]*)\}/g) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}
function buildBranches(items) {
  const branches = {};
  items.forEach(m => {
    const id = m.id || "";
    let branch = "main";
    const match = id.match(/M\d+\.([A-Z])/);
    if (match) branch = `Rama ${match[1]}`;
    if (!branches[branch]) branches[branch] = [];
    branches[branch].push(m);
  });
  return branches;
}
function parseButtons(str) {
  if (!str || str.startsWith("N/A")) return [];
  const lines = str.split(/\n/);
  const btns = [];
  lines.forEach(l => {
    const m = l.match(/\[BOTÓN\]\s*(.+?)(?:\s*\\nLink:|$)/i);
    if (m) btns.push(m[1].trim());
  });
  return btns;
}
function parseDayOffset(dia) {
  if (!dia) return null;
  const s = String(dia).trim().toUpperCase();
  let m = s.match(/^D\s*-\s*(\d+)$/); if (m) return -parseInt(m[1], 10);
  m = s.match(/^D\s*\+\s*(\d+)$/);    if (m) return parseInt(m[1], 10);
  m = s.match(/^D[ÍI]A\s*(\d+)$/);    if (m) return parseInt(m[1], 10);
  m = s.match(/^D(\d+)$/);            if (m) return parseInt(m[1], 10);
  m = s.match(/^T\s*\+\s*(\d+)$/);    if (m) return parseInt(m[1], 10);
  return null;
}
function computeSkipCondition(flowKey, msg) {
  const SKIP_FLOWS = ["pre_webinar_1a1", "broadcasts"];
  const d = parseDayOffset(msg.dia);
  if (!SKIP_FLOWS.includes(flowKey) || d === null || d >= 0) return null;
  return {
    type: "skip_if_registered_after", day_offset: d,
    description: `No enviar si user.registered_at llega cuando ya ha pasado D${d} relativo al webinar`,
    pseudocode: `IF (webinar_date - user.registered_at) < ${Math.abs(d)} days THEN SKIP`,
    n8n_hint: `{{ $json.days_until_webinar >= ${Math.abs(d)} }}`,
  };
}

const DEFAULT_AI_PROMPT = `Eres el asistente de {NOMBRE_MARCA}, respondiendo por WhatsApp a leads registrados.

CONTEXTO:
- El producto principal es {NOMBRE_PRODUCTO} (precio: {PRECIO_PRODUCTO})
- El tono es cercano y cálido, tuteas al usuario

REGLAS:
1. Si preguntan algo que YA está cubierto en la secuencia automática, responde breve y cálido.
2. Si preguntan algo que NO está cubierto, responde con honestidad. Si no sabes, di que se lo pasas al equipo.
3. Nunca inventes información sobre el producto ni sobre fechas.
4. Si detectas intención real de compra fuera del flujo, pasa a humano con el tag [ESCALAR_VENTAS].
5. Máximo 3 líneas por respuesta. Usa emojis con moderación (1-2 por mensaje).
6. Termina con pregunta abierta para seguir conversación, salvo si el usuario está cerrando.`;

// === PROYECTOS ===
const PROJECT_COLORS = ["#25D366", "#128C7E", "#075E54", "#DC2626", "#F59E0B", "#8B5CF6", "#0EA5E9", "#EC4899", "#10B981", "#6366F1"];
const PROJECT_EMOJIS = ["🚀", "💼", "🎯", "🔥", "⚡", "💎", "🌟", "🎨", "📊", "🏆", "🌊", "🦄", "🌺", "🎪"];

function newProject({ name, strategy, client, notes, emoji, color, created_by } = {}) {
  const id = "proj_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    id,
    name: name || "Nuevo proyecto",
    strategy: strategy || "webinar",
    client: client || "",
    emoji: emoji || PROJECT_EMOJIS[Math.floor(Math.random() * PROJECT_EMOJIS.length)],
    color: color || PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
    notes: notes || "",
    status: "active",
    created_by: created_by || null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}


// ====================================================================
// COMPONENTES BÁSICOS
// ====================================================================

function CopyButton({ text, label = "Copiar", size = "sm" }) {
  const [copied, setCopied] = useState(false);
  const onClick = async (e) => {
    e && e.stopPropagation();
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };
  const cls = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 ${cls} font-medium rounded-md transition-all border ${
        copied ? "bg-emerald-50 text-emerald-700 border-emerald-200"
               : "bg-white text-stone-700 border-stone-300 hover:border-stone-900 hover:bg-stone-50"
      }`}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copiado" : label}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, mono, password, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-[11px] font-medium text-stone-600">{label}</label>
      <input type={password ? "password" : "text"} value={value || ""} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900 ${mono ? "font-mono" : ""}`} />
    </div>
  );
}

// === PANEL VARIABLES ===
function VariablesPanel({ vars, setVars, search, setSearch, onReset }) {
  const filtered = useMemo(() => {
    if (!search) return vars;
    const s = search.toLowerCase();
    return vars.filter(v =>
      v.name.toLowerCase().includes(s) ||
      (v.value || "").toLowerCase().includes(s) ||
      (v.category || "").toLowerCase().includes(s)
    );
  }, [vars, search]);
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(v => { const c = v.category || "Otros"; if (!g[c]) g[c] = []; g[c].push(v); });
    return g;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input type="text" placeholder="Buscar variable..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:border-stone-900" />
      </div>
      <button onClick={onReset}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-stone-600 border border-stone-200 rounded-md hover:border-stone-400 hover:text-stone-900">
        <RotateCcw size={12} /> Restaurar originales
      </button>
      <div className="text-[10.5px] text-stone-500 bg-stone-50 border border-stone-200 rounded p-2 leading-relaxed">
        <strong>🔒 Variables bloqueadas:</strong> son técnicas (tracking UTM, IDs de n8n/Evolution, dominios base). Si las cambias sin saber, puedes romper el tracking o los envíos. Pulsa el candado para desbloquear bajo tu responsabilidad.
      </div>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-2">{cat}</div>
          <div className="space-y-2">
            {items.map(v => {
              const idx = vars.findIndex(x => x.name === v.name);
              return (
                <div key={v.name}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <label className="text-[11px] font-mono text-stone-600 truncate">{`{${v.name}}`}</label>
                    <button
                      title={v.editable ? "Desbloqueada: la puedes editar" : "Bloqueada: es técnica/tracking. Pulsa para desbloquear bajo tu responsabilidad."}
                      onClick={() => { const n = [...vars]; n[idx] = { ...n[idx], editable: !v.editable }; setVars(n); }}
                      className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border transition ${
                        v.editable ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                   : "text-stone-500 bg-stone-100 border-stone-200 hover:bg-stone-200"
                      }`}>
                      {v.editable ? "🔓" : "🔒"}
                    </button>
                  </div>
                  <input type="text" value={v.value} disabled={!v.editable}
                    onChange={e => { const n = [...vars]; n[idx] = { ...n[idx], value: e.target.value }; setVars(n); }}
                    className={`w-full px-2.5 py-1.5 text-sm rounded-md border transition ${
                      v.editable ? "bg-white border-stone-200 hover:border-stone-400 focus:border-stone-900 focus:outline-none"
                                 : "bg-stone-100 border-stone-200 text-stone-500 cursor-not-allowed"
                    }`} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// === PREVIEW WHATSAPP ===
function WhatsAppPreview({ msg, vars, onClose, variant = null }) {
  const copy = replaceVars(variant ? variant.copy : msg.copy, vars);
  const buttons = parseButtons(replaceVars(msg.botones, vars));
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="bg-[#075E54] text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">TN</div>
            <div>
              <div className="text-sm font-medium">Tu Negocio</div>
              <div className="text-[10px] text-white/70">en línea{variant ? ` · ${variant.label}` : ""}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-3 py-5 min-h-[360px] max-h-[60vh] overflow-y-auto" style={{ backgroundColor: "#ECE5DD" }}>
          <div className="flex justify-start mb-1">
            <div className="max-w-[85%] bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm">
              <div className="text-[13.5px] text-stone-800 whitespace-pre-wrap leading-[1.35]">{copy}</div>
              <div className="flex justify-end items-center gap-1 mt-1">
                <span className="text-[10px] text-stone-400">{hh}:{mm}</span>
              </div>
            </div>
          </div>
          {buttons.length > 0 && (
            <div className="mt-1 space-y-0.5 max-w-[85%]">
              {buttons.map((b, i) => (
                <div key={`btn-${i}-${b}`} className="bg-white rounded-lg px-3 py-2.5 text-center text-[13px] font-medium text-[#00A5F4] shadow-sm cursor-pointer hover:bg-stone-50">{b}</div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-stone-100 px-4 py-2.5 border-t border-stone-200 text-[10px] text-stone-500 text-center">Previsualización estática</div>
      </div>
    </div>
  );
}


// ====================================================================
// NEW MESSAGE MODAL — crear mensaje custom que se refleja en flujos/mapa/calendario
// ====================================================================
function NewMessageModal({ flow, defaultPosition, onSave, onClose }) {
  const [draft, setDraft] = useState({
    dia: "",
    timing: "",
    hora: "",
    objetivo: "",
    copy: "",
    botones: "",
    position: typeof defaultPosition === "number" ? defaultPosition : undefined,
  });

  const save = () => {
    if (!draft.copy.trim()) { alert("El copy es obligatorio"); return; }
    onSave(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-stone-200 flex items-center gap-2">
          <Plus size={16} />
          <div className="font-bold text-stone-900 text-sm">Nuevo mensaje custom en <span style={{ color: flow.color }}>{flow.label}</span></div>
          <button onClick={onClose} className="ml-auto text-stone-500 hover:text-stone-900"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            <Field label="ID / Día (ej M7 o D8)" value={draft.dia} onChange={v => setDraft({ ...draft, dia: v })} placeholder="M7" />
            <Field label="Timing" value={draft.timing} onChange={v => setDraft({ ...draft, timing: v })} placeholder="T+3h" />
            <Field label="Hora" value={draft.hora} onChange={v => setDraft({ ...draft, hora: v })} placeholder="10:30" />
          </div>
          <Field label="Objetivo" value={draft.objetivo} onChange={v => setDraft({ ...draft, objetivo: v })} placeholder="Recordatorio del webinar" full />
          <div>
            <label className="text-[11px] font-medium text-stone-600">Copy (puedes usar variables como {"{NOMBRE}"})</label>
            <textarea value={draft.copy} onChange={e => setDraft({ ...draft, copy: e.target.value })}
              placeholder="Hola {NOMBRE}, mañana a las 19h te espero..."
              className="w-full mt-1 px-2.5 py-2 text-sm border border-stone-200 rounded-md min-h-[120px] focus:outline-none focus:border-stone-900 font-mono" />
          </div>
          <Field label="Botones (opcional, separados por ; o líneas)" value={draft.botones}
            onChange={v => setDraft({ ...draft, botones: v })} placeholder="Sí, quiero ir; Recuérdame después" mono full />
          <div>
            <label className="text-[11px] font-medium text-stone-600">Posición en el flujo (opcional)</label>
            <input type="number" min="0" max={flow.items.length} value={draft.position ?? ""}
              onChange={e => setDraft({ ...draft, position: e.target.value === "" ? undefined : parseInt(e.target.value, 10) })}
              placeholder={`${flow.items.length} (al final)`}
              className="w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900" />
            <div className="text-[10.5px] text-stone-500 mt-1">0 = al principio · {flow.items.length} = al final · déjalo vacío para añadir al final</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-md p-3 text-[11.5px] text-purple-900 leading-relaxed">
            <strong>ℹ️ Nota:</strong> Este mensaje custom aparecerá en <strong>Flujos, Mapa, Calendario y Checker</strong>. Llevará el badge ✨ Custom para distinguirlo de los mensajes del template original.
          </div>
        </div>
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-stone-700">Cancelar</button>
          <button onClick={save} data-testid="new-msg-save-btn"
            className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700 inline-flex items-center gap-1.5">
            <Plus size={14} /> Añadir mensaje
          </button>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// VARIABLES PICKER — insertar variables en el textarea de edición
// ====================================================================
function VarPicker({ vars, onInsert }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return vars.filter(v => v.name && (!s ||
      v.name.toLowerCase().includes(s) ||
      (v.value || "").toLowerCase().includes(s) ||
      (v.category || "").toLowerCase().includes(s)
    ));
  }, [vars, q]);
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(v => { const c = v.category || "Otros"; if (!g[c]) g[c] = []; g[c].push(v); });
    return g;
  }, [filtered]);
  const RUNTIME_LIST = [
    { name: "NOMBRE", value: "(se rellena automáticamente con el nombre del lead)" },
    { name: "USER_ID", value: "(se rellena automáticamente por n8n)" },
    { name: "EMAIL", value: "(se rellena automáticamente si el lead lo da)" },
    { name: "PHONE", value: "(se rellena automáticamente)" },
  ];

  return (
    <div className="mt-2 border border-stone-200 rounded-md bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-200 bg-stone-50 flex items-center gap-2">
        <Search size={12} className="text-stone-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar variable..."
          className="flex-1 text-[11.5px] bg-transparent focus:outline-none" />
        <span className="text-[10px] text-stone-500">Click → insertar en cursor</span>
      </div>
      <div className="max-h-[220px] overflow-y-auto p-2 space-y-2.5">
        {/* Runtime vars */}
        <div>
          <div className="text-[9.5px] font-semibold tracking-widest text-sky-700 uppercase mb-1">🤖 Runtime (rellena n8n)</div>
          <div className="flex flex-wrap gap-1">
            {RUNTIME_LIST.map(v => (
              <button key={v.name} onClick={() => onInsert(v.name)} title={v.value}
                className="text-[10.5px] font-mono px-1.5 py-0.5 rounded border bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100">
                {"{" + v.name + "}"}
              </button>
            ))}
          </div>
        </div>
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div className="text-[9.5px] font-semibold tracking-widest text-stone-500 uppercase mb-1">{cat}</div>
            <div className="space-y-1">
              {items.map(v => (
                <button key={v.name} onClick={() => onInsert(v.name)}
                  className="w-full text-left px-2 py-1 rounded hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition">
                  <div className="text-[11px] font-mono text-emerald-800">{"{" + v.name + "}"}</div>
                  <div className="text-[10px] text-stone-500 truncate" title={v.value}>{v.value || "—"}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-[11px] text-stone-500 text-center py-3">Sin resultados</div>}
      </div>
    </div>
  );
}

// ====================================================================
// ATTACH CREATIVE MODAL — asociar creativo a un mensaje desde la tarjeta
// ====================================================================
// ====================================================================
// EVOLUTION SEND MODAL — envío real via Evolution API (solo broadcasts & venta_comunidad)
// ====================================================================
// Modal: enviar plantilla Meta aprobada con parámetros a un teléfono real.
// Auto-detecta las variables del copy, prerellena con los valores del proyecto,
// y permite override antes de disparar el envío via /api/whatsapp/send-template.
function MetaTemplateSendModal({ msg, effectiveCopy, vars, templateMeta, flowKey, msgId, projectId, creatives, onClose }) {
  const detectedVarNames = React.useMemo(() => {
    if (!effectiveCopy) return [];
    const found = [];
    const re = /\{([A-Z_][A-Z0-9_]*)\}/g;
    let m;
    while ((m = re.exec(effectiveCopy)) !== null) {
      if (!found.includes(m[1])) found.push(m[1]);
    }
    return found;
  }, [effectiveCopy]);

  const [to, setTo] = useState("");
  const [paramValues, setParamValues] = useState(() => {
    const init = {};
    detectedVarNames.forEach(n => {
      const v = vars.find(x => x.name === n);
      init[n] = v?.value || "";
    });
    return init;
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const templateName = templateMeta?.name || `waflow_${flowKey}_${(msgId || "m").toString().toLowerCase()}`;
  const language = templateMeta?.language || "es";
  const synced = !!templateMeta?.meta_id;
  const tplStatus = templateMeta?.status;
  const firstImageCreative = (creatives || []).find(c => c.type === "image" && (c.url || "").startsWith("http"));

  const doSend = async () => {
    if (!to || to.length < 6) { setResult({ ok: false, error: "Teléfono destino inválido. Usa formato E.164 sin + (ej. 34612345678)." }); return; }
    setSending(true); setResult(null);
    try {
      const orderedParams = detectedVarNames.map(n => paramValues[n] || "");
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/whatsapp/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          template_name: templateName,
          language,
          to_phone: to,
          params: orderedParams,
          header_media_url: firstImageCreative?.url || null,
          header_media_type: firstImageCreative ? "image" : null,
        }),
      });
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: "Red: " + e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()} data-testid="meta-tpl-send-modal">
        <div className="px-5 py-3 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-indigo-900">Enviar plantilla Meta a un teléfono</div>
            <div className="text-[11px] text-indigo-700 font-mono">{templateName} · {language}</div>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {!synced && (
            <div className="text-[11.5px] bg-amber-50 border border-amber-200 text-amber-900 rounded p-2 leading-relaxed">
              ⚠ <strong>Plantilla no sincronizada con Meta aún.</strong> Si no existe en tu WABA con el nombre <code className="font-mono">{templateName}</code>, Meta rechazará el envío. Ve a <strong>Autopilot → Sincronizar plantillas con Meta</strong> primero.
            </div>
          )}
          {synced && tplStatus !== "APPROVED" && (
            <div className="text-[11.5px] bg-amber-50 border border-amber-200 text-amber-900 rounded p-2 leading-relaxed">
              ⚠ Estado actual de la plantilla: <strong>{tplStatus}</strong>. Meta solo permite enviar plantillas APPROVED. Usa "Refrescar estado desde Meta" tras la espera de aprobación.
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest">Teléfono destino (E.164 sin +)</label>
            <input type="tel" value={to} onChange={e => setTo(e.target.value.replace(/\D/g, ""))}
              placeholder="34612345678" data-testid="meta-tpl-to-input"
              className="w-full mt-1 px-3 py-2 text-sm font-mono border border-stone-300 rounded-md focus:outline-none focus:border-stone-900" />
          </div>

          {detectedVarNames.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest">Parámetros ({detectedVarNames.length})</label>
              <div className="space-y-2 mt-1">
                {detectedVarNames.map((n, i) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">{`{{${i + 1}}}`}</span>
                    <span className="text-[11px] text-stone-600 min-w-[110px] truncate">{n}</span>
                    <input value={paramValues[n] || ""} onChange={e => setParamValues({ ...paramValues, [n]: e.target.value })}
                      data-testid={`meta-tpl-param-${n}`}
                      className="flex-1 px-2 py-1 text-sm border border-stone-200 rounded focus:outline-none focus:border-stone-900" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {firstImageCreative && (
            <div className="text-[11px] bg-sky-50 border border-sky-200 text-sky-900 rounded p-2">
              📎 Header: se incluirá la imagen <strong>{firstImageCreative.name || firstImageCreative.url.split("/").pop()}</strong>
            </div>
          )}

          {result && (
            <div className={`text-[11.5px] border rounded p-2 ${result.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-900"}`} data-testid="meta-tpl-send-result">
              {result.ok
                ? <>✓ Enviado. Message ID: <code className="font-mono">{result.message_id}</code></>
                : <><strong>Error Meta:</strong> {result.error || "desconocido"}</>}
            </div>
          )}
        </div>
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-2">
          <div className="text-[10.5px] text-stone-500">
            💡 Este envío consume 1 conversación Meta Business.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900">Cerrar</button>
            <button onClick={doSend} disabled={sending || !to}
              data-testid="meta-tpl-send-confirm-btn"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
              <Send size={12} /> {sending ? "Enviando..." : "Enviar ahora"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function EvolutionSendModal({ msg, rendered, evolutionConfig, onSend, onClose, flowKey, msgKey }) {
  const [target, setTarget] = useState("group"); // "group" | "number"
  const [to, setTo] = useState("");
  const [message, setMessage] = useState(rendered || "");
  const [delayS, setDelayS] = useState(0);
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  const configured = !!(evolutionConfig?.server_url && evolutionConfig?.api_key && evolutionConfig?.instance);

  const doSend = async () => {
    if (!to.trim() || !message.trim()) { alert("Rellena destinatario y mensaje"); return; }
    setSending(true);
    setResult(null);
    try {
      const r = await onSend({ to: to.trim(), message, delay_ms: (delayS || 0) * 1000, msgKey });
      setResult(r);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-stone-200 flex items-center gap-2">
          <Send size={16} className="text-emerald-600" />
          <div className="font-bold text-stone-900 text-sm">Enviar {msg.id || "mensaje"} vía Evolution API</div>
          <button onClick={onClose} className="ml-auto text-stone-500 hover:text-stone-900"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {!configured && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-[11.5px] text-red-900">
              ⚠️ <strong>Falta configurar Evolution API</strong>. Ve a <em>Conexiones → Evolution API</em> y rellena server URL, API key e instancia.
            </div>
          )}
          <div className="text-[11.5px] text-stone-700 bg-amber-50 border border-amber-200 rounded p-2.5 leading-relaxed">
            ℹ️ <strong>Envío vía Evolution</strong> (no oficial). Uso previsto: <em>broadcasts programados</em> y <em>venta comunidad</em>. Para los demás flujos usa plantillas Meta oficiales para evitar bans.
          </div>
          <div>
            <label className="text-[11px] font-medium text-stone-600">Destinatario</label>
            <div className="flex gap-1.5 mt-1 mb-1">
              <button onClick={() => setTarget("group")} className={`px-2.5 py-1 text-xs rounded-md border ${target === "group" ? "bg-stone-900 text-white border-stone-900" : "bg-white border-stone-300"}`}>👥 Grupo / Comunidad</button>
              <button onClick={() => setTarget("number")} className={`px-2.5 py-1 text-xs rounded-md border ${target === "number" ? "bg-stone-900 text-white border-stone-900" : "bg-white border-stone-300"}`}>📱 Número individual</button>
            </div>
            <input value={to} onChange={e => setTo(e.target.value)}
              placeholder={target === "group" ? "Ej: 120363012345678901@g.us" : "Ej: 34612345678"}
              className="w-full px-2.5 py-1.5 text-sm font-mono border border-stone-200 rounded-md focus:outline-none focus:border-stone-900" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-stone-600">Mensaje a enviar (ya con variables reemplazadas)</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              className="w-full mt-1 px-2.5 py-2 text-sm font-mono border border-stone-200 rounded-md min-h-[120px] focus:outline-none focus:border-stone-900" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-stone-600">Delay antes de enviar (segundos)</label>
            <input type="number" min="0" value={delayS} onChange={e => setDelayS(parseInt(e.target.value || "0", 10))}
              className="w-24 mt-1 px-2 py-1 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900" />
          </div>
          {result && (
            <div className={`rounded p-3 text-[11.5px] border ${result.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-900"}`}>
              {result.ok ? "✅ Mensaje enviado correctamente" : "❌ Error en el envío"}
              <div className="mt-1 text-[10.5px] font-mono break-all">HTTP {result.status || "—"} · {typeof result.response === "object" ? JSON.stringify(result.response).slice(0, 240) : String(result.response || result.error || "")}</div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-stone-700">Cerrar</button>
          <button onClick={doSend} disabled={sending || !configured}
            data-testid={`evo-send-confirm-${flowKey}`}
            className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            <Send size={13} /> {sending ? "Enviando..." : "Enviar ahora"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachCreativeModal({ msgKey, creatives, onAttach, onRemove, onClose }) {  const [tab, setTab] = useState("existing"); // existing | new
  const [draft, setDraft] = useState({ name: "", type: "image", url: "", notes: "" });

  const attached = creatives.filter(c => c.messageKey === msgKey);
  const available = creatives.filter(c => !c.messageKey);

  const saveNew = () => {
    if (!draft.name.trim() || !draft.url.trim()) { alert("Nombre y URL son obligatorios"); return; }
    onAttach({ ...draft, source: "url" });
    setDraft({ name: "", type: "image", url: "", notes: "" });
    setTab("existing");
  };

  const typeIcon = t => t === "image" ? "🖼️" : t === "video" ? "🎬" : t === "gif" ? "✨" : "📄";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl overflow-hidden shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <div className="font-bold text-stone-900 text-sm">Creativos del mensaje <span className="font-mono text-xs text-stone-500">{msgKey}</span></div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900"><X size={16} /></button>
        </div>
        <div className="border-b border-stone-200 flex">
          <button onClick={() => setTab("existing")}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-widest uppercase ${tab === "existing" ? "text-stone-900 border-b-2 border-stone-900" : "text-stone-500"}`}>
            Biblioteca ({attached.length + available.length})
          </button>
          <button onClick={() => setTab("new")}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-widest uppercase ${tab === "new" ? "text-stone-900 border-b-2 border-stone-900" : "text-stone-500"}`}>
            + Subir nuevo
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "existing" ? (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-semibold tracking-widest text-emerald-700 uppercase mb-2">Adjuntos a este mensaje ({attached.length})</div>
                {attached.length === 0 ? (
                  <div className="text-[11.5px] text-stone-500 italic">Ninguno todavía.</div>
                ) : (
                  <div className="space-y-1.5">
                    {attached.map(c => (
                      <div key={c.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5">
                        <div>{typeIcon(c.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-stone-800 truncate">{c.name}</div>
                          {c.url && <div className="text-[10px] text-stone-500 truncate font-mono">{c.url}</div>}
                        </div>
                        <button onClick={() => onRemove(c.id)} className="text-red-500 hover:text-red-700" title="Desvincular del mensaje">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-2">Sin asignar en biblioteca ({available.length})</div>
                {available.length === 0 ? (
                  <div className="text-[11.5px] text-stone-500 italic">No hay creativos libres. Añade uno en la pestaña + Subir nuevo.</div>
                ) : (
                  <div className="space-y-1.5">
                    {available.map(c => (
                      <button key={c.id} onClick={() => onAttach(c)}
                        className="w-full flex items-center gap-2 bg-white border border-stone-200 rounded-md px-2.5 py-1.5 hover:border-stone-400 hover:bg-stone-50 text-left transition">
                        <div>{typeIcon(c.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-stone-800 truncate">{c.name}</div>
                          {c.url && <div className="text-[10px] text-stone-500 truncate font-mono">{c.url}</div>}
                        </div>
                        <span className="text-[10px] text-emerald-700 font-medium">Adjuntar →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Nombre" value={draft.name} onChange={v => setDraft({ ...draft, name: v })} placeholder="Ej: Testimonio Laura" />
              <div>
                <label className="text-[11px] font-medium text-stone-600">Tipo</label>
                <div className="flex gap-1.5 mt-1">
                  {[{k:"image",l:"🖼️ Imagen"},{k:"video",l:"🎬 Video"},{k:"gif",l:"✨ GIF"},{k:"doc",l:"📄 Doc"}].map(t => (
                    <button key={t.k} onClick={() => setDraft({ ...draft, type: t.k })}
                      className={`px-2.5 py-1 text-xs rounded-md border transition ${draft.type === t.k ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-500"}`}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="URL del creativo" value={draft.url} onChange={v => setDraft({ ...draft, url: v })} placeholder="https://drive.google.com/..." mono full />
              <div>
                <label className="text-[11px] font-medium text-stone-600">Notas (opcional)</label>
                <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Para qué se usa, instrucciones..."
                  className="w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md min-h-[60px] focus:outline-none focus:border-stone-900" />
              </div>
              <button onClick={saveNew}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700">
                <Upload size={14} /> Añadir y adjuntar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// MESSAGE CARD con todas las funcionalidades v5
// Props nuevas: comments, onAddComment, onRemoveComment, variants, onSaveVariants,
// approval, onSetApproval, templateMeta, onSetTemplateMeta, me
// ====================================================================

function MessageCard({
  msg, vars, showVars, index, onPreview, editedCopy, onEditCopy, flowKey, creatives,
  comments = [], onAddComment, onRemoveComment,
  variants = null, onSaveVariants,
  approval = null, onSetApproval,
  templateMeta = null, onSetTemplateMeta,
  me = "",
  onAttachCreative, onRemoveCreativeAssoc,
  isCustom = false, onRemoveCustom = null,
  canUseEvolution = false, evolutionConfig = null, onEvolutionSend = null,
  onMetaTestSend = null, metaConfig = null,
  isMetaFlow = false,
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showAB, setShowAB] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [showVarPicker, setShowVarPicker] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showEvoSend, setShowEvoSend] = useState(false);
  const [showMetaSend, setShowMetaSend] = useState(false);
  const [showTplSend, setShowTplSend] = useState(false);
  const [newComment, setNewComment] = useState("");
  const textareaRef = useRef(null);

  const effectiveCopy = editedCopy ?? msg.copy;
  const rendered = showVars ? replaceVars(effectiveCopy, vars) : effectiveCopy;
  const buttonsRendered = showVars ? replaceVars(msg.botones, vars) : msg.botones;
  const varsUsed = extractVarsUsed(effectiveCopy);
  const undef = varsUsed.filter(n => !vars.find(v => v.name === n) && !RUNTIME_VARS.has(n));

  const label = msg.id || msg.dia || `#${index + 1}`;
  const timing = msg.timing || msg.hora || msg.fecha_relativa || "";
  const trigger = msg.trigger || msg.condicion || msg.segmentacion || msg.tipo_contenido || "";
  const objetivo = msg.objetivo || "";
  const isEdited = editedCopy !== undefined && editedCopy !== null;
  const skip = computeSkipCondition(flowKey, msg);
  const hasSkip = !!skip;

  const msgKey = `${flowKey}:${msg.id || index}`;
  const msgCreatives = creatives.filter(c => c.messageKey === msgKey);
  const hasAB = variants && variants.enabled && variants.items && variants.items.length > 0;
  const hasTpl = templateMeta && templateMeta.isTemplate;

  const approvalBadge = () => {
    if (!approval) return null;
    if (approval.status === "approved") return <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">✓ Aprobado</span>;
    if (approval.status === "changes") return <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">✎ Cambios</span>;
    return null;
  };

  const tplBadge = () => {
    if (!templateMeta || !templateMeta.isTemplate) {
      // Auto-template para flujos Meta 1-1 sin override manual
      if (isMetaFlow) {
        return <span className="text-[10px] bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded" title="Este mensaje se enviará como plantilla Meta oficial. Nombre auto: waflow_{flowKey}_{msgId}. Puedes personalizar la plantilla arriba si necesitas otro nombre o estado.">📋 Meta auto</span>;
      }
      return null;
    }
    const map = { PENDING: "bg-stone-100 text-stone-700 border-stone-200", APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200", REJECTED: "bg-red-50 text-red-700 border-red-200" };
    const cls = map[templateMeta.status || "PENDING"];
    return <span className={`text-[10px] border px-1.5 py-0.5 rounded ${cls}`}>Meta: {templateMeta.status || "PENDING"}</span>;
  };

  return (
    <div className={`border rounded-lg overflow-hidden bg-white ${
      approval?.status === "approved" ? "border-emerald-300" :
      approval?.status === "changes" ? "border-amber-300" :
      isEdited ? "border-emerald-200" : "border-stone-200"
    }`}>
      <div className="px-4 py-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-stone-50" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="text-stone-400 mt-0.5">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-stone-900 bg-stone-100 px-1.5 py-0.5 rounded">{label}</span>
              {isCustom && <span className="text-[10px] text-purple-800 bg-purple-100 border border-purple-300 px-1.5 py-0.5 rounded font-semibold" title="Mensaje añadido manualmente (no viene del template original)">✨ CUSTOM</span>}
              {timing && <span className="text-[11px] text-stone-500">{timing}</span>}
              {isEdited && <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">editado</span>}
              {hasSkip && <span className="text-[10px] text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded" title={skip.pseudocode}>⏭ D{skip.day_offset}</span>}
              {msgCreatives.length > 0 && <span className="text-[10px] text-purple-800 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">🎨 {msgCreatives.length}</span>}
              {hasAB && <span className="text-[10px] text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">A/B · {variants.items.length + 1}</span>}
              {comments.length > 0 && <span className="text-[10px] text-stone-700 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded">💬 {comments.length}</span>}
              {approvalBadge()}
              {tplBadge()}
            </div>
            {objetivo && <div className="text-sm text-stone-700 mt-1 truncate">{objetivo}</div>}
            {trigger && <div className="text-[11px] text-stone-500 mt-0.5 truncate">→ {trigger}</div>}
          </div>
        </div>
        {undef.length > 0 && <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded shrink-0">{undef.length} sin def</div>}
      </div>

      {expanded && (
        <div className="border-t border-stone-200 px-4 py-3 bg-stone-50/60 space-y-3">
          {msg.copy && (
            <div>
              <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase">Copy</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={e => { e.stopPropagation(); setEditing(!editing); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-600 border border-stone-300 rounded-md hover:border-stone-900">
                    {editing ? "Ver" : "Editar"}
                  </button>
                  <button onClick={e => { e.stopPropagation(); onPreview(msg); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-300 rounded-md hover:bg-emerald-50">
                    <Smartphone size={12} /> Preview
                  </button>
                  <button onClick={e => { e.stopPropagation(); setShowAB(!showAB); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 border border-indigo-300 rounded-md hover:bg-indigo-50">
                    <FlaskConical size={12} /> A/B
                  </button>
                  <button onClick={e => { e.stopPropagation(); setShowTpl(!showTpl); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-600 border border-stone-300 rounded-md hover:border-stone-900">
                    <FileCheck size={12} /> Template
                  </button>
                  <button onClick={e => { e.stopPropagation(); setShowAttachModal(true); }}
                    data-testid={`attach-creative-btn-${flowKey}-${msg.id || index}`}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded-md transition ${
                      msgCreatives.length > 0 ? "text-purple-800 bg-purple-50 border-purple-300 hover:bg-purple-100"
                                               : "text-stone-600 border-stone-300 hover:border-stone-900"
                    }`}>
                    <ImageIcon size={12} /> {msgCreatives.length > 0 ? `Creativos (${msgCreatives.length})` : "Adjuntar creativo"}
                  </button>
                  <button onClick={e => { e.stopPropagation(); setShowComments(!showComments); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-600 border border-stone-300 rounded-md hover:border-stone-900">
                    <MessageSquare size={12} /> {comments.length}
                  </button>
                  {canUseEvolution && (
                    <button onClick={e => { e.stopPropagation(); setShowEvoSend(true); }}
                      data-testid={`evo-send-btn-${flowKey}-${msg.id || index}`}
                      title="Enviar ahora vía Evolution API (broadcasts / comunidad)"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-md hover:bg-emerald-100">
                      <Send size={12} /> Enviar ahora
                    </button>
                  )}
                  {isMetaFlow && (
                    <button onClick={e => { e.stopPropagation(); setShowTplSend(true); }}
                      data-testid={`meta-tpl-send-btn-${flowKey}-${msg.id || index}`}
                      title="Enviar esta plantilla Meta real a un teléfono con parámetros"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-300 rounded-md hover:bg-indigo-100">
                      <Send size={12} /> Enviar plantilla
                    </button>
                  )}
                  {isCustom && onRemoveCustom && (
                    <button onClick={e => { e.stopPropagation(); onRemoveCustom(); }}
                      data-testid={`remove-custom-${flowKey}-${msg.id}`}
                      title="Eliminar este mensaje custom"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50">
                      <Trash2 size={12} />
                    </button>
                  )}
                  <CopyButton text={rendered} />
                </div>
              </div>
              {editing ? (
                <div>
                  <textarea ref={textareaRef} value={effectiveCopy} onChange={e => onEditCopy(e.target.value)}
                    className="w-full min-h-[160px] p-3 text-sm font-mono bg-white border border-stone-300 rounded-md focus:outline-none focus:border-stone-900" />
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <button onClick={() => setShowVarPicker(v => !v)}
                      data-testid={`toggle-var-picker-${flowKey}-${msg.id || index}`}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-md border transition ${
                        showVarPicker ? "bg-emerald-600 text-white border-emerald-600" : "text-emerald-700 border-emerald-300 bg-white hover:bg-emerald-50"
                      }`}>
                      {"{…}"} {showVarPicker ? "Ocultar variables" : "Insertar variable"}
                    </button>
                    {isEdited && <button onClick={() => onEditCopy(null)} className="text-[11px] text-stone-500 hover:text-stone-900">↺ Volver al original</button>}
                  </div>
                  {showVarPicker && (
                    <VarPicker vars={vars} onInsert={varName => {
                      const ta = textareaRef.current;
                      if (!ta) { onEditCopy(effectiveCopy + `{${varName}}`); return; }
                      const start = ta.selectionStart ?? effectiveCopy.length;
                      const end = ta.selectionEnd ?? effectiveCopy.length;
                      const before = effectiveCopy.slice(0, start);
                      const after = effectiveCopy.slice(end);
                      const insertion = `{${varName}}`;
                      onEditCopy(before + insertion + after);
                      setTimeout(() => {
                        try {
                          ta.focus();
                          const pos = start + insertion.length;
                          ta.setSelectionRange(pos, pos);
                        } catch {}
                      }, 0);
                    }} />
                  )}
                </div>
              ) : (
                <div className="bg-white border border-stone-200 rounded-md p-3 text-sm text-stone-800 whitespace-pre-wrap leading-relaxed">{rendered}</div>
              )}
              <div className="mt-1 text-[10px] text-stone-500 flex justify-end gap-3">
                <span>{effectiveCopy.length} chars</span>
                {effectiveCopy.length > 1024 && <span className="text-red-600">⚠️ supera 1024 (límite Meta template body)</span>}
              </div>
            </div>
          )}

          {/* A/B variants editor */}
          {showAB && onSaveVariants && (
            <div className="bg-indigo-50/50 border border-indigo-200 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold text-indigo-900 uppercase tracking-widest">A/B testing</div>
                <label className="flex items-center gap-1.5 text-[11px] text-indigo-800">
                  <input type="checkbox" checked={variants?.enabled || false}
                    onChange={e => onSaveVariants({ ...(variants || { items: [] }), enabled: e.target.checked })} />
                  Activado
                </label>
              </div>
              <div className="text-[11px] text-indigo-900/80 mb-2">
                Variante A = copy principal arriba. Añade B, C... cada una con su % de tráfico.
              </div>
              {(variants?.items || []).map((vr, i) => (
                <div key={`var-${i}`} className="bg-white border border-indigo-200 rounded-md p-2 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-semibold">Variante {String.fromCharCode(66 + i)}</span>
                    <input type="text" value={vr.label || ""} onChange={e => {
                      const items = [...variants.items]; items[i] = { ...items[i], label: e.target.value };
                      onSaveVariants({ ...variants, items });
                    }} placeholder="Etiqueta (opcional)"
                      className="flex-1 px-2 py-0.5 text-[11px] border border-stone-200 rounded" />
                    <input type="number" min="0" max="100" value={vr.traffic ?? 50} onChange={e => {
                      const items = [...variants.items]; items[i] = { ...items[i], traffic: Number(e.target.value) };
                      onSaveVariants({ ...variants, items });
                    }} className="w-14 px-2 py-0.5 text-[11px] border border-stone-200 rounded" /> %
                    <button onClick={() => {
                      const items = variants.items.filter((_, j) => j !== i);
                      onSaveVariants({ ...variants, items });
                    }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
                  </div>
                  <textarea value={vr.copy || ""} onChange={e => {
                    const items = [...variants.items]; items[i] = { ...items[i], copy: e.target.value };
                    onSaveVariants({ ...variants, items });
                  }} className="w-full p-2 text-[12px] font-mono border border-stone-200 rounded min-h-[80px]" />
                </div>
              ))}
              <button onClick={() => {
                const items = [...(variants?.items || []), { label: "", traffic: 50, copy: effectiveCopy }];
                onSaveVariants({ enabled: variants?.enabled || false, items });
              }} className="text-[11px] px-2 py-1 border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-100">
                + Añadir variante
              </button>
            </div>
          )}

          {/* Template Meta editor */}
          {showTpl && onSetTemplateMeta && (
            <div className="bg-stone-50 border border-stone-200 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-stone-900 uppercase tracking-widest">Plantilla Meta</div>
                <label className="flex items-center gap-1.5 text-[11px] text-stone-700">
                  <input type="checkbox" checked={templateMeta?.isTemplate || false}
                    onChange={e => onSetTemplateMeta({ ...(templateMeta || {}), isTemplate: e.target.checked })} />
                  Este mensaje es una template
                </label>
              </div>
              {templateMeta?.isTemplate && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Nombre (Meta)" value={templateMeta.name} onChange={v => onSetTemplateMeta({ ...templateMeta, name: v })} placeholder="ej: welcome_webinar" mono />
                    <div>
                      <label className="text-[11px] font-medium text-stone-600">Categoría</label>
                      <select value={templateMeta.category || "MARKETING"} onChange={e => onSetTemplateMeta({ ...templateMeta, category: e.target.value })}
                        className="w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md bg-white">
                        <option value="MARKETING">MARKETING</option>
                        <option value="UTILITY">UTILITY</option>
                        <option value="AUTHENTICATION">AUTHENTICATION</option>
                      </select>
                    </div>
                    <Field label="Idioma" value={templateMeta.language || "es"} onChange={v => onSetTemplateMeta({ ...templateMeta, language: v })} placeholder="es" mono />
                    <div>
                      <label className="text-[11px] font-medium text-stone-600">Estado</label>
                      <select value={templateMeta.status || "PENDING"} onChange={e => onSetTemplateMeta({ ...templateMeta, status: e.target.value })}
                        className="w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md bg-white">
                        <option value="PENDING">PENDING</option>
                        <option value="APPROVED">APPROVED</option>
                        <option value="REJECTED">REJECTED</option>
                      </select>
                    </div>
                  </div>
                  <div className="text-[10.5px] text-stone-600 bg-white border border-stone-200 rounded p-2 space-y-1">
                    <div><strong>Cuerpo con formato Meta (variables {"{{1}} {{2}}"}):</strong></div>
                    <div className="font-mono text-[11px] text-stone-800 whitespace-pre-wrap">
                      {(() => {
                        let c = effectiveCopy; let n = 1; const map = {};
                        const varsIn = extractVarsUsed(effectiveCopy);
                        varsIn.forEach(v => { map[v] = n++; c = c.replace(new RegExp(`\\{${v}\\}`, "g"), `{{${map[v]}}}`); });
                        return c;
                      })()}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Comments */}
          {showComments && onAddComment && (
            <div className="bg-white border border-stone-200 rounded-md p-3 space-y-2">
              <div className="text-[11px] font-semibold text-stone-900 uppercase tracking-widest">Comentarios internos</div>
              {comments.length === 0 && <div className="text-[11px] text-stone-500">Aún no hay comentarios.</div>}
              {comments.map((c, i) => (
                <div key={c.id || i} className="border border-stone-200 bg-stone-50 rounded p-2">
                  <div className="flex items-baseline justify-between">
                    <div className="text-[11px] font-semibold text-stone-900">{c.author || "Anónimo"}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-stone-500">{new Date(c.at).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <button onClick={() => onRemoveComment(c.id)} className="text-stone-400 hover:text-red-600"><Trash2 size={10} /></button>
                    </div>
                  </div>
                  <div className="text-[12px] text-stone-800 mt-1 whitespace-pre-wrap">{c.text}</div>
                </div>
              ))}
              <div className="flex gap-1.5 items-end pt-1">
                <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                  placeholder="Escribe un comentario..."
                  className="flex-1 p-2 text-[12px] border border-stone-200 rounded min-h-[50px]" />
                <button onClick={() => { if (newComment.trim()) { onAddComment(newComment); setNewComment(""); } }}
                  className="px-3 py-1.5 text-xs bg-stone-900 text-white rounded">Enviar</button>
              </div>
            </div>
          )}

          {msg.botones && !msg.botones.startsWith("N/A") && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase">Botones</div>
                <CopyButton text={buttonsRendered} />
              </div>
              <div className="bg-white border border-stone-200 rounded-md p-3 text-xs text-stone-700 whitespace-pre-wrap font-mono leading-relaxed">{buttonsRendered}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-[11px]">
            {msg.tipo && <div><div className="text-stone-500">Tipo</div><div className="text-stone-800">{msg.tipo}</div></div>}
            {msg.recursos && <div><div className="text-stone-500">Recursos (Excel)</div><div className="text-stone-800">{msg.recursos}</div></div>}
            {msg.notas && <div className="col-span-2"><div className="text-stone-500">Estrategia</div><div className="text-stone-800">{msg.notas}</div></div>}
          </div>

          {msgCreatives.length > 0 && (
            <div className="pt-3 border-t border-stone-200">
              <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-1.5">Creativos asociados</div>
              <div className="space-y-1.5">
                {msgCreatives.map(c => (
                  <div key={c.id} className="flex items-center gap-2 bg-white border border-stone-200 rounded-md px-2.5 py-1.5">
                    <div>{c.type === "image" ? "🖼️" : c.type === "video" ? "🎬" : c.type === "gif" ? "✨" : "📄"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-stone-800 truncate">{c.name}</div>
                      {c.url && <div className="text-[10px] text-stone-500 truncate font-mono">{c.url}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasSkip && (
            <div className="p-3 rounded-md bg-sky-50 border border-sky-200">
              <div className="text-[10px] font-semibold tracking-widest text-sky-800 uppercase mb-1.5">⏭ Regla de exclusión</div>
              <div className="text-[12px] text-sky-900 leading-relaxed">No enviar si el usuario se registra <strong>después del día D{skip.day_offset}</strong>.</div>
              <div className="mt-2 font-mono text-[10.5px] text-sky-700 bg-white border border-sky-200 rounded px-2 py-1">{skip.pseudocode}</div>
              <div className="mt-1 text-[10.5px] text-sky-700">n8n: <span className="font-mono bg-white px-1 rounded">{skip.n8n_hint}</span></div>
            </div>
          )}

          {varsUsed.length > 0 && (
            <div className="pt-3 border-t border-stone-200">
              <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-1.5">Variables usadas</div>
              <div className="flex flex-wrap gap-1">
                {varsUsed.map(n => {
                  const isDef = vars.find(v => v.name === n);
                  const isRun = RUNTIME_VARS.has(n);
                  const cls = isDef ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : isRun ? "bg-sky-50 border-sky-200 text-sky-800"
                          : "bg-amber-50 border-amber-200 text-amber-800";
                  return <span key={n} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cls}`} title={isRun ? "Variable de runtime (n8n)" : ""}>{`{${n}}`}</span>;
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {showAttachModal && onAttachCreative && (
        <AttachCreativeModal
          msgKey={msgKey}
          creatives={creatives}
          onAttach={(creative) => { onAttachCreative(msgKey, creative); }}
          onRemove={(id) => onRemoveCreativeAssoc(msgKey, id)}
          onClose={() => setShowAttachModal(false)}
        />
      )}
      {showEvoSend && canUseEvolution && (
        <EvolutionSendModal
          msg={msg}
          rendered={rendered}
          evolutionConfig={evolutionConfig}
          onSend={onEvolutionSend}
          onClose={() => setShowEvoSend(false)}
          flowKey={flowKey}
          msgKey={msgKey}
        />
      )}
      {showMetaSend && onMetaTestSend && (
        <MetaTestSendModal
          msg={msg}
          rendered={rendered}
          metaConfig={metaConfig}
          templateMeta={templateMeta}
          onSend={onMetaTestSend}
          onClose={() => setShowMetaSend(false)}
          flowKey={flowKey}
          msgKey={msgKey}
        />
      )}
      {showTplSend && isMetaFlow && (
        <MetaTemplateSendModal
          msg={msg}
          effectiveCopy={effectiveCopy}
          vars={vars}
          templateMeta={templateMeta}
          flowKey={flowKey}
          msgId={msg.id || index}
          projectId={(metaConfig || {}).projectId || ""}
          creatives={msgCreatives}
          onClose={() => setShowTplSend(false)}
        />
      )}
    </div>
  );
}
// Modal: recorrer un flujo completo enviando todos los mensajes al teléfono QA
// con delay configurable. Polling cada 2s al backend run status.
function FlowTestRunModal({ flow, vars, edits, creatives, templatesByMsg, projectId, onClose }) {
  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
  const [to, setTo] = useState("");
  const [speedup, setSpeedup] = useState(15);
  const [run, setRun] = useState(null); // { run_id, total, done, status, results[] }
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const buildItems = () => {
    return flow.items.map((m, i) => {
      const mk = `${flow.key}:${m.id || i}`;
      const effectiveCopy = edits[mk] ?? m.copy ?? "";
      // Detectar variables del copy en orden
      const varNames = [];
      const reVar = /\{([A-Z_][A-Z0-9_]*)\}/g;
      let match;
      while ((match = reVar.exec(effectiveCopy)) !== null) {
        if (!varNames.includes(match[1])) varNames.push(match[1]);
      }
      const params = varNames.map(n => {
        const v = vars.find(x => x.name === n);
        return v?.value || `{${n}}`;
      });
      const tpl = templatesByMsg[mk];
      const templateName = tpl?.name || `waflow_${flow.key}_${(m.id || `msg${i}`).toString().toLowerCase()}`;
      const language = tpl?.language || "es";
      const firstImg = creatives.find(c => c.messageKey === mk && c.type === "image" && (c.url || "").startsWith("http"));
      return {
        msg_key: mk,
        template_name: templateName,
        language,
        params,
        header_media_url: firstImg?.url || null,
        header_media_type: firstImg ? "image" : null,
      };
    });
  };

  const items = React.useMemo(buildItems, [flow, vars, edits, creatives, templatesByMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll del estado del run
  useEffect(() => {
    if (!run?.run_id || run.status !== "running") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${API}/whatsapp/run-flow-test/${run.run_id}`);
        const data = await r.json();
        if (r.ok) setRun(data);
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [run?.run_id, run?.status, API]);

  const start = async () => {
    if (!to || to.replace(/\D/g, "").length < 6) { setError("Teléfono inválido (E.164 sin +)."); return; }
    if (items.length === 0) { setError("Este flujo no tiene mensajes."); return; }
    setStarting(true); setError(null);
    try {
      const r = await fetch(`${API}/whatsapp/run-flow-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          flow_key: flow.key,
          to_phone: to,
          speedup_seconds: Math.max(5, parseInt(speedup, 10) || 15),
          items,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Error del servidor");
      setRun({ run_id: data.run_id, total: data.total, done: 0, status: "running", results: [] });
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!run?.run_id) return;
    try {
      await fetch(`${API}/whatsapp/run-flow-test/${run.run_id}/cancel`, { method: "POST" });
      setRun(r => r ? { ...r, status: "cancelled" } : r);
    } catch {}
  };

  const running = run?.status === "running";
  const finished = run && ["completed", "cancelled"].includes(run.status);
  const okCount = (run?.results || []).filter(x => x.ok).length;
  const failCount = (run?.results || []).filter(x => !x.ok).length;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !running && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} data-testid="flow-test-run-modal">
        <div className="px-5 py-3 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-indigo-900">🧪 Recorrer flujo completo en tu teléfono</div>
            <div className="text-[11px] text-indigo-700">{flow.label} · {items.length} mensajes</div>
          </div>
          <button onClick={() => !running && onClose()} className="text-stone-500 hover:text-stone-900" disabled={running}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {!run && (
            <>
              <div className="text-[11.5px] bg-amber-50 border border-amber-200 text-amber-900 rounded p-2 leading-relaxed">
                ⚠ Asegúrate antes de que TODAS las plantillas del flujo están <strong>APPROVED</strong> en Meta (Autopilot → Sincronizar plantillas). Cada envío consume 1 conversación Meta Business.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest">Teléfono destino</label>
                  <input type="tel" value={to} onChange={e => setTo(e.target.value.replace(/\D/g, ""))}
                    placeholder="34612345678 (E.164 sin +)"
                    data-testid="flow-run-to-input"
                    className="w-full mt-1 px-3 py-2 text-sm font-mono border border-stone-300 rounded-md focus:outline-none focus:border-stone-900" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest">Delay entre mensajes (seg)</label>
                  <input type="number" min="5" max="3600" value={speedup} onChange={e => setSpeedup(e.target.value)}
                    data-testid="flow-run-delay-input"
                    className="w-full mt-1 px-3 py-2 text-sm font-mono border border-stone-300 rounded-md focus:outline-none focus:border-stone-900" />
                  <div className="text-[10.5px] text-stone-500 mt-1">Mín 5s. Con 15s: el flujo de 10 mensajes tarda ~2min 30s.</div>
                </div>
              </div>

              <div className="bg-stone-50 border border-stone-200 rounded-md p-3">
                <div className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest mb-2">Preview del orden ({items.length} mensajes)</div>
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  {items.map((it, i) => (
                    <div key={it.msg_key} className="flex items-center gap-2 text-[11.5px]">
                      <span className="text-stone-500 font-mono">{i + 1}.</span>
                      <span className="font-mono text-indigo-800 truncate flex-1">{it.template_name}</span>
                      {it.params.length > 0 && <span className="text-[10px] text-stone-500">{it.params.length} params</span>}
                      {it.header_media_url && <span className="text-[10px]">🖼</span>}
                    </div>
                  ))}
                </div>
              </div>

              {error && <div className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
            </>
          )}

          {run && (
            <>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-stone-100 border border-stone-200 rounded p-2 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">Progreso</div>
                  <div className="text-xl font-bold text-stone-900" data-testid="flow-run-progress">{run.done} / {run.total}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-emerald-700">OK</div>
                  <div className="text-xl font-bold text-emerald-900">{okCount}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-red-700">Error</div>
                  <div className="text-xl font-bold text-red-900">{failCount}</div>
                </div>
                <div className={`border rounded p-2 text-center ${running ? "bg-indigo-50 border-indigo-200" : finished && run.status === "completed" ? "bg-emerald-50 border-emerald-200" : "bg-stone-100 border-stone-200"}`}>
                  <div className="text-[10px] uppercase tracking-widest">Estado</div>
                  <div className="text-sm font-bold">{running ? "🏃 En marcha" : run.status === "completed" ? "✓ Completado" : run.status === "cancelled" ? "⏸ Cancelado" : run.status}</div>
                </div>
              </div>

              <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all" style={{ width: `${run.total > 0 ? (run.done / run.total * 100) : 0}%` }} />
              </div>

              <div className="space-y-1 max-h-[280px] overflow-y-auto">
                {(run.results || []).map(r => (
                  <div key={`${r.idx}-${r.msg_key}`}
                    className={`flex items-start gap-2 p-2 rounded border text-[11.5px] ${r.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <div>{r.ok ? "✓" : "✗"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono truncate">{r.template}</div>
                      {r.ok
                        ? <div className="text-[10px] text-emerald-700 truncate">ID: {r.message_id}</div>
                        : <div className="text-[10px] text-red-700 break-words">{r.error}</div>}
                    </div>
                  </div>
                ))}
                {running && run.done < run.total && (
                  <div className="text-[11px] text-stone-500 italic px-2 py-1">Esperando siguiente envío (cada {speedup}s)…</div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-2">
          <div className="text-[10.5px] text-stone-500">
            💡 Tiempo estimado: ~{Math.round((items.length - 1) * Math.max(5, parseInt(speedup, 10) || 15) / 60)} min
          </div>
          <div className="flex gap-2">
            {!run && (
              <>
                <button onClick={onClose} className="px-3 py-1.5 text-sm text-stone-700 hover:text-stone-900">Cancelar</button>
                <button onClick={start} disabled={starting || !to || items.length === 0}
                  data-testid="flow-run-start-btn"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
                  <Play size={12} /> {starting ? "Arrancando..." : `Enviar ${items.length} mensajes`}
                </button>
              </>
            )}
            {running && (
              <button onClick={cancel} data-testid="flow-run-cancel-btn"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-red-600 text-white rounded-md hover:bg-red-700">
                ⏸ Detener
              </button>
            )}
            {finished && (
              <button onClick={onClose} className="px-4 py-1.5 text-sm font-semibold bg-stone-900 text-white rounded-md hover:bg-stone-700">
                Cerrar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



function FlowView({
  flow, vars, showVars, onPreview, edits, onEditCopy, creatives,
  commentsByMsg, onAddComment, onRemoveComment,
  variantsByMsg, onSaveVariants,
  approvalByMsg, onSetApproval,
  templatesByMsg, onSetTemplateMeta,
  onAttachCreative, onRemoveCreativeAssoc,
  onAddCustomMessage, onRemoveCustomMessage, onEvolutionSend, evolutionConfig,
  me, projectId,
}) {
  const canUseEvolution = flow.key === "broadcasts" || flow.key === "venta_comunidad";
  const [showRunTest, setShowRunTest] = useState(false);
  const renderMsg = (m, i, pref) => {
    const mk = `${flow.key}:${m.id || i}`;
    return (
      <MessageCard key={`${pref}_${i}`} msg={m} vars={vars} showVars={showVars} index={i}
        onPreview={onPreview} editedCopy={edits[mk]}
        onEditCopy={v => onEditCopy(mk, v)} flowKey={flow.key} creatives={creatives}
        comments={commentsByMsg[mk] || []}
        onAddComment={text => onAddComment(mk, text)}
        onRemoveComment={id => onRemoveComment(mk, id)}
        variants={variantsByMsg[mk]}
        onSaveVariants={v => onSaveVariants(mk, v)}
        approval={approvalByMsg[mk]}
        onSetApproval={a => onSetApproval(mk, a)}
        templateMeta={templatesByMsg[mk]}
        onSetTemplateMeta={t => onSetTemplateMeta(mk, t)}
        isMetaFlow={!canUseEvolution}
        me={me}
        onAttachCreative={onAttachCreative}
        onRemoveCreativeAssoc={onRemoveCreativeAssoc}
        isCustom={!!m._custom}
        onRemoveCustom={m._custom && onRemoveCustomMessage ? (() => onRemoveCustomMessage(flow.key, m.id)) : null}
        canUseEvolution={canUseEvolution}
        evolutionConfig={evolutionConfig}
        onEvolutionSend={onEvolutionSend}
        metaConfig={{ projectId }}
      />
    );
  };
  const AddBar = onAddCustomMessage && (
    <div className="flex items-center justify-between mb-3 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-md">
      <div className="text-[11.5px] text-purple-900">
        <strong>Flujo {flow.label}</strong> · {flow.items.length} mensajes ({flow.items.filter(x => x._custom).length} custom)
        {canUseEvolution && <span className="ml-2 inline-block text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">🚀 Evolution API activa</span>}
        {!canUseEvolution && <span className="ml-2 inline-block text-[10px] font-semibold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">📋 Plantilla Meta oficial</span>}
      </div>
      <div className="flex items-center gap-2">
        {!canUseEvolution && (
          <button onClick={() => setShowRunTest(true)} data-testid={`flow-run-test-${flow.key}`}
            title="Enviar todos los mensajes del flujo a tu teléfono con delay configurable (modo QA)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            🧪 Recorrer flujo en mi teléfono
          </button>
        )}
        <button onClick={() => onAddCustomMessage(flow)} data-testid={`flow-add-msg-${flow.key}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700">
          <Plus size={12} /> Añadir mensaje
        </button>
      </div>
    </div>
  );
  if (flow.branching) {
    const branches = buildBranches(flow.items);
    return (
      <div className="space-y-6">
        {AddBar}
        {Object.entries(branches).map(([bname, items]) => (
          <div key={bname}>
            <div className="sticky top-[105px] bg-stone-50 py-2 z-10">
              <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-0.5">{bname === "main" ? "Secuencia principal" : bname}</div>
              <div className="h-px bg-stone-200" />
            </div>
            <div className="space-y-2 mt-3">{items.map((m, i) => renderMsg(m, i, bname))}</div>
          </div>
        ))}
        {showRunTest && (
          <FlowTestRunModal flow={flow} vars={vars} edits={edits} creatives={creatives}
            templatesByMsg={templatesByMsg} projectId={projectId} onClose={() => setShowRunTest(false)} />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {AddBar}
      {flow.items.map((m, i) => renderMsg(m, i, flow.key))}
      {showRunTest && (
        <FlowTestRunModal flow={flow} vars={vars} edits={edits} creatives={creatives}
          templatesByMsg={templatesByMsg} projectId={projectId} onClose={() => setShowRunTest(false)} />
      )}
    </div>
  );
}


// ====================================================================
// DASHBOARD DE PROYECTOS
// ====================================================================

function MeDialog({ me, onSave, onClose }) {
  const [name, setName] = useState(me || "");
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl overflow-hidden shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-stone-200">
          <div className="font-bold text-stone-900">¿Cómo te llamas?</div>
          <div className="text-[11px] text-stone-500 mt-1">Se usa para firmar comentarios e historial. Solo tú y tu equipo lo veis.</div>
        </div>
        <div className="p-5">
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Dani"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900" />
        </div>
        <div className="px-5 py-3 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900">Cancelar</button>
          <button onClick={() => { if (name.trim()) onSave(name.trim()); }}
            className="px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ProjectDialog({ project, onSave, onClose, isNew, me }) {
  const [draft, setDraft] = useState(project || newProject({ created_by: me || null }));
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div className="text-lg font-bold text-stone-900">{isNew ? "Nuevo proyecto" : "Editar proyecto"}</div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre del proyecto" value={draft.name} onChange={v => setDraft({ ...draft, name: v })} placeholder="Ej: Lanzamiento Marzo 2026" />
            <Field label="Cliente" value={draft.client} onChange={v => setDraft({ ...draft, client: v })} placeholder="Ej: Juan Pérez / Empresa S.L." />
          </div>
          {isNew && (
            <div>
              <label className="text-[11px] font-medium text-stone-600">Estrategia</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {Object.values(STRATEGY_TEMPLATES).map(s => (
                  <button key={s.key} onClick={() => setDraft({ ...draft, strategy: s.key })}
                    className={`text-left p-3 rounded-md border transition ${
                      draft.strategy === s.key ? "border-stone-900 bg-stone-50" : "border-stone-200 hover:border-stone-400"
                    }`}>
                    <div className="text-xl">{s.emoji}</div>
                    <div className="text-sm font-semibold text-stone-900 mt-1">{s.label}</div>
                    <div className="text-[11px] text-stone-500 mt-0.5">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-[11px] font-medium text-stone-600">Emoji</label>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {PROJECT_EMOJIS.map(e => (
                <button key={e} onClick={() => setDraft({ ...draft, emoji: e })}
                  className={`w-9 h-9 rounded-md border text-lg transition ${
                    draft.emoji === e ? "border-stone-900 bg-stone-100" : "border-stone-200 hover:border-stone-400"
                  }`}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-stone-600">Color</label>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {PROJECT_COLORS.map(c => (
                <button key={c} onClick={() => setDraft({ ...draft, color: c })}
                  className={`w-9 h-9 rounded-md border-2 transition ${draft.color === c ? "border-stone-900" : "border-stone-200 hover:border-stone-400"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-stone-600">Notas internas (solo equipo)</label>
            <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Contexto del cliente, fechas clave, acuerdos..."
              className="w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900 min-h-[80px]" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900">Cancelar</button>
          <button onClick={() => { if (!draft.name.trim()) { alert("Nombre del proyecto requerido"); return; } onSave({ ...draft, updated_at: Date.now() }); }}
            className="px-4 py-1.5 text-sm font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700">
            {isNew ? "Crear proyecto" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectsDashboard({ projects, onOpen, onCreate, onEdit, onDuplicate, onArchive, onDelete, me, onEditMe }) {
  const [filter, setFilter] = useState("active"); // active | archived | all
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    let list = projects;
    if (filter === "active") list = list.filter(p => p.status !== "archived");
    if (filter === "archived") list = list.filter(p => p.status === "archived");
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || (p.client || "").toLowerCase().includes(s));
    }
    return [...list].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }, [projects, filter, q]);

  const activeCount = projects.filter(p => p.status !== "archived").length;
  const archivedCount = projects.filter(p => p.status === "archived").length;

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/fascinads-logo.png" alt="Fascinads" className="h-7 w-auto select-none" draggable="false" />
            <div className="h-6 w-px bg-stone-200" />
            <div>
              <div className="text-lg font-bold text-stone-900 tracking-tight">WAFLOW</div>
              <div className="text-[11px] text-stone-500">Panel de proyectos · {activeCount} activos · {archivedCount} archivados</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEditMe}
              data-testid="connected-user-dashboard"
              title="Clic para cambiar el nombre del usuario"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                {(me || "?").charAt(0).toUpperCase()}
              </span>
              Conectado · <strong>{me || "sin nombre"}</strong>
              <Edit3 size={10} className="opacity-60" />
            </button>
            <button onClick={onCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700">
              <Plus size={13} /> Nuevo proyecto
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex gap-1">
            <button onClick={() => setFilter("active")} className={`px-3 py-1.5 text-xs font-medium rounded-md ${filter === "active" ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}>Activos ({activeCount})</button>
            <button onClick={() => setFilter("archived")} className={`px-3 py-1.5 text-xs font-medium rounded-md ${filter === "archived" ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}>Archivados ({archivedCount})</button>
            <button onClick={() => setFilter("all")} className={`px-3 py-1.5 text-xs font-medium rounded-md ${filter === "all" ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}>Todos</button>
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar proyecto o cliente..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-stone-200 rounded-md focus:outline-none focus:border-stone-900" />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="bg-white border border-dashed border-stone-300 rounded-xl p-12 text-center">
            <Folder size={36} className="mx-auto text-stone-400" />
            <div className="text-lg font-medium text-stone-800 mt-3">{projects.length === 0 ? "Aún no tienes proyectos" : "No hay resultados"}</div>
            <div className="text-sm text-stone-500 mt-1 max-w-md mx-auto">{projects.length === 0 ? "Crea tu primer proyecto para un cliente. Podrás elegir entre estrategia de lanzamiento webinar o evergreen." : "Ajusta el filtro o la búsqueda."}</div>
            {projects.length === 0 && (
              <button onClick={onCreate}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700">
                <Plus size={14} /> Crear el primero
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visible.map(p => {
              const strat = STRATEGY_TEMPLATES[p.strategy];
              return (
                <div key={p.id} className={`bg-white border rounded-xl overflow-hidden hover:shadow-lg transition cursor-pointer group ${p.status === "archived" ? "opacity-60" : "border-stone-200"}`} onClick={() => onOpen(p.id)}>
                  <div className="h-20 relative flex items-center justify-center text-4xl" style={{ backgroundColor: p.color + "22", borderBottom: `3px solid ${p.color}` }}>
                    <span>{p.emoji}</span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-stone-900 truncate">{p.name}</div>
                        {p.client && <div className="text-[11px] text-stone-500 truncate">{p.client}</div>}
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
                        <button onClick={e => { e.stopPropagation(); onEdit(p); }} className="p-1 text-stone-500 hover:text-stone-900" title="Editar"><Edit3 size={12} /></button>
                        <button onClick={e => { e.stopPropagation(); onDuplicate(p); }} className="p-1 text-stone-500 hover:text-stone-900" title="Duplicar"><Copy size={12} /></button>
                        <button onClick={e => { e.stopPropagation(); onArchive(p); }} className="p-1 text-stone-500 hover:text-stone-900" title={p.status === "archived" ? "Reactivar" : "Archivar"}><Archive size={12} /></button>
                        <button onClick={e => { e.stopPropagation(); onDelete(p); }} className="p-1 text-stone-500 hover:text-red-600" title="Eliminar"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[10px]">
                      <span className="bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded">{strat?.emoji} {strat?.label}</span>
                      {p.status === "archived" && <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">Archivado</span>}
                    </div>
                    <div className="text-[10px] text-stone-400 mt-2 flex items-center gap-2 flex-wrap">
                      <span>Actualizado {(p.updated_at || p.created_at) ? new Date(p.updated_at || p.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "—"}</span>
                      {p.created_by && (
                        <span data-testid={`project-creator-${p.id}`} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded">
                          <User size={9} /> {p.created_by}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}


// ====================================================================
// MINDMAP (dinámico según la estrategia del proyecto)
// ====================================================================
function FlowMiniMap({ flow, onMsgClick, onAddMessage }) {
  // Muestra los mensajes del flujo como chips conectados.
  // Si el flujo tiene ramas (M3.A, M3.B...), agrupa visualmente.
  const branches = flow.branching ? buildBranches(flow.items) : { main: flow.items };
  const branchKeys = Object.keys(branches);

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-200 flex items-center gap-2" style={{ borderLeft: `4px solid ${flow.color}` }}>
        <flow.icon size={14} style={{ color: flow.color }} />
        <div className="flex-1">
          <div className="text-sm font-semibold text-stone-900">{flow.label}</div>
          <div className="text-[10px] text-stone-500">{flow.items.length} mensajes{flow.branching ? ` · ${branchKeys.length - (branches.main ? 0 : 1)} ramas` : ""}</div>
        </div>
        {onAddMessage && (
          <button onClick={() => onAddMessage(flow)}
            data-testid={`map-add-msg-${flow.key}`}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-medium rounded border text-purple-700 border-purple-300 bg-purple-50 hover:bg-purple-100">
            <Plus size={11} /> Añadir mensaje
          </button>
        )}
        <button onClick={() => onMsgClick && onMsgClick(flow.key)}
          className="text-[10px] font-medium text-stone-600 hover:text-stone-900 underline">
          Ver flujo →
        </button>
      </div>
      <div className="p-4 bg-stone-50 overflow-x-auto">
        {branchKeys.map((bname, bi) => {
          const items = branches[bname];
          if (!items || items.length === 0) return null;
          return (
            <div key={bname} className={bi > 0 ? "mt-4 pt-4 border-t border-dashed border-stone-200" : ""}>
              {flow.branching && (
                <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-2">
                  {bname === "main" ? "Secuencia principal" : bname}
                </div>
              )}
              <div className="flex items-center gap-1.5 min-w-max">
                {items.map((m, i) => (
                  <React.Fragment key={`${bname}_${i}`}>
                    {onAddMessage && i === 0 && (
                      <button onClick={() => onAddMessage(flow, 0)} title="Insertar al principio"
                        className="text-purple-500 hover:text-purple-700 shrink-0 px-0.5 text-xs">+</button>
                    )}
                    <button
                      onClick={() => onMsgClick && onMsgClick(flow.key, m.id || i)}
                      title={m.objetivo || (m.copy || "").slice(0, 80)}
                      className={`bg-white border rounded-md px-2 py-1.5 text-left hover:border-stone-900 transition min-w-[90px] max-w-[130px] ${m._custom ? "ring-2 ring-purple-300" : ""}`}
                      style={{ borderColor: flow.color + "55" }}
                    >
                      <div className="text-[10.5px] font-mono font-semibold text-stone-900 truncate">{m._custom && "✨ "}{m.id || m.dia || `#${i+1}`}</div>
                      <div className="text-[9.5px] text-stone-500 truncate">{m.timing || m.hora || m.fecha_relativa || ""}</div>
                      {m.objetivo && <div className="text-[9.5px] text-stone-700 truncate mt-0.5">{m.objetivo}</div>}
                    </button>
                    {i < items.length - 1 && (
                      <>
                        {onAddMessage ? (
                          <button onClick={() => onAddMessage(flow, i + 1)} title="Insertar entre mensajes"
                            className="text-purple-500 hover:text-purple-700 shrink-0 px-0.5 text-sm">⊕</button>
                        ) : (
                          <div className="text-stone-400 shrink-0 text-xs">→</div>
                        )}
                      </>
                    )}
                    {i === items.length - 1 && onAddMessage && (
                      <button onClick={() => onAddMessage(flow, items.length)} title="Insertar al final"
                        className="text-purple-500 hover:text-purple-700 shrink-0 px-0.5 text-xs">+</button>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MindMap({ strategyKey, flows, onFlowClick, onAddMessage }) {
  const flowsResolved = flows || getFlowsForStrategy(strategyKey);

  // Para webinar: diagrama original
  if (strategyKey === "webinar") {
    const nodes = [
      { id: "lead", label: "Lead\nregistrado", x: 100, y: 240, type: "entry", color: "#64748B" },
      { id: "escribe", label: "¿Escribe\nprimero?", x: 260, y: 240, type: "decision", color: "#F59E0B" },
      { id: "flujo_a", label: "Flujo A\n24 msgs\n4 ramas", x: 440, y: 120, type: "flow", flowKey: "flujo_a", color: "#25D366" },
      { id: "pre_webinar_1a1", label: "1-1 Pre-webinar\n9 msgs", x: 440, y: 240, type: "flow", flowKey: "pre_webinar_1a1", color: "#128C7E" },
      { id: "broadcasts", label: "Broadcasts\n10 msgs", x: 440, y: 360, type: "flow", flowKey: "broadcasts", color: "#075E54" },
      { id: "webinar", label: "🎥 WEBINAR\nen directo", x: 640, y: 240, type: "event", color: "#DC2626" },
      { id: "post", label: "¿Asistió?", x: 820, y: 240, type: "decision", color: "#F59E0B" },
      { id: "venta_1a1", label: "Venta 1-1\n9 msgs", x: 1000, y: 120, type: "flow", flowKey: "venta_1a1", color: "#128C7E" },
      { id: "venta_comunidad", label: "Venta Comunidad\n15 msgs", x: 1000, y: 240, type: "flow", flowKey: "venta_comunidad", color: "#25D366" },
      { id: "replay", label: "Replay\n6 msgs", x: 1000, y: 360, type: "flow", flowKey: "replay", color: "#075E54" },
      { id: "conversion", label: "💰\nConversión", x: 1200, y: 240, type: "goal", color: "#059669" },
    ];
    const edges = [
      { from: "lead", to: "escribe" },
      { from: "escribe", to: "flujo_a", label: "Sí" },
      { from: "escribe", to: "pre_webinar_1a1", label: "No" },
      { from: "escribe", to: "broadcasts", label: "No" },
      { from: "flujo_a", to: "webinar" },
      { from: "pre_webinar_1a1", to: "webinar" },
      { from: "broadcasts", to: "webinar" },
      { from: "webinar", to: "post" },
      { from: "post", to: "venta_1a1", label: "Sí (directo)" },
      { from: "post", to: "venta_comunidad", label: "Sí (grupo)" },
      { from: "post", to: "replay", label: "No" },
      { from: "venta_1a1", to: "conversion" },
      { from: "venta_comunidad", to: "conversion" },
      { from: "replay", to: "conversion" },
    ];
    return (
      <div className="space-y-6">
        <MindMapSVG nodes={nodes} edges={edges} onFlowClick={onFlowClick} viewBox="0 0 1320 480" />
        <div>
          <h3 className="text-lg font-bold text-stone-900 mb-1">Mapa por flujo</h3>
          <p className="text-xs text-stone-500 mb-4">Vista secuencial de los mensajes dentro de cada flujo</p>
          <div className="space-y-4">
            {flowsResolved.map(f => <FlowMiniMap key={f.key} flow={f} onMsgClick={onFlowClick} onAddMessage={onAddMessage} />)}
          </div>
        </div>
      </div>
    );
  }

  // Para evergreen: diagrama lineal
  const nodes = [
    { id: "lead", label: "Lead", x: 100, y: 200, type: "entry", color: "#64748B" },
    { id: "welcome", label: "Bienvenida\n1 msg", x: 280, y: 200, type: "flow", flowKey: "welcome", color: "#25D366" },
    { id: "engaged", label: "¿Engaged?", x: 460, y: 200, type: "decision", color: "#F59E0B" },
    { id: "nurturing", label: "Nurturing\n2 msgs", x: 640, y: 120, type: "flow", flowKey: "nurturing", color: "#128C7E" },
    { id: "dormant", label: "Dormido\n(pausa)", x: 640, y: 280, type: "event", color: "#94A3B8" },
    { id: "signal", label: "¿Señal\nde compra?", x: 820, y: 120, type: "decision", color: "#F59E0B" },
    { id: "venta_evergreen", label: "Venta\n1 msg", x: 1000, y: 120, type: "flow", flowKey: "venta_evergreen", color: "#075E54" },
    { id: "conversion", label: "💰\nConversión", x: 1180, y: 120, type: "goal", color: "#059669" },
  ];
  const edges = [
    { from: "lead", to: "welcome" },
    { from: "welcome", to: "engaged" },
    { from: "engaged", to: "nurturing", label: "Sí" },
    { from: "engaged", to: "dormant", label: "No" },
    { from: "nurturing", to: "signal" },
    { from: "signal", to: "venta_evergreen", label: "Sí" },
    { from: "signal", to: "nurturing", label: "No (continuar)" },
    { from: "venta_evergreen", to: "conversion" },
  ];
  return (
    <div className="space-y-6">
      <MindMapSVG nodes={nodes} edges={edges} onFlowClick={onFlowClick} viewBox="0 0 1300 400" />
      <div>
        <h3 className="text-lg font-bold text-stone-900 mb-1">Mapa por flujo</h3>
        <p className="text-xs text-stone-500 mb-4">Vista secuencial de los mensajes dentro de cada flujo</p>
        <div className="space-y-4">
          {flowsResolved.map(f => <FlowMiniMap key={f.key} flow={f} onMsgClick={onFlowClick} onAddMessage={onAddMessage} />)}
        </div>
      </div>
    </div>
  );
}

function MindMapSVG({ nodes, edges, onFlowClick, viewBox }) {
  const [selected, setSelected] = useState(null);
  const nodeBy = id => nodes.find(n => n.id === id);
  const getShape = n => n.type === "decision" ? "diamond" : (n.type === "event" || n.type === "goal") ? "circle" : "rect";

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-stone-200">
        <h2 className="text-lg font-bold text-stone-900">Mapa mental de la estrategia</h2>
        <p className="text-xs text-stone-500 mt-0.5">Arquitectura del lanzamiento · toca un flujo para ver sus mensajes</p>
      </div>
      <div className="bg-stone-50 overflow-auto">
        <svg viewBox={viewBox} className="w-full min-w-[1200px]" style={{ maxHeight: "70vh" }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = nodeBy(e.from), b = nodeBy(e.to);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            return (
              <g key={`edge-${e.from}-${e.to}-${i}`}>
                <line x1={a.x + 60} y1={a.y} x2={b.x - 60} y2={b.y} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow)" />
                {e.label && (<g><rect x={mx - 28} y={my - 9} width="56" height="18" rx="4" fill="white" stroke="#e2e8f0" /><text x={mx} y={my + 3} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="500">{e.label}</text></g>)}
              </g>
            );
          })}
          {nodes.map(n => {
            const shape = getShape(n);
            const clickable = !!n.flowKey;
            const isSel = selected === n.id;
            return (
              <g key={n.id} style={{ cursor: clickable ? "pointer" : "default" }}
                onClick={() => { if (n.flowKey && onFlowClick) onFlowClick(n.flowKey); setSelected(n.id); }}>
                {shape === "rect" && <rect x={n.x - 60} y={n.y - 30} width="120" height="60" rx="8" fill={n.color} stroke={isSel ? "#0f172a" : "none"} strokeWidth="2" opacity={clickable ? 1 : 0.85} />}
                {shape === "diamond" && <polygon points={`${n.x},${n.y - 35} ${n.x + 65},${n.y} ${n.x},${n.y + 35} ${n.x - 65},${n.y}`} fill={n.color} stroke={isSel ? "#0f172a" : "none"} strokeWidth="2" />}
                {shape === "circle" && <circle cx={n.x} cy={n.y} r="40" fill={n.color} stroke={isSel ? "#0f172a" : "none"} strokeWidth="2" />}
                {n.label.split("\n").map((line, i, arr) => (
                  <text key={`line-${n.id}-${i}`} x={n.x} y={n.y - ((arr.length - 1) * 6) + (i * 13)} textAnchor="middle" fontSize="11" fill="white" fontWeight={i === 0 ? "600" : "400"}>{line}</text>
                ))}
                {clickable && <text x={n.x + 48} y={n.y - 22} fontSize="12" fill="white" opacity="0.7">↗</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ====================================================================
// CREATIVOS
// ====================================================================
function CreativesPanel({ creatives, setCreatives, allMessages }) {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ name: "", type: "image", source: "url", url: "", messageKey: "", notes: "" });
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (file.size > 2 * 1024 * 1024) alert("Archivo >2MB: recomiendo subirlo a Drive/Dropbox y pegar URL.");
      setDraft({ ...draft, source: "upload", url: reader.result, name: draft.name || file.name,
        type: file.type.startsWith("video") ? "video" : file.type.startsWith("image/gif") ? "gif" : "image" });
    };
    reader.readAsDataURL(file);
  };

  const add = () => {
    if (!draft.name || (!draft.url && draft.source === "url")) { alert("Necesito nombre y URL/archivo"); return; }
    setCreatives([...creatives, { ...draft, id: Date.now().toString(36) }]);
    setDraft({ name: "", type: "image", source: "url", url: "", messageKey: "", notes: "" });
    setShowAdd(false);
  };

  const remove = (id) => { if (confirm("¿Eliminar creativo?")) setCreatives(creatives.filter(c => c.id !== id)); };

  const typeIcon = t => t === "image" ? "🖼️" : t === "video" ? "🎬" : t === "gif" ? "✨" : "📄";

  const grouped = useMemo(() => {
    const g = { "Sin asignar": [] };
    creatives.forEach(c => {
      if (!c.messageKey) { g["Sin asignar"].push(c); return; }
      const msg = allMessages.find(m => m.key === c.messageKey);
      const k = msg ? msg.label : "Sin asignar";
      if (!g[k]) g[k] = []; g[k].push(c);
    });
    return g;
  }, [creatives, allMessages]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Biblioteca de creativos</h2>
          <p className="text-xs text-stone-500 mt-0.5">{creatives.length} creativos para este proyecto</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700">
          <Upload size={13} /> Añadir creativo
        </button>
      </div>

      {showAdd && (
        <div className="bg-white border border-stone-300 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Nuevo creativo</div>
            <button onClick={() => setShowAdd(false)} className="text-stone-500 hover:text-stone-900"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" value={draft.name} onChange={v => setDraft({ ...draft, name: v })} placeholder="Ej: Testimonio Laura" />
            <div>
              <label className="text-[11px] font-medium text-stone-600">Tipo</label>
              <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md bg-white">
                <option value="image">Imagen</option><option value="video">Video</option><option value="gif">GIF</option><option value="pdf">PDF</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setDraft({ ...draft, source: "url" })} className={`flex-1 py-1.5 text-xs font-medium rounded-md border ${draft.source === "url" ? "bg-stone-900 text-white border-stone-900" : "bg-white border-stone-200"}`}><LinkIcon size={12} className="inline mr-1" /> URL</button>
            <button onClick={() => setDraft({ ...draft, source: "upload" })} className={`flex-1 py-1.5 text-xs font-medium rounded-md border ${draft.source === "upload" ? "bg-stone-900 text-white border-stone-900" : "bg-white border-stone-200"}`}><Upload size={12} className="inline mr-1" /> Subir</button>
          </div>
          {draft.source === "url" ? (
            <Field label="URL" value={draft.url} onChange={v => setDraft({ ...draft, url: v })} placeholder="https://..." mono />
          ) : (
            <div>
              <label className="text-[11px] font-medium text-stone-600">Archivo</label>
              <input ref={fileRef} type="file" onChange={handleFile} className="w-full mt-1 text-xs" />
              {draft.url && draft.source === "upload" && <div className="mt-2 text-[11px] text-emerald-700">✓ Cargado</div>}
            </div>
          )}
          <div>
            <label className="text-[11px] font-medium text-stone-600">Asociar a mensaje (opcional)</label>
            <select value={draft.messageKey} onChange={e => setDraft({ ...draft, messageKey: e.target.value })}
              className="w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md bg-white">
              <option value="">Sin asignar</option>
              {allMessages.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-stone-600">Notas</label>
            <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}
              className="w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900 min-h-[60px]" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs">Cancelar</button>
            <button onClick={add} className="px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md">Añadir</button>
          </div>
        </div>
      )}

      {creatives.length === 0 && !showAdd && (
        <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center">
          <ImageIcon size={28} className="mx-auto text-stone-400" />
          <div className="text-sm text-stone-600 mt-2">Todavía no has añadido creativos</div>
        </div>
      )}

      {Object.entries(grouped).map(([gname, items]) => items.length > 0 && (
        <div key={gname}>
          <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-2">{gname}</div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(c => (
              <div key={c.id} className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                <div className="aspect-video bg-stone-100 flex items-center justify-center relative">
                  {c.type === "image" && c.url ? <img src={c.url} alt={c.name} className="w-full h-full object-cover" onError={e => e.target.style.display = "none"} /> : <div className="text-4xl">{typeIcon(c.type)}</div>}
                  <button onClick={() => remove(c.id)} className="absolute top-1.5 right-1.5 p-1 bg-white/90 border border-stone-200 rounded text-stone-500 hover:text-red-600"><Trash2 size={12} /></button>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{typeIcon(c.type)}</span>
                    <div className="text-sm font-medium text-stone-900 truncate">{c.name}</div>
                  </div>
                  {c.url && <div className="text-[10px] text-stone-500 truncate font-mono mt-1">{c.url.startsWith("data:") ? "(archivo local)" : c.url}</div>}
                  {c.notes && <div className="text-[11px] text-stone-600 mt-1.5 line-clamp-2">{c.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ====================================================================
// CONEXIONES
// ====================================================================
function ConnectionsPanel({ conn, setConn, projectName, notifyConfig, setNotifyConfig }) {
  const [testResult, setTestResult] = useState({});
  const [testing, setTesting] = useState({});
  const testConnection = async (type, config, key) => {
    setTesting(s => ({ ...s, [key]: true }));
    setTestResult(r => ({ ...r, [key]: null }));
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, config }),
      });
      const data = await res.json();
      setTestResult(r => ({ ...r, [key]: data }));
    } catch (e) {
      setTestResult(r => ({ ...r, [key]: { ok: false, error: String(e) } }));
    } finally {
      setTesting(s => ({ ...s, [key]: false }));
    }
  };
  const TestBadge = ({ k }) => {
    const r = testResult[k];
    if (testing[k]) return <span className="text-[11px] text-stone-500 ml-2">Probando...</span>;
    if (!r) return null;
    return (
      <div className={`text-[11px] mt-2 p-2 rounded border ${r.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-900"}`}>
        {r.ok ? "✅ " : "❌ "}{r.detail || r.error || (r.ok ? "OK" : "Error")}
      </div>
    );
  };
  const [sendingMsg, setSendingMsg] = useState(false);
  const [sendMsgResult, setSendMsgResult] = useState(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("Mensaje de prueba ✅");

  const update = (k, v) => setConn({ ...conn, [k]: v });

  const sendTest = async () => {
    if (!conn.phoneNumberId || !conn.accessToken || !testPhone) { setSendMsgResult({ ok: false, msg: "Faltan: Phone Number ID, Access Token o teléfono" }); return; }
    setSendingMsg(true); setSendMsgResult(null);
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${conn.phoneNumberId}/messages`, {
        method: "POST", headers: { "Authorization": `Bearer ${conn.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: testPhone.replace(/\D/g, ""), type: "text", text: { body: testMsg } })
      });
      const data = await r.json();
      if (r.ok) setSendMsgResult({ ok: true, msg: `✓ Enviado. ID: ${data.messages?.[0]?.id || "?"}` });
      else setSendMsgResult({ ok: false, msg: `Error ${r.status}: ${data.error?.message || "desconocido"}` });
    } catch (e) { setSendMsgResult({ ok: false, msg: "Red: " + e.message }); }
    setSendingMsg(false);
  };

  const exportEnv = () => {
    const env = [
      `# WhatsApp Business API — proyecto "${projectName}"`,
      `META_PHONE_NUMBER_ID=${conn.phoneNumberId || ""}`,
      `META_WABA_ID=${conn.wabaId || ""}`,
      `META_ACCESS_TOKEN=${conn.accessToken || ""}`,
      `META_APP_ID=${conn.appId || ""}`,
      `META_APP_SECRET=${conn.appSecret || ""}`,
      `META_WEBHOOK_VERIFY_TOKEN=${conn.webhookVerifyToken || ""}`,
      `META_DISPLAY_PHONE=${conn.displayPhone || ""}`,
      ``,
      `# n8n`,
      `N8N_WEBHOOK_URL=${conn.n8nWebhookUrl || ""}`,
      `N8N_API_URL=${conn.n8nApiUrl || ""}`,
      `N8N_API_KEY=${conn.n8nApiKey || ""}`,
    ].join("\n");
    const blob = new Blob([env], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `.env.${projectName.replace(/\W+/g, "_")}`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Conexiones del proyecto</h2>
        <p className="text-xs text-stone-500 mt-0.5">Credenciales específicas de este cliente · independientes de otros proyectos</p>
      </div>
      <div className="p-3 rounded-md bg-amber-50 border border-amber-200 flex items-start gap-2">
        <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="text-[12px] text-amber-900 leading-relaxed">
          <strong>Aviso:</strong> las credenciales se guardan compartidas en el equipo. En producción, el Access Token tiene que vivir en n8n/backend.
        </div>
      </div>
      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded bg-[#25D366] flex items-center justify-center text-white text-xs font-bold">M</div>
          <div className="font-semibold text-stone-900">Meta WhatsApp Cloud API</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Display phone" value={conn.displayPhone} onChange={v => update("displayPhone", v)} placeholder="+34 612 345 678" />
          <Field label="Phone Number ID" value={conn.phoneNumberId} onChange={v => update("phoneNumberId", v)} mono />
          <Field label="WABA ID" value={conn.wabaId} onChange={v => update("wabaId", v)} mono />
          <Field label="App ID" value={conn.appId} onChange={v => update("appId", v)} mono />
          <Field label="Access Token" value={conn.accessToken} onChange={v => update("accessToken", v)} mono password full />
          <Field label="App Secret" value={conn.appSecret} onChange={v => update("appSecret", v)} mono password />
          <Field label="Webhook Verify Token" value={conn.webhookVerifyToken} onChange={v => update("webhookVerifyToken", v)} mono />
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button onClick={() => testConnection("meta", { phone_number_id: conn.phoneNumberId, access_token: conn.accessToken }, "meta")}
            data-testid="test-meta-btn"
            disabled={testing.meta}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50">
            <Plug size={12} /> Probar conexión Meta
          </button>
          <div className="text-[10.5px] text-stone-500">
            💡 Para crear/actualizar las plantillas Meta de este proyecto usa el botón <strong>"Sincronizar plantillas con Meta"</strong> del tab <strong>Autopilot</strong>.
          </div>
        </div>
        <TestBadge k="meta" />
      </div>
      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded bg-[#EA4B71] flex items-center justify-center text-white text-xs font-bold">n8n</div>
          <div className="font-semibold">n8n</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Webhook URL (Meta → n8n)" value={conn.n8nWebhookUrl} onChange={v => update("n8nWebhookUrl", v)} mono full />
          <Field label="n8n API URL" value={conn.n8nApiUrl} onChange={v => update("n8nApiUrl", v)} mono />
          <Field label="n8n API Key" value={conn.n8nApiKey} onChange={v => update("n8nApiKey", v)} mono password />
          <Field label="Webhook deploy (🚀 Lanzar ahora)" value={conn.n8nDeployWebhookUrl} onChange={v => update("n8nDeployWebhookUrl", v)} mono full />
        </div>
        <div className="text-[10.5px] text-stone-500 bg-stone-50 border border-stone-200 rounded p-2 mt-3 leading-relaxed">
          💡 <strong>Webhook deploy</strong>: lo usa el botón "🚀 Lanzar ahora" del Autopilot. Tu workflow n8n debe recibir el JSON del payload y crear/activar el workflow generado por WAFLOW (via <code className="font-mono">/rest/workflows</code> de n8n API, o guardarlo para revisión manual).
        </div>
      </div>
      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">🚀</div>
          <div className="font-semibold text-stone-900">Evolution API (broadcasts & comunidad)</div>
        </div>
        <div className="text-[11.5px] text-stone-500 mb-4 leading-relaxed">
          Para los flujos <strong>broadcasts programados</strong> y <strong>venta comunidad</strong>. Los demás flujos (1-1, retargeting…) usan plantillas oficiales Meta para evitar bans.
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Server URL Evolution" value={conn.evolution?.server_url || ""}
            onChange={v => setConn({ ...conn, evolution: { ...(conn.evolution || {}), server_url: v } })}
            placeholder="https://evolution.miserver.com" mono full />
          <div className="text-[10.5px] text-stone-500 bg-stone-50 border border-stone-200 rounded p-2 leading-relaxed">
            💡 Para enviar a una <strong>comunidad/grupo</strong> WhatsApp usa el JID del grupo (formato <code className="font-mono">1203630...@g.us</code>). Para número individual, formato E.164 sin <code className="font-mono">+</code>.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="API Key" value={conn.evolution?.api_key || ""}
              onChange={v => setConn({ ...conn, evolution: { ...(conn.evolution || {}), api_key: v } })}
              placeholder="clave-larga" mono />
            <Field label="Instancia" value={conn.evolution?.instance || ""}
              onChange={v => setConn({ ...conn, evolution: { ...(conn.evolution || {}), instance: v } })}
              placeholder="nombre-instancia" mono />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <button onClick={() => testConnection("evolution", { server_url: conn.evolution?.server_url, api_key: conn.evolution?.api_key, instance: conn.evolution?.instance }, "evolution")}
              data-testid="test-evolution-btn"
              disabled={testing.evolution}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50">
              <Plug size={12} /> Probar conexión Evolution
            </button>
          </div>
          <TestBadge k="evolution" />
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">🔔</div>
          <div className="font-semibold text-stone-900">Notificaciones al equipo</div>
        </div>
        <div className="text-[11.5px] text-stone-500 mb-4 leading-relaxed">
          Cuando el cliente apruebe <strong>más del 80%</strong> de los mensajes en el link mágico, enviamos un aviso automático a estos webhooks.
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Slack incoming webhook URL" value={notifyConfig?.slack_url || ""}
            onChange={v => setNotifyConfig({ ...(notifyConfig || {}), slack_url: v })}
            placeholder="https://hooks.slack.com/services/T.../B.../..." mono full />
          <Field label="Discord webhook URL" value={notifyConfig?.discord_url || ""}
            onChange={v => setNotifyConfig({ ...(notifyConfig || {}), discord_url: v })}
            placeholder="https://discord.com/api/webhooks/.../..." mono full />
          {notifyConfig?.notified_80_at && (
            <div className="text-[10.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
              ✅ Ya se notificó al equipo el {new Date(notifyConfig.notified_80_at).toLocaleString("es-ES")} ·
              <button onClick={() => setNotifyConfig({ ...notifyConfig, notified_80_at: null, notified_stats: null })}
                className="ml-2 underline hover:text-emerald-900">Resetear</button>
            </div>
          )}
        </div>
      </div>
      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4"><Send size={16} /><div className="font-semibold">Mensaje de prueba</div></div>
        <div className="space-y-3">
          <Field label="Teléfono destino (sin +)" value={testPhone} onChange={setTestPhone} placeholder="34612345678" mono />
          <div>
            <label className="text-[11px] font-medium text-stone-600">Mensaje</label>
            <textarea value={testMsg} onChange={e => setTestMsg(e.target.value)} className="w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md min-h-[70px]" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={sendTest} disabled={sendingMsg} data-testid="meta-send-test-btn" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-md disabled:opacity-50">
              <Send size={14} /> {sendingMsg ? "Enviando..." : "Enviar"}
            </button>
            {sendMsgResult && <div className={`text-xs ${sendMsgResult.ok ? "text-emerald-700" : "text-red-700"}`}>{sendMsgResult.msg}</div>}
          </div>
          <div className="text-[11px] text-stone-500">⚠️ Meta requiere ventana 24h activa o template aprobada.</div>
        </div>
      </div>
      <button onClick={exportEnv} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 border border-stone-300 rounded-md hover:border-stone-900">
        <Download size={13} /> Exportar .env
      </button>
    </div>
  );
}


// ====================================================================
// LAUNCH WIZARD — Modo Lanzamiento Activo
// Pasos: snapshot → deploy n8n → iniciar polling → auto-freeze al 95%
// ====================================================================
function LaunchWizard({ project, connections, workflowJson, snapshotId, onDeployed, onClose }) {
  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
  const [step, setStep] = useState(0); // 0:review, 1:deploying, 2:running
  const [deployResult, setDeployResult] = useState(null);
  const [error, setError] = useState(null);
  const deployUrl = connections?.n8nDeployWebhookUrl || "";

  const steps = [
    { label: "Snapshot Pre-launch", icon: "📸", done: !!snapshotId },
    { label: "Desplegar a n8n", icon: "🚀", done: step >= 2 },
    { label: "Activar polling", icon: "📡", done: step >= 2 },
    { label: "Esperar 95% entregas", icon: "⏱️", done: false },
    { label: "Auto-congelar al cierre", icon: "🔒", done: false },
  ];

  const deploy = async () => {
    if (!deployUrl) { setError("Falta 'Webhook deploy' en Conexiones → n8n."); return; }
    setError(null);
    setStep(1);
    try {
      const r = await fetch(`${API}/launch/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          project_name: project.name,
          workflow_json: workflowJson,
          n8n_webhook_url: deployUrl,
          snapshot_id: snapshotId || null,
        }),
      });
      const data = await r.json();
      setDeployResult(data);
      if (!data.ok) {
        setError(`Deploy webhook devolvió error (${data.deploy_result?.status || "?"}). Revisa el webhook en tu n8n.`);
        setStep(0);
        return;
      }
      setStep(2);
      onDeployed && onDeployed(data);
    } catch (e) {
      setError("Error de red: " + String(e));
      setStep(0);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-stone-200 bg-gradient-to-r from-red-600 to-orange-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-2xl">🚀</div>
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-80">Modo Lanzamiento Activo</div>
                <div className="font-bold text-base">Lanzar "{project.name}"</div>
              </div>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white"><X size={16} /></button>
          </div>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="bg-amber-50 border border-amber-300 rounded p-3 text-[12px] text-amber-900 leading-relaxed">
            <strong>⚠️ Acción en producción.</strong> Al confirmar, WAFLOW enviará el workflow n8n generado al webhook de deploy. Tus flujos pasarán a <strong>ejecutar mensajes reales</strong>. Asegúrate de haber hecho el QA con el Simulador.
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2">Plan de lanzamiento</div>
            <div className="space-y-1.5">
              {steps.map((s, i) => (
                <div key={`lwstep-${s.label}-${i}`} className={`flex items-center gap-3 p-2.5 rounded border ${
                  s.done ? "bg-emerald-50 border-emerald-200"
                  : step === 1 && i === 1 ? "bg-indigo-50 border-indigo-300 animate-pulse"
                  : "bg-stone-50 border-stone-200"
                }`}>
                  <div className="text-lg">{s.done ? "✅" : s.icon}</div>
                  <div className="text-[13px] font-medium text-stone-800">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-1">Deploy webhook configurado</div>
            {deployUrl ? (
              <div className="text-[11.5px] font-mono bg-stone-50 border border-stone-200 rounded p-2 break-all text-stone-700">{deployUrl}</div>
            ) : (
              <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
                ❌ Falta. Configúralo en <em>Conexiones → n8n → Webhook deploy</em>.
              </div>
            )}
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded p-2.5 text-[12px] text-red-800">{error}</div>}
          {deployResult && deployResult.ok && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 text-[12px] text-emerald-800">
              ✅ Workflow enviado al webhook. Launch ID: <code className="font-mono text-[11px]">{deployResult.launch_id}</code>
              <div className="mt-1 text-[11px] text-emerald-700">El Autopilot empezará a pollear eventos automáticamente.</div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-stone-700">Cerrar</button>
          {step === 2 ? (
            <button onClick={onClose} className="px-5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
              ✅ Volver al Autopilot
            </button>
          ) : (
            <button onClick={deploy} disabled={step === 1 || !deployUrl}
              data-testid="launch-deploy-btn"
              className="px-5 py-2 text-sm font-semibold bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1.5">
              <Zap size={14} /> {step === 1 ? "Desplegando..." : "Lanzar ahora"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// AUTOPILOT PANEL — timeline de lanzamiento + pre-flight checklist + acciones
// ====================================================================
function AutopilotPanel({
  project, vars, edits, creatives, connections, notifyConfig, templatesByMsg,
  approvalByMsg, snapshots, flows, onCreateSnapshot, onFreezeToggle, onGoToTab,
  onUpdateProject,
}) {
  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
  const [reviewSignature, setReviewSignature] = useState(null);
  const [generatingWf, setGeneratingWf] = useState(false);
  const [launchWizard, setLaunchWizard] = useState(null); // {workflowJson, snapshotId}
  const [launchStatus, setLaunchStatus] = useState(null); // {active, launch, stats, delivery_rate}
  const [metaSync, setMetaSync] = useState(null); // { running, phase, total, done, results?, forceReplace }

  // Fetch review signature state
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/review/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: project.id }),
        });
        const j = await r.json();
        if (j.token) {
          const r2 = await fetch(`${API}/review/${j.token}`);
          const d = await r2.json();
          setReviewSignature({ token: j.token, locked: d.locked, signature: d.signature });
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Pre-flight checklist — cálculos en tiempo real
  const editableVars = vars.filter(v => v.editable !== false);
  const varsFilled = editableVars.filter(v => (v.value || "").trim() !== "");
  const varsPct = editableVars.length > 0 ? Math.round((varsFilled.length / editableVars.length) * 100) : 100;

  const totalMsgs = flows.reduce((s, f) => s + f.items.length, 0);
  const approvedMsgs = Object.values(approvalByMsg || {}).filter(a => a?.status === "approved").length;
  const approvalPct = totalMsgs > 0 ? Math.round((approvedMsgs / totalMsgs) * 100) : 0;

  const templatedMsgs = Object.values(templatesByMsg || {}).filter(t => t && t.name).length;
  // Flujos Meta (1-1 individual) vs Evolution (broadcasts/comunidad).
  // Por convención, todos los flujos NO-Evolution usan plantillas Meta por defecto
  // sin necesidad de marcarlos uno a uno. El checker los cuenta como "ok".
  const EVOLUTION_FLOW_KEYS = new Set(["broadcasts", "venta_comunidad"]);
  const metaFlowMsgs = flows
    .filter(f => !EVOLUTION_FLOW_KEYS.has(f.key))
    .reduce((s, f) => s + f.items.length, 0);
  const nonEvoFlowMsgs = metaFlowMsgs;
  // Un mensaje de flujo Meta "cuenta como template" si:
  //  (a) el usuario lo ha marcado explícitamente (templatesByMsg[mk].isTemplate) o
  //  (b) pertenece a un flujo Meta (asume auto-template: waflow_{flowKey}_{msgId}).
  const autoOrManualTemplatedMsgs = flows.reduce((acc, f) => {
    if (EVOLUTION_FLOW_KEYS.has(f.key)) return acc;
    return acc + f.items.length; // todos los mensajes Meta cuentan como "templated"
  }, 0);

  const hasMeta = !!(connections.phoneNumberId && connections.accessToken);
  const hasN8n = !!connections.n8nWebhookUrl;
  const hasEvo = !!(connections.evolution?.server_url && connections.evolution?.api_key && connections.evolution?.instance);
  const needsEvo = flows.some(f => (f.key === "broadcasts" || f.key === "venta_comunidad") && f.items.length > 0);

  const msgsWithCreative = new Set(creatives.filter(c => c.messageKey).map(c => c.messageKey));
  const keyMsgs = flows.flatMap(f => f.items.slice(0, 2).map(m => `${f.key}:${m.id}`)); // primeros 2 mensajes de cada flujo
  const creativesKeyPct = keyMsgs.length > 0 ? Math.round((keyMsgs.filter(k => msgsWithCreative.has(k)).length / keyMsgs.length) * 100) : 100;

  const checklist = [
    { key: "vars", label: "Variables rellenas", status: varsPct === 100 ? "ok" : varsPct >= 70 ? "warn" : "fail", detail: `${varsFilled.length}/${editableVars.length} (${varsPct}%)`, goTab: "flows" },
    { key: "approval", label: "Aprobación del cliente", status: reviewSignature?.locked || approvalPct >= 100 ? "ok" : approvalPct >= 80 ? "warn" : "fail", detail: reviewSignature?.locked ? `🔐 Firmado por ${reviewSignature.signature?.signer_name}` : `${approvedMsgs}/${totalMsgs} aprobados (${approvalPct}%)`, goTab: "client" },
    { key: "templates", label: "Plantillas Meta marcadas", status: autoOrManualTemplatedMsgs >= nonEvoFlowMsgs ? "ok" : templatedMsgs > 0 ? "warn" : "fail", detail: templatedMsgs > 0 ? `${templatedMsgs} custom + ${autoOrManualTemplatedMsgs - templatedMsgs} auto (Meta)` : `${autoOrManualTemplatedMsgs} mensajes Meta (auto-template)`, goTab: "flows" },
    { key: "meta", label: "Meta Cloud API configurada", status: hasMeta ? "ok" : "fail", detail: hasMeta ? "Phone ID + Access Token presentes" : "Falta Phone ID o Access Token", goTab: "connections" },
    { key: "n8n", label: "n8n webhook configurado", status: hasN8n ? "ok" : "warn", detail: hasN8n ? "Webhook URL presente" : "Sin webhook URL", goTab: "connections" },
    ...(needsEvo ? [{ key: "evo", label: "Evolution API (broadcasts / comunidad)", status: hasEvo ? "ok" : "fail", detail: hasEvo ? `Instancia ${connections.evolution.instance}` : "Falta configurar", goTab: "connections" }] : []),
    { key: "creatives", label: "Creativos en mensajes clave", status: creativesKeyPct === 100 ? "ok" : creativesKeyPct >= 60 ? "warn" : "fail", detail: `${creativesKeyPct}% de los primeros de cada flujo`, goTab: "creatives" },
    { key: "notify", label: "Notificaciones Slack/Discord", status: (notifyConfig?.slack_url || notifyConfig?.discord_url) ? "ok" : "warn", detail: (notifyConfig?.slack_url || notifyConfig?.discord_url) ? "Configurado" : "Opcional (no configurado)", goTab: "connections" },
  ];

  const okCount = checklist.filter(c => c.status === "ok").length;
  const failCount = checklist.filter(c => c.status === "fail").length;
  const readyPct = Math.round((okCount / checklist.length) * 100);

  // Fases del lanzamiento con su estado
  const PHASES = [
    { key: "setup", label: "1. Setup", desc: "Variables + conexiones", icon: "⚙️", done: varsPct === 100 && hasMeta, active: varsPct < 100 || !hasMeta },
    { key: "copies", label: "2. Copies & Review", desc: "Crear + revisar mensajes", icon: "✍️", done: reviewSignature?.locked, active: !reviewSignature?.locked && approvalPct < 100 },
    { key: "creatives", label: "3. Creativos", desc: "Adjuntar material visual", icon: "🎨", done: creativesKeyPct === 100, active: creativesKeyPct < 100 && reviewSignature?.locked },
    { key: "deploy", label: "4. Deploy n8n", desc: "Exportar y activar workflows", icon: "🚀", done: false, active: reviewSignature?.locked && creativesKeyPct === 100 },
    { key: "launch", label: "5. Lanzamiento", desc: "Captación activa + monitoreo", icon: "📡", done: false, active: false },
  ];

  // Polling del launch activo (cada 30s) — solo cuando hay launch activo o recién deployado
  useEffect(() => {
    let timer;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`${API}/launch/${project.id}/status`);
        const data = await r.json();
        setLaunchStatus(data);
        // Auto-freeze al 95%+ si aún no está frozen y el launch está activo
        if (data.active && data.delivery_rate >= 95 && !data.launch?.auto_frozen && project.status !== "frozen") {
          try {
            await fetch(`${API}/launch/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ project_id: project.id, reason: "auto_freeze_95_delivered" }),
            });
            if (onUpdateProject) onUpdateProject(project.id, { status: "frozen" });
          } catch {}
        }
        // Si no hay launch activo (o se completó/paró), cortar el polling
        if (!data.active || ["completed", "stopped"].includes(data.launch?.status)) {
          if (timer) { clearInterval(timer); timer = null; }
        }
      } catch {}
    };
    poll(); // 1 llamada inicial siempre para detectar si ya hay launch activo
    // Arrancar polling solo si hay launch activo (tras la 1ª respuesta)
    timer = setInterval(poll, 30000);
    return () => { stopped = true; if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.status]);

  // Sincronizar plantillas Meta: crear/actualizar en WABA del usuario via Graph API
  const syncMetaTemplates = async (forceReplace = false) => {
    // Recolectar mensajes de flujos Meta (no broadcasts, no venta_comunidad)
    const items = [];
    flows.forEach(f => {
      if (f.key === "broadcasts" || f.key === "venta_comunidad") return;
      f.items.forEach((m, i) => {
        const mk = `${f.key}:${m.id || i}`;
        const copy = edits[mk] ?? m.copy;
        const creative = creatives.find(c => c.messageKey === mk);
        items.push({
          msg_key: mk, flow_key: f.key, msg_id: (m.id || `msg${i}`).toString(),
          copy, botones: m.botones || null,
          creative_url: creative?.url || null,
        });
      });
    });
    if (items.length === 0) {
      alert("No hay mensajes de flujos Meta para sincronizar.");
      return;
    }
    setMetaSync({ running: true, phase: "Sincronizando con Meta...", total: items.length, done: 0, forceReplace });
    try {
      const r = await fetch(`${API}/meta/templates/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, items, force_replace: forceReplace }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Error del servidor");
      setMetaSync({ running: false, phase: "completed", total: data.total, done: data.total, results: data.results, summary: { created: data.created, skipped: data.skipped, failed: data.failed }, forceReplace });
    } catch (e) {
      setMetaSync({ running: false, phase: "error", error: e.message, forceReplace });
    }
  };

  const refreshMetaTemplateStatus = async () => {
    try {
      const r = await fetch(`${API}/meta/templates/status/${project.id}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Error");
      alert(`Estado refrescado: ${data.updated} plantillas actualizadas de ${data.tracked} sincronizadas (${data.total_meta} totales en tu WABA).`);
      window.location.reload(); // forzar recarga de templatesByMsg desde storage
    } catch (e) {
      alert("Error refrescando estado: " + e.message);
    }
  };

  // Construye el objeto workflow n8n (compartido por export y launch)
  const buildWorkflowJson = () => {
    const nodes = [
      {
        parameters: { httpMethod: "POST", path: `waflow-${project.id.slice(-8)}`, responseMode: "onReceived" },
        id: "n_webhook", name: "Webhook entrada lead", type: "n8n-nodes-base.webhook",
        typeVersion: 1, position: [240, 300],
      },
      {
        parameters: { jsCode: `// Normalizar lead\nconst data = $input.first().json;\nreturn [{ json: { phone: data.phone || data.telefono || data['WhatsApp'], name: data.name || data.nombre || data.email?.split('@')[0] || 'amig@', email: data.email, user_id: data.user_id || data.email, ...data } }];` },
        id: "n_normalize", name: "Normalizar datos", type: "n8n-nodes-base.code",
        typeVersion: 2, position: [460, 300],
      },
    ];
    const connectionsMap = {
      "Webhook entrada lead": { main: [[{ node: "Normalizar datos", type: "main", index: 0 }]] },
    };
    let x = 680;
    flows.forEach((f, fi) => {
      const sectionNodeName = `${f.label} — inicio`;
      nodes.push({
        parameters: { unit: "seconds", amount: 1 },
        id: `n_wait_${f.key}`, name: sectionNodeName, type: "n8n-nodes-base.wait",
        typeVersion: 1, position: [x, 300 + fi * 40],
      });
      const prevNode = fi === 0 ? "Normalizar datos" : `${flows[fi - 1].label} — inicio`;
      if (!connectionsMap[prevNode]) connectionsMap[prevNode] = { main: [[]] };
      connectionsMap[prevNode].main[0].push({ node: sectionNodeName, type: "main", index: 0 });
      let prev = sectionNodeName;
      f.items.forEach((m, mi) => {
        const mk = `${f.key}:${m.id}`;
        const copy = replaceVars(edits[mk] ?? m.copy, vars);
        const tpl = templatesByMsg[mk];
        const useEvo = f.key === "broadcasts" || f.key === "venta_comunidad";
        const isApproved = approvalByMsg[mk]?.status === "approved";
        const nodeName = `${m.id || `msg_${mi}`}${m._custom ? " ✨" : ""}`;
        const sendNode = useEvo ? {
          parameters: {
            url: "={{ $env.EVOLUTION_URL }}/message/sendText/{{ $env.EVOLUTION_INSTANCE }}",
            method: "POST",
            sendHeaders: true,
            headerParameters: { parameters: [{ name: "apikey", value: "={{ $env.EVOLUTION_API_KEY }}" }] },
            sendBody: true,
            bodyParameters: { parameters: [
              { name: "number", value: "={{ $json.phone }}" },
              { name: "text", value: copy },
            ]},
          },
          type: "n8n-nodes-base.httpRequest",
        } : {
          parameters: {
            url: "=https://graph.facebook.com/v21.0/{{ $env.PHONE_NUMBER_ID }}/messages",
            method: "POST",
            sendHeaders: true,
            headerParameters: { parameters: [{ name: "Authorization", value: "=Bearer {{ $env.WA_ACCESS_TOKEN }}" }] },
            sendBody: true,
            jsonBody: JSON.stringify({
              messaging_product: "whatsapp",
              to: "={{ $json.phone }}",
              type: tpl?.name ? "template" : "text",
              ...(tpl?.name
                ? { template: { name: tpl.name, language: { code: tpl.language || "es" } } }
                : { text: { body: copy } }),
            }),
          },
          type: "n8n-nodes-base.httpRequest",
        };
        nodes.push({
          id: `n_${mk}`, name: nodeName, typeVersion: 4,
          position: [x + 220 + mi * 220, 300 + fi * 40 + (mi % 2) * 60],
          ...sendNode,
          notes: `${useEvo ? "🚀 Evolution" : "📋 Meta"} · ${isApproved ? "✓ aprobado" : "⚠ pendiente"}${m._custom ? " · ✨ CUSTOM" : ""}${tpl?.name ? ` · template:${tpl.name}` : ""}`,
        });
        if (!connectionsMap[prev]) connectionsMap[prev] = { main: [[]] };
        connectionsMap[prev].main[0].push({ node: nodeName, type: "main", index: 0 });
        prev = nodeName;
      });
      x += 200 + f.items.length * 220;
    });
    return {
      name: `WAFLOW · ${project.name}`,
      active: false,
      nodes,
      connections: connectionsMap,
      settings: { executionOrder: "v1" },
      meta: {
        project_id: project.id, project_name: project.name, strategy: project.strategy,
        generated_at: new Date().toISOString(), generated_by: "WAFLOW Autopilot",
        notes: "Env vars necesarias: EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_API_KEY, PHONE_NUMBER_ID, WA_ACCESS_TOKEN.",
      },
    };
  };

  // Generar workflow n8n exportable
  const generateN8nWorkflow = () => {
    setGeneratingWf(true);
    try {
      const workflow = buildWorkflowJson();
      const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `waflow_n8n_${project.name.replace(/\W+/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGeneratingWf(false);
    }
  };

  const openLaunchWizard = () => {
    // 1) Auto-snapshot pre-launch
    const snapshotId = onCreateSnapshot && onCreateSnapshot(`Pre-launch · ${new Date().toLocaleString("es-ES")}`);
    // 2) Build workflow
    const workflowJson = buildWorkflowJson();
    // 3) Open wizard
    setLaunchWizard({ workflowJson, snapshotId });
  };

  const stopLaunch = async () => {
    try {
      await fetch(`${API}/launch/${project.id}/stop`, { method: "POST" });
      setLaunchStatus(s => ({ ...s, launch: { ...s.launch, status: "stopped" } }));
    } catch {}
  };

  const statusPill = (s) => {
    if (s === "ok") return <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">✓ OK</span>;
    if (s === "warn") return <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">⚠ AVISO</span>;
    return <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-semibold">✗ FALTA</span>;
  };
  const isFrozen = project.status === "frozen";

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header con estado general */}
      <div className={`rounded-xl p-6 text-white ${isFrozen ? "bg-gradient-to-br from-slate-700 to-slate-900" : readyPct === 100 ? "bg-gradient-to-br from-emerald-600 to-emerald-800" : "bg-gradient-to-br from-indigo-600 to-violet-800"}`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[11px] uppercase tracking-widest opacity-75">Autopilot del lanzamiento</div>
            <div className="text-2xl font-bold mt-1">{isFrozen ? "🔒 Proyecto congelado" : `${readyPct}% listo para lanzar`}</div>
          </div>
          <div className="text-right text-[11px] opacity-90">
            <div>{okCount}/{checklist.length} checks OK</div>
            {failCount > 0 && <div className="text-amber-200">{failCount} bloqueantes</div>}
          </div>
        </div>
        <div className="bg-white/20 rounded-full h-2 mt-3">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${readyPct}%` }} />
        </div>
      </div>

      {/* Timeline de fases */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-4">Timeline de lanzamiento</div>
        <div className="flex items-stretch gap-0 overflow-x-auto">
          {PHASES.map((p, i) => (
            <React.Fragment key={p.key}>
              <div className={`flex-1 min-w-[150px] rounded-lg p-3 border-2 ${p.done ? "bg-emerald-50 border-emerald-300" : p.active ? "bg-indigo-50 border-indigo-300" : "bg-stone-50 border-stone-200"}`}>
                <div className="text-2xl mb-1">{p.done ? "✅" : p.active ? p.icon : "⏸️"}</div>
                <div className={`text-xs font-bold ${p.done ? "text-emerald-800" : p.active ? "text-indigo-800" : "text-stone-500"}`}>{p.label}</div>
                <div className="text-[10px] text-stone-600 mt-0.5 leading-tight">{p.desc}</div>
              </div>
              {i < PHASES.length - 1 && <div className="flex items-center text-stone-300 text-xl px-1">→</div>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Pre-flight checklist */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-semibold tracking-widest text-stone-500 uppercase">Pre-flight checklist</div>
          <div className="text-[10px] text-stone-500">Click en cualquier item para ir al apartado</div>
        </div>
        <div className="space-y-1.5">
          {checklist.map(c => (
            <button key={c.key} onClick={() => onGoToTab && onGoToTab(c.goTab)}
              data-testid={`autopilot-check-${c.key}`}
              className={`w-full flex items-center gap-3 p-3 rounded-md border text-left transition hover:shadow-sm ${
                c.status === "ok" ? "bg-emerald-50/40 border-emerald-200 hover:border-emerald-400"
                : c.status === "warn" ? "bg-amber-50/40 border-amber-200 hover:border-amber-400"
                : "bg-red-50/40 border-red-200 hover:border-red-400"
              }`}>
              <div className="text-xl">{c.status === "ok" ? "✓" : c.status === "warn" ? "⚠" : "✗"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-stone-900">{c.label}</div>
                <div className="text-[11px] text-stone-600 truncate">{c.detail}</div>
              </div>
              {statusPill(c.status)}
              <ChevronRight size={14} className="text-stone-400" />
            </button>
          ))}
        </div>
      </div>

      {/* Live Launch status */}
      {launchStatus?.active && launchStatus.launch?.status !== "completed" && launchStatus.launch?.status !== "stopped" && (
        <div className="rounded-xl border-2 overflow-hidden" data-testid="live-launch-card"
          style={{ borderColor: launchStatus.delivery_rate >= 95 ? "#059669" : "#DC2626" }}>
          <div className={`px-5 py-3 flex items-center justify-between ${launchStatus.delivery_rate >= 95 ? "bg-emerald-600" : "bg-red-600"} text-white`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full bg-white ${launchStatus.launch?.status === "running" ? "animate-pulse" : ""}`} />
              <div className="text-[11px] uppercase tracking-widest opacity-90">Lanzamiento activo</div>
              <div className="font-bold text-sm">·</div>
              <div className="font-bold text-sm">Launch <code className="font-mono text-[11px]">{launchStatus.launch?.launch_id}</code></div>
            </div>
            <button onClick={stopLaunch} data-testid="launch-stop-btn"
              className="text-[11px] px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-white">
              ⏹ Cancelar
            </button>
          </div>
          <div className="p-5 bg-white">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-stone-50 border border-stone-200 rounded p-3">
                <div className="text-[10px] text-stone-500 uppercase tracking-widest">Enviados</div>
                <div className="text-2xl font-bold text-stone-900">{launchStatus.stats?.sent ?? 0}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <div className="text-[10px] text-emerald-700 uppercase tracking-widest">Entregados</div>
                <div className="text-2xl font-bold text-emerald-800">{launchStatus.stats?.delivered ?? 0}</div>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded p-3">
                <div className="text-[10px] text-sky-700 uppercase tracking-widest">Leídos</div>
                <div className="text-2xl font-bold text-sky-800">{launchStatus.stats?.read ?? 0}</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="text-[10px] text-red-700 uppercase tracking-widest">Fallidos</div>
                <div className="text-2xl font-bold text-red-800">{launchStatus.stats?.failed ?? 0}</div>
              </div>
            </div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-stone-600 font-medium">Tasa de entrega</span>
              <span className="text-stone-900 font-bold">{launchStatus.delivery_rate}%</span>
            </div>
            <div className="bg-stone-200 rounded-full h-2 mb-2">
              <div className={`h-full rounded-full transition-all ${launchStatus.delivery_rate >= 95 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${Math.min(100, launchStatus.delivery_rate)}%` }} />
            </div>
            <div className="text-[10.5px] text-stone-500">
              Polling automático cada 30s · Auto-congelar a ≥ 95% · Último refresh {new Date().toLocaleTimeString("es-ES")}
            </div>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-4">Acciones</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Botón principal Lanzar ahora */}
          <button onClick={openLaunchWizard}
            disabled={readyPct < 100 || project.status === "frozen" || launchStatus?.active}
            data-testid="autopilot-launch-now"
            className="col-span-1 md:col-span-2 flex items-center gap-3 p-4 bg-gradient-to-br from-red-600 to-orange-600 border-2 border-red-700 rounded-lg hover:shadow-lg text-left disabled:opacity-40 disabled:cursor-not-allowed text-white">
            <div className="text-3xl">🚀</div>
            <div className="flex-1">
              <div className="text-base font-bold">Lanzar ahora</div>
              <div className="text-[11.5px] opacity-90">
                {readyPct < 100 ? `Termina el checklist primero (${readyPct}% completado)` :
                 project.status === "frozen" ? "Descongela el proyecto para lanzar" :
                 launchStatus?.active ? "Lanzamiento ya en curso" :
                 "Snapshot automático + deploy a n8n + polling en vivo + auto-freeze al 95%"}
              </div>
            </div>
            <Zap size={20} />
          </button>
          <button onClick={generateN8nWorkflow} disabled={generatingWf}
            data-testid="autopilot-export-n8n"
            className="flex items-center gap-3 p-4 bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg hover:border-purple-400 text-left disabled:opacity-50">
            <div className="text-2xl">🚀</div>
            <div className="flex-1">
              <div className="text-sm font-bold text-purple-900">{generatingWf ? "Generando..." : "Exportar workflow n8n"}</div>
              <div className="text-[11px] text-purple-700">JSON importable en n8n con todos los flujos, templates Meta y nodos Evolution para broadcasts</div>
            </div>
            <Download size={16} className="text-purple-600" />
          </button>

          <button onClick={onCreateSnapshot}
            data-testid="autopilot-snapshot"
            className="flex items-center gap-3 p-4 bg-gradient-to-br from-sky-50 to-cyan-50 border-2 border-sky-200 rounded-lg hover:border-sky-400 text-left">
            <div className="text-2xl">📸</div>
            <div className="flex-1">
              <div className="text-sm font-bold text-sky-900">Crear snapshot de versión</div>
              <div className="text-[11px] text-sky-700">Guardar el estado actual como versión restaurable</div>
            </div>
            <GitCommit size={16} className="text-sky-600" />
          </button>

          <button onClick={() => syncMetaTemplates(false)} disabled={metaSync?.running}
            data-testid="autopilot-sync-meta-templates"
            className="flex items-center gap-3 p-4 bg-gradient-to-br from-sky-50 to-blue-50 border-2 border-sky-300 rounded-lg hover:border-sky-500 text-left disabled:opacity-50">
            <div className="text-2xl">📋</div>
            <div className="flex-1">
              <div className="text-sm font-bold text-sky-900">
                {metaSync?.running ? "Sincronizando..." : "Sincronizar plantillas con Meta"}
              </div>
              <div className="text-[11px] text-sky-700">
                {metaSync?.running
                  ? `${metaSync.done || 0} / ${metaSync.total || 0}`
                  : "Crea/actualiza las plantillas Meta (auto-detecta MARKETING/UTILITY con IA)"}
              </div>
            </div>
            <Cloud size={16} className="text-sky-600" />
          </button>

          {reviewSignature?.token && (
            <a href={`${window.location.origin}/review/${reviewSignature.token}`} target="_blank" rel="noreferrer"
              data-testid="autopilot-open-review"
              className="flex items-center gap-3 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-lg hover:border-emerald-400 text-left">
              <div className="text-2xl">🔗</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-emerald-900">Abrir link mágico cliente</div>
                <div className="text-[11px] text-emerald-700">{reviewSignature.locked ? "🔐 Firmado — modo lectura" : "Enviar al cliente para aprobación"}</div>
              </div>
              <ExternalLink size={16} className="text-emerald-600" />
            </a>
          )}

          {reviewSignature?.token && (
            <a href={`${API}/review/${reviewSignature.token}/summary.pdf`} target="_blank" rel="noreferrer"
              data-testid="autopilot-pdf"
              className="flex items-center gap-3 p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-lg hover:border-amber-400 text-left">
              <div className="text-2xl">📄</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-amber-900">Descargar PDF resumen</div>
                <div className="text-[11px] text-amber-700">Incluye firma digital si el link está cerrado</div>
              </div>
              <Download size={16} className="text-amber-600" />
            </a>
          )}

          <button onClick={onFreezeToggle}
            data-testid="autopilot-freeze"
            className={`flex items-center gap-3 p-4 rounded-lg border-2 text-left transition ${
              isFrozen ? "bg-gradient-to-br from-slate-50 to-gray-50 border-slate-300 hover:border-slate-500"
                       : "bg-gradient-to-br from-red-50 to-rose-50 border-red-200 hover:border-red-400"
            }`}>
            <div className="text-2xl">{isFrozen ? "🔓" : "🔒"}</div>
            <div className="flex-1">
              <div className={`text-sm font-bold ${isFrozen ? "text-slate-900" : "text-red-900"}`}>
                {isFrozen ? "Descongelar proyecto" : "Congelar proyecto"}
              </div>
              <div className={`text-[11px] ${isFrozen ? "text-slate-600" : "text-red-700"}`}>
                {isFrozen ? "Permitir edición de mensajes, variables y estructura" : "Read-only: nadie del equipo podrá editar copies, vars, ni estructura"}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Snapshots recientes */}
      {snapshots?.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3">Últimos snapshots</div>
          <div className="space-y-1.5">
            {snapshots.slice(0, 3).map(s => (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded border border-stone-200 bg-stone-50">
                <GitCommit size={12} className="text-stone-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-stone-900 truncate">{s.label || "Sin etiqueta"}</div>
                  <div className="text-[10px] text-stone-500">{s.author || "—"} · {s.created_at ? new Date(s.created_at).toLocaleString("es-ES") : "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Launch Wizard modal */}
      {launchWizard && (
        <LaunchWizard
          project={project}
          connections={connections}
          workflowJson={launchWizard.workflowJson}
          snapshotId={launchWizard.snapshotId}
          onDeployed={() => { /* polling empezará al próximo ciclo */ }}
          onClose={() => setLaunchWizard(null)}
        />
      )}

      {/* Meta Templates Sync result modal */}
      {metaSync && !metaSync.running && (metaSync.results || metaSync.error) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setMetaSync(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} data-testid="meta-sync-result-modal">
            <div className="px-6 py-4 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-sky-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-2xl">📋</div>
                  <div>
                    <div className="text-base font-bold text-sky-900">Sincronización con Meta</div>
                    {metaSync.summary && (
                      <div className="text-[11.5px] text-sky-700">
                        ✓ {metaSync.summary.created} creadas · ⏭ {metaSync.summary.skipped} saltadas · ✗ {metaSync.summary.failed} errores
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => setMetaSync(null)} className="text-stone-500 hover:text-stone-900">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {metaSync.error && (
                <div className="text-red-800 bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
                  <strong>Error:</strong> {metaSync.error}
                </div>
              )}
              {metaSync.results && (
                <div className="space-y-2">
                  {metaSync.results.map((r, i) => (
                    <div key={`meta-res-${i}-${r.msg_key}`}
                      className={`flex items-start gap-3 p-3 rounded-md border ${
                        r.status === "created" ? "bg-emerald-50 border-emerald-200"
                        : r.status === "skipped" ? "bg-stone-50 border-stone-200"
                        : "bg-red-50 border-red-200"
                      }`}>
                      <div className="text-lg">
                        {r.status === "created" ? "✓" : r.status === "skipped" ? "⏭" : "✗"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-mono font-semibold text-stone-900 truncate">{r.template_name}</div>
                        <div className="text-[10.5px] text-stone-600">
                          {r.msg_key}
                          {r.category && <span className="ml-2 text-sky-700">· {r.category}</span>}
                          {r.meta_status && <span className="ml-2 text-amber-700">· {r.meta_status}</span>}
                        </div>
                        {r.reason && <div className="text-[10.5px] text-stone-500 mt-0.5">{r.reason}</div>}
                        {r.error && <div className="text-[10.5px] text-red-700 mt-0.5"><strong>Error Meta:</strong> {r.error}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-2 flex-wrap">
              <button onClick={refreshMetaTemplateStatus}
                data-testid="meta-refresh-status-btn"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-stone-300 rounded-md hover:bg-stone-100">
                🔄 Refrescar estado desde Meta
              </button>
              {metaSync.summary?.skipped > 0 && !metaSync.forceReplace && (
                <button onClick={() => { setMetaSync(null); syncMetaTemplates(true); }}
                  data-testid="meta-force-replace-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700">
                  ⚠ Forzar reemplazo de las {metaSync.summary.skipped} saltadas
                </button>
              )}
              <button onClick={() => setMetaSync(null)} className="px-4 py-1.5 text-sm font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meta Templates Sync running progress */}
      {metaSync?.running && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" data-testid="meta-sync-progress-modal">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center">
            <div className="text-3xl mb-2">📋</div>
            <div className="text-sm font-bold text-stone-900 mb-1">Sincronizando plantillas con Meta</div>
            <div className="text-[12px] text-stone-600 mb-4">Categorizando con IA, convirtiendo variables y creando plantillas en tu WABA. Puede tardar 20-60 segundos…</div>
            <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-sky-600 animate-pulse" style={{ width: "65%" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ====================================================================
// PROMPT IA
// ====================================================================
function AIPromptPanel({ aiPrompt, setAIPrompt, vars }) {
  const [preview, setPreview] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]); // [{role:'user'|'assistant', text}]
  const [input, setInput] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [sessionId] = useState(() => "test_" + Math.random().toString(36).slice(2, 10));
  const rendered = replaceVars(aiPrompt, vars);

  const send = async () => {
    if (!input.trim() || loadingChat) return;
    const userMsg = { role: "user", text: input.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoadingChat(true);
    try {
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/ai/test-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_prompt: rendered,
          messages: nextMessages,
          session_id: sessionId,
          model_provider: "anthropic",
          model_name: "claude-sonnet-4-5-20250929",
        }),
      });
      const data = await r.json();
      if (data.ok && data.response) {
        setMessages(m => [...m, { role: "assistant", text: data.response }]);
      } else {
        setMessages(m => [...m, { role: "assistant", text: "⚠️ Error: " + (data.detail || "respuesta vacía") }]);
      }
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", text: "⚠️ Error de red: " + String(e) }]);
    } finally {
      setLoadingChat(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Prompt del asistente IA</h2>
        <p className="text-xs text-stone-500 mt-0.5">System prompt para nodo IA en n8n (o probado aquí mismo con Claude Sonnet 4.5 vía Emergent LLM key)</p>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <button onClick={() => setPreview(false)} className={`px-3 py-1.5 text-xs font-medium rounded-md border ${!preview ? "bg-stone-900 text-white border-stone-900" : "bg-white border-stone-200"}`}>Editar</button>
          <button onClick={() => setPreview(true)} className={`px-3 py-1.5 text-xs font-medium rounded-md border ${preview ? "bg-stone-900 text-white border-stone-900" : "bg-white border-stone-200"}`}>Preview</button>
          <button onClick={() => setShowChat(v => !v)} data-testid="ai-toggle-chat-btn"
            className={`px-3 py-1.5 text-xs font-medium rounded-md border ${showChat ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-50"}`}>
            🧪 {showChat ? "Ocultar chat de prueba" : "Probar prompt"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-stone-500">{aiPrompt.length} chars</span>
          <button onClick={() => setAIPrompt(DEFAULT_AI_PROMPT)} className="text-[11px] text-stone-500 hover:text-stone-900">↺ Restaurar</button>
          <CopyButton text={preview ? rendered : aiPrompt} />
        </div>
      </div>
      {preview ? (
        <div className="bg-white border border-stone-200 rounded-lg p-5 text-sm text-stone-800 whitespace-pre-wrap leading-relaxed font-mono">{rendered}</div>
      ) : (
        <textarea value={aiPrompt} onChange={e => setAIPrompt(e.target.value)}
          className="w-full min-h-[400px] p-5 text-sm font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900 leading-relaxed" />
      )}

      {showChat && (
        <div className="bg-white border-2 border-indigo-200 rounded-lg overflow-hidden" data-testid="ai-test-chat-panel">
          <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-indigo-700" />
              <div className="text-sm font-semibold text-indigo-900">Chat de prueba · Claude Sonnet 4.5</div>
            </div>
            <div className="flex items-center gap-3">
              <span
                data-testid="ai-llm-usage-badge"
                title="Cada mensaje consume créditos del Emergent LLM key (Profile → Universal Key → Add Balance para recargar)"
                className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full border ${
                  messages.filter(m => m.role === "user").length >= 20
                    ? "bg-red-50 border-red-200 text-red-800"
                    : messages.filter(m => m.role === "user").length >= 10
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-indigo-50 border-indigo-200 text-indigo-700"
                }`}
              >
                💳 {messages.filter(m => m.role === "user").length} mensajes · créditos Emergent LLM
              </span>
              <button onClick={() => setMessages([])} className="text-[11px] text-stone-600 hover:text-stone-900">Limpiar</button>
            </div>
          </div>
          <div className="p-3 max-h-[350px] overflow-y-auto space-y-2 bg-stone-50">
            {messages.length === 0 && (
              <div className="text-[12px] text-stone-500 text-center py-6">
                Escribe un mensaje como si fueras un lead para ver cómo respondería la IA con tu prompt actual.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={`chatmsg-${i}-${m.role}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 text-[13px] whitespace-pre-wrap ${
                  m.role === "user" ? "bg-emerald-600 text-white" : "bg-white border border-stone-200 text-stone-800"
                }`}>{m.text}</div>
              </div>
            ))}
            {loadingChat && <div className="text-[11px] text-stone-500 italic pl-2">Claude está pensando...</div>}
          </div>
          <div className="p-3 border-t border-stone-200 flex items-center gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
              data-testid="ai-test-chat-input"
              placeholder="Escribe un mensaje como lead (ej: 'hola, ¿cuándo es el webinar?')"
              className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900" />
            <button onClick={send} disabled={loadingChat || !input.trim()}
              data-testid="ai-test-chat-send"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
              <Send size={13} /> {loadingChat ? "..." : "Enviar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ====================================================================
// MÓDULO CAPTACIÓN — configurador multi-plataforma + generador n8n
// ====================================================================

const PLATFORMS = {
  mailerlite: {
    key: "mailerlite",
    label: "MailerLite",
    color: "#09C269",
    webhookPath: "Automation → Webhook (Action) o API → Webhooks",
    docUrl: "https://www.mailerlite.com/help/how-to-use-webhooks",
    fields: ["email", "name", "fields.phone"],
    payloadExample: `{
  "type": "subscriber.created",
  "data": {
    "subscriber": {
      "email": "lead@ejemplo.com",
      "name": "Juan",
      "fields": { "phone": "+34612345678" }
    }
  }
}`,
  },
  activecampaign: {
    key: "activecampaign",
    label: "ActiveCampaign",
    color: "#356AE6",
    webhookPath: "Settings → Developer → Webhooks",
    docUrl: "https://help.activecampaign.com/hc/en-us/articles/360000030559",
    fields: ["contact[email]", "contact[first_name]", "contact[phone]"],
    payloadExample: `{
  "contact[email]": "lead@ejemplo.com",
  "contact[first_name]": "Juan",
  "contact[phone]": "+34612345678",
  "type": "subscribe"
}`,
  },
  ghl: {
    key: "ghl",
    label: "GoHighLevel",
    color: "#FF6B2B",
    webhookPath: "Settings → Integrations → Webhooks",
    docUrl: "https://help.gohighlevel.com/support/solutions/articles/48001208148",
    fields: ["email", "firstName", "phone"],
    payloadExample: `{
  "type": "ContactCreate",
  "email": "lead@ejemplo.com",
  "firstName": "Juan",
  "phone": "+34612345678"
}`,
  },
  kajabi: {
    key: "kajabi",
    label: "Kajabi",
    color: "#412ED3",
    webhookPath: "Settings → Developer → Webhooks",
    docUrl: "https://help.kajabi.com/hc/en-us/articles/360029495091",
    fields: ["member.email", "member.name", "member.phone"],
    payloadExample: `{
  "event": "member.subscribed",
  "member": {
    "email": "lead@ejemplo.com",
    "name": "Juan García",
    "phone": "+34612345678"
  }
}`,
  },
  systeme: {
    key: "systeme",
    label: "Systeme.io",
    color: "#1ABCFE",
    webhookPath: "Automation → Rules → Webhook",
    docUrl: "https://systeme.io/help/articles/webhook",
    fields: ["contact.email", "contact.first_name", "contact.phone_number"],
    payloadExample: `{
  "event": "opt_in",
  "contact": {
    "email": "lead@ejemplo.com",
    "first_name": "Juan",
    "phone_number": "+34612345678"
  }
}`,
  },
  custom: {
    key: "custom",
    label: "Otra / Custom",
    color: "#64748B",
    webhookPath: "Configura tu plataforma para enviar un POST a la URL del webhook de n8n",
    docUrl: "",
    fields: ["email", "name", "phone"],
    payloadExample: `{
  "email": "lead@ejemplo.com",
  "name": "Juan García",
  "phone": "+34612345678"
}`,
  },
};

// Genera el JSON del workflow de n8n para la captación
function generateN8nCaptureWorkflow(platform, config) {
  const plat = PLATFORMS[platform] || PLATFORMS.custom;
  const whatsappNum = (config.whatsappNumber || "34600000000").replace(/\D/g, "");
  const webhookUrl = config.n8nWebhookUrl || "https://tu-n8n.com/webhook/registro";
  const hasPhone = config.formHasPhone;

  const nodes = [
    {
      id: "node_webhook_registro",
      name: "📥 Webhook Registro",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [240, 300],
      parameters: {
        httpMethod: "POST",
        path: "registro-webinar",
        responseMode: "onReceived",
        responseData: "allEntries",
      },
      notes: `PEGA ESTA URL EN ${plat.label.toUpperCase()}\n\nRuta: ${plat.webhookPath}\n\nEsta URL es el punto de entrada. Cada vez que alguien se registre en tu formulario, ${plat.label} enviará un POST aquí con los datos del lead.`,
    },
    {
      id: "node_extract",
      name: "🔧 Extraer y normalizar datos",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
      parameters: {
        jsCode: `// Normaliza el payload de ${plat.label}
// Adapta los campos según el payload real de tu plataforma
const body = $input.first().json;

// Extracción según plataforma
${platform === "mailerlite" ? `const email = body?.data?.subscriber?.email || body?.email || "";
const name = body?.data?.subscriber?.name || body?.name || "";
const phone = body?.data?.subscriber?.fields?.phone || body?.phone || "";` : ""}
${platform === "activecampaign" ? `const email = body["contact[email]"] || body?.email || "";
const name = body["contact[first_name]"] || body?.name || "";
const phone = body["contact[phone]"] || body?.phone || "";` : ""}
${platform === "ghl" ? `const email = body?.email || "";
const name = body?.firstName || body?.name || "";
const phone = body?.phone || "";` : ""}
${platform === "kajabi" ? `const email = body?.member?.email || body?.email || "";
const name = body?.member?.name || body?.name || "";
const phone = body?.member?.phone || body?.phone || "";` : ""}
${platform === "systeme" ? `const email = body?.contact?.email || body?.email || "";
const name = body?.contact?.first_name || body?.name || "";
const phone = body?.contact?.phone_number || body?.phone || "";` : ""}
${platform === "custom" ? `const email = body?.email || "";
const name = body?.name || body?.first_name || "";
const phone = body?.phone || body?.telefono || "";` : ""}

// Limpiar teléfono (quitar espacios, guiones, pero mantener el +)
const cleanPhone = phone.replace(/[\\s\\-\\.\\(\\)]/g, "");

// Generar user_id único
const userId = "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

// Generar token corto para cruzar con WhatsApp si no hay teléfono
const regToken = "REG_" + Math.random().toString(36).slice(2,7).toUpperCase();

return [{
  json: {
    user_id: userId,
    email,
    name,
    phone: cleanPhone,
    has_phone: cleanPhone.length > 6,
    reg_token: regToken,
    source: "${platform}",
    registered_at: new Date().toISOString(),
    webinar_date: "${config.webinarDate || "2026-04-15"}",
  }
}];`,
      },
      notes: `Normaliza los datos del lead independientemente de la plataforma.\n\nGenera dos cosas importantes:\n- user_id: identificador único para tracking de toda la secuencia\n- reg_token: código corto para cruzar con WhatsApp cuando el lead NO aportó teléfono en el registro`,
    },
    {
      id: "node_save_contact",
      name: "💾 Guardar contacto",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [720, 300],
      parameters: {
        jsCode: `// Guarda el contacto en el Store estático de n8n
// En producción, sustituye por Airtable, Google Sheets o tu base de datos
const contact = $input.first().json;

// Leer store actual
const store = $getWorkflowStaticData("global");
if (!store.contacts) store.contacts = {};

// Guardar por token (para cruce sin teléfono)
store.contacts[contact.reg_token] = contact;

// Si tiene teléfono, guardar también por teléfono (para cruce directo)
if (contact.has_phone) {
  store.contacts[contact.phone] = contact;
}

console.log("Contacto guardado:", contact.email, "| Token:", contact.reg_token);
return [$input.first()];`,
      },
      notes: `Guarda el contacto en el store de n8n.\n\n⚠️ Para producción real con más de 500 contactos, sustituye este nodo por:\n- Airtable: nodo "Airtable" → Create Record\n- Google Sheets: nodo "Google Sheets" → Append Row\n- Base de datos propia: nodo "Postgres" o "MySQL"\n\nEl store de n8n es suficiente para pruebas y lanzamientos pequeños.`,
    },
    {
      id: "node_has_phone",
      name: "📱 ¿Tiene teléfono?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [960, 300],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [{ leftValue: "={{ $json.has_phone }}", rightValue: true, operator: { type: "boolean", operation: "equal" } }],
        },
      },
      notes: `Bifurcación crítica:\n\n✅ SÍ tiene teléfono (formulario lo pidió) → activa la secuencia WhatsApp directamente\n\n❌ NO tiene teléfono → envía email con botón de WhatsApp y espera a que el lead escriba`,
    },
    {
      id: "node_activate_flow",
      name: "🚀 Activar Flujo A (con teléfono)",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1200, 180],
      parameters: {
        jsCode: `// El lead ya tiene teléfono → activar secuencia WhatsApp inmediatamente
const contact = $input.first().json;

// Aquí conectarías al workflow "Flujo A - WhatsApp"
// mediante un nodo "Execute Workflow" o un HTTP Request al webhook del flujo

console.log("Activando Flujo A para:", contact.phone, contact.name);
return [$input.first()];`,
      },
      notes: `Activa la secuencia de WhatsApp directamente porque ya tienes el número.\n\nConecta este nodo con tu workflow de "Flujo A" usando:\n- Nodo "Execute Workflow" → selecciona el workflow del Flujo A\n- O un HTTP Request al webhook del Flujo A\n\nPasa como parámetros: phone, name, user_id, registered_at`,
    },
    {
      id: "node_send_email",
      name: "📧 Email → botón WhatsApp",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1200, 420],
      parameters: {
        jsCode: `// El lead NO tiene teléfono → enviar email con botón de WhatsApp
const contact = $input.first().json;
const waNum = "${whatsappNum}";
const waText = encodeURIComponent("Hola, confirmo mi plaza REG_" + contact.reg_token);
const waLink = \`https://wa.me/\${waNum}?text=\${waText}\`;

// Aquí conectarías al nodo de email de tu plataforma
// (MailerLite, AC, GHL, SMTP, etc.)

const emailPayload = {
  to: contact.email,
  subject: "✅ ¡Plaza confirmada! Un último paso...",
  html: \`
    <h2>Hola \${contact.name}! 👋</h2>
    <p>Tu plaza para el webinar está reservada.</p>
    <p><strong>Para recibir el link de la sala directamente en WhatsApp</strong>, 
       pulsa el botón de abajo:</p>
    <a href="\${waLink}" 
       style="display:inline-block;background:#25D366;color:white;
              padding:14px 28px;border-radius:8px;text-decoration:none;
              font-weight:bold;font-size:16px;">
      📱 Confirmar por WhatsApp
    </a>
    <p style="color:#666;font-size:13px;margin-top:20px;">
      Si no puedes ahora, guarda este email. El link sigue funcionando.
    </p>
  \`,
  reg_token: contact.reg_token,
  wa_link: waLink,
};

return [{ json: { ...contact, email_payload: emailPayload } }];`,
      },
      notes: `Genera el email de confirmación con el botón de WhatsApp.\n\nEl texto pre-rellenado del botón incluye el reg_token para que cuando el lead escriba, el workflow receptor pueda cruzarlo con sus datos.\n\nDespués de este nodo, conecta el nodo de tu plataforma de email:\n- Nodo "MailerLite" → Send Email\n- Nodo "ActiveCampaign" → Add Contact to Campaign\n- Nodo "SMTP" → Send Email\n- Nodo "HTTP Request" → API de tu plataforma`,
    },
  ];

  // Nodo receptor del mensaje de WhatsApp (workflow separado)
  const waReceiverNodes = [
    {
      id: "wa_webhook",
      name: "📲 Webhook WhatsApp (Evolution/Meta)",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [240, 300],
      parameters: { httpMethod: "POST", path: "whatsapp-incoming", responseMode: "onReceived" },
      notes: `Recibe todos los mensajes entrantes de WhatsApp.\n\nSi usas Evolution API: configura el webhook en la instancia\nSi usas Meta Cloud API directamente: configura en Meta Business Suite → WhatsApp → Configuration → Webhook\n\nURL a pegar: {TU_N8N_URL}/webhook/whatsapp-incoming`,
    },
    {
      id: "wa_extract",
      name: "🔧 Extraer mensaje y remitente",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
      parameters: {
        jsCode: `// Normaliza el mensaje entrante (compatible Evolution API y Meta Cloud API)
const body = $input.first().json;

// Evolution API
let from = body?.data?.key?.remoteJid?.replace("@s.whatsapp.net","") 
           || body?.from || "";
let text = body?.data?.message?.conversation 
           || body?.data?.message?.extendedTextMessage?.text 
           || body?.text || "";

// Meta Cloud API (formato alternativo)
if (!from && body?.entry) {
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  from = msg?.from || "";
  text = msg?.text?.body || "";
}

// Limpiar número (añadir + si no lo tiene)
if (from && !from.startsWith("+")) from = "+" + from;

// Detectar si el mensaje contiene un token de registro
const tokenMatch = text.match(/REG_([A-Z0-9]{5})/);
const regToken = tokenMatch ? "REG_" + tokenMatch[1] : null;

return [{
  json: {
    from_phone: from,
    message_text: text.trim(),
    reg_token: regToken,
    has_token: !!regToken,
    received_at: new Date().toISOString(),
  }
}];`,
      },
      notes: `Compatible con Evolution API (el wrapper que usáis con n8n) y Meta Cloud API directa.\n\nDetecta automáticamente si el mensaje contiene un reg_token (lead que llegó por email) o no (lead que llegó directo desde la página de gracias).`,
    },
    {
      id: "wa_resolve",
      name: "🔍 Resolver contacto",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [720, 300],
      parameters: {
        jsCode: `// Busca el contacto por teléfono o por reg_token
const incoming = $input.first().json;
const store = $getWorkflowStaticData("global");
const contacts = store.contacts || {};

let contact = null;

// Primero intenta por teléfono directo
if (incoming.from_phone && contacts[incoming.from_phone]) {
  contact = contacts[incoming.from_phone];
  console.log("Contacto encontrado por teléfono:", contact.email);
}

// Si no, intenta por reg_token (vino del email)
if (!contact && incoming.reg_token && contacts[incoming.reg_token]) {
  contact = contacts[incoming.reg_token];
  // Actualizar el contacto con el teléfono ahora que lo tenemos
  contact.phone = incoming.from_phone;
  contact.has_phone = true;
  store.contacts[incoming.from_phone] = contact; // guardar por teléfono también
  console.log("Contacto encontrado por token:", contact.email);
}

// Si no encontramos nada: lead nuevo (escribió directamente sin registrarse)
if (!contact) {
  contact = {
    user_id: "u_" + Date.now().toString(36),
    email: "",
    name: "",
    phone: incoming.from_phone,
    has_phone: true,
    source: "direct_whatsapp",
    registered_at: new Date().toISOString(),
    is_new: true,
  };
  console.log("Lead nuevo (directo por WA):", incoming.from_phone);
}

return [{ json: { ...incoming, contact } }];`,
      },
      notes: `Cruza el número entrante con los contactos registrados.\n\nTres casos:\n1. Lead que dio teléfono en el formulario → match por teléfono\n2. Lead que llegó por email → match por reg_token, y guardamos su teléfono\n3. Lead nuevo que escribió directamente → creamos contacto mínimo\n\nEn los tres casos la secuencia continúa. El Flujo A se activa con los datos que tengamos.`,
    },
    {
      id: "wa_activate_flow_a",
      name: "🚀 Activar Flujo A",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [960, 300],
      parameters: {
        jsCode: `const { contact, from_phone, message_text } = $input.first().json;

// Aquí activas el workflow del Flujo A
// Pasa los datos del contacto para que el flujo pueda personalizar los mensajes

const flowAPayload = {
  phone: from_phone,
  name: contact.name || "amigo/a",
  email: contact.email || "",
  user_id: contact.user_id,
  registered_at: contact.registered_at,
  source: contact.source,
  first_message: message_text,
};

console.log("Activando Flujo A:", JSON.stringify(flowAPayload));
return [{ json: flowAPayload }];`,
      },
      notes: `Punto de entrada al Flujo A.\n\nDespués de este nodo conecta el workflow completo de la secuencia de mensajes (Flujo A del editor). Los datos que se pasan aquí son los que n8n usará para sustituir las variables {NOMBRE}, {USER_ID}, etc. en cada mensaje.`,
    },
  ];

  return {
    registration_workflow: {
      name: `[WA Editor] Captación Registro — ${plat.label}`,
      nodes: nodes,
      explanation: {
        overview: `Workflow de captación para ${plat.label}. Recibe el registro, normaliza los datos, detecta si hay teléfono o no, y activa la secuencia correspondiente.`,
        nodes: nodes.map(n => ({ name: n.name, purpose: n.notes?.split("\n")[0] || "" })),
        setup_steps: [
          `1. Importa este JSON en n8n (Settings → Import Workflow)`,
          `2. Activa el workflow y copia la URL del nodo "Webhook Registro"`,
          `3. Pega esa URL en ${plat.label}: ${plat.webhookPath}`,
          `4. Si el formulario NO pide teléfono, configura el nodo de email con tu plataforma`,
          `5. Conecta el nodo final con tu workflow del Flujo A`,
          `6. Haz un registro de prueba y verifica los logs`,
        ],
      },
    },
    wa_receiver_workflow: {
      name: `[WA Editor] Receptor WhatsApp — Resolver contacto`,
      nodes: waReceiverNodes,
      explanation: {
        overview: `Workflow que recibe todos los mensajes entrantes de WhatsApp, resuelve a qué contacto corresponde, y activa el Flujo A con los datos completos del lead.`,
        nodes: waReceiverNodes.map(n => ({ name: n.name, purpose: n.notes?.split("\n")[0] || "" })),
        setup_steps: [
          `1. Importa este JSON en n8n`,
          `2. Copia la URL del nodo "Webhook WhatsApp"`,
          `3. Pégala en Evolution API: Settings → Webhook de tu instancia`,
          `4. O en Meta Cloud API: Business Suite → WhatsApp → Webhook`,
          `5. Asegúrate de que el store de n8n es compartido con el workflow de captación`,
          `6. Envía un mensaje de prueba y verifica el log`,
        ],
      },
    },
    thank_you_snippet: `<!-- SNIPPET PÁGINA DE GRACIAS -->
<!-- Pega esto en tu página de gracias post-registro -->
<!-- El {REG_TOKEN} lo sustituye n8n antes de redirigir, o lo pones como parámetro en la URL -->

<div style="text-align:center;padding:40px 20px;font-family:sans-serif;">
  <h2>✅ ¡Ya estás dentro!</h2>
  <p>Para recibir el link de la sala directo en WhatsApp<br>
     (y no perderte nada del evento), haz clic aquí:</p>
  <a href="https://wa.me/${whatsappNum}?text=Confirmo+mi+plaza+REG_TOKEN_AQUI"
     style="display:inline-block;background:#25D366;color:white;
            padding:16px 32px;border-radius:12px;text-decoration:none;
            font-size:18px;font-weight:bold;margin:20px 0;">
    📱 Confirmar plaza por WhatsApp
  </a>
  <p style="color:#888;font-size:13px;">
    También te hemos enviado un email de confirmación con este mismo enlace.
  </p>
</div>`,
  };
}

// Componente principal de Captación
function CaptacionPanel({ config, setConfig, projectName, n8nWebhookUrl }) {
  const [activeSection, setActiveSection] = useState("config");
  const [generatedWorkflows, setGeneratedWorkflows] = useState(null);
  const [copyStates, setCopyStates] = useState({});

  const update = (k, v) => setConfig(prev => ({ ...prev, [k]: v }));

  const generate = () => {
    if (!config.platform) { alert("Selecciona una plataforma primero"); return; }
    const wf = generateN8nCaptureWorkflow(config.platform, {
      whatsappNumber: config.whatsappNumber || "34600000000",
      n8nWebhookUrl: n8nWebhookUrl || "https://tu-n8n.com",
      formHasPhone: config.formHasPhone,
      webinarDate: config.webinarDate || "2026-04-15",
    });
    setGeneratedWorkflows(wf);
    setActiveSection("workflows");
  };

  const downloadJSON = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadHTML = (html, filename) => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const copyText = async (text, key) => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); document.body.removeChild(t); }
    setCopyStates(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopyStates(p => ({ ...p, [key]: false })), 1400);
  };

  const plat = PLATFORMS[config.platform];

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Configuración de captación</h2>
        <p className="text-xs text-stone-500 mt-0.5">Define cómo capta el número tu cliente → genera los workflows de n8n listos para importar</p>
      </div>

      {/* Tabs internos */}
      <div className="flex gap-1 border-b border-stone-200 pb-px">
        {[
          { key: "config", label: "1. Configurar" },
          { key: "workflows", label: "2. Workflows n8n" },
          { key: "snippets", label: "3. Snippets web/email" },
          { key: "test", label: "4. Probar" },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveSection(t.key)}
            className={`px-3 py-2 text-xs font-medium rounded-t-md transition ${activeSection === t.key ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeSection === "config" && (
        <div className="space-y-5">
          {/* Plataforma */}
          <div>
            <label className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest">Plataforma de registro del cliente</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {Object.values(PLATFORMS).map(p => (
                <button key={p.key} onClick={() => update("platform", p.key)}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-left transition ${config.platform === p.key ? "border-stone-900 bg-stone-50" : "border-stone-200 hover:border-stone-400"}`}>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-medium text-stone-900">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Teléfono en formulario */}
          <div>
            <label className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest">¿El formulario de registro pide el teléfono?</label>
            <div className="flex gap-2 mt-2">
              {[
                { v: true, label: "✅ Sí pide teléfono", sub: "Secuencia directa, no necesita cruce" },
                { v: false, label: "❌ No pide teléfono", sub: "Se usa reg_token + email con botón WA" },
              ].map(opt => (
                <button key={String(opt.v)} onClick={() => update("formHasPhone", opt.v)}
                  className={`flex-1 p-3 rounded-lg border text-left transition ${config.formHasPhone === opt.v ? "border-stone-900 bg-stone-50" : "border-stone-200 hover:border-stone-400"}`}>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Datos técnicos */}
          <div className="bg-white border border-stone-200 rounded-lg p-4 space-y-3">
            <div className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest">Datos del proyecto</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número de WhatsApp (sin +, con prefijo)" value={config.whatsappNumber} onChange={v => update("whatsappNumber", v)} placeholder="34612345678" mono />
              <Field label="Fecha del webinar" value={config.webinarDate} onChange={v => update("webinarDate", v)} placeholder="2026-04-15" mono />
            </div>
          </div>

          {/* Diagrama del flujo según configuración */}
          {config.platform && (
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
              <div className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest mb-3">Flujo de captación configurado</div>
              <div className="flex items-start gap-2 text-xs flex-wrap">
                {[
                  { label: `Registro en ${plat?.label || "?"}`, color: plat?.color || "#64748B" },
                  { label: "→" },
                  { label: "Webhook a n8n", color: "#EA4B71" },
                  { label: "→" },
                  { label: "Guardar contacto", color: "#6366F1" },
                  { label: "→" },
                  config.formHasPhone === true
                    ? { label: "Activar Flujo A directo", color: "#25D366" }
                    : { label: "Email con botón WA", color: "#F59E0B" },
                  ...(config.formHasPhone === false ? [
                    { label: "→" },
                    { label: "Lead escribe → Cruzar token", color: "#0EA5E9" },
                    { label: "→" },
                    { label: "Activar Flujo A", color: "#25D366" },
                  ] : []),
                ].map((step, i) => (
                  step.label === "→"
                    ? <span key={`arrow-${i}`} className="text-stone-400 self-center">→</span>
                    : <span key={`step-${step.label}-${i}`} className="px-2 py-1 rounded-md text-white text-[10px] font-medium" style={{ backgroundColor: step.color }}>{step.label}</span>
                ))}
              </div>
              {config.formHasPhone === false && (
                <div className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  ⚠️ <strong>Recuerda:</strong> no todos los leads harán clic en el botón de WA. Incluye el botón también en los emails de seguimiento D-7 y D-5 para maximizar la captación de números.
                </div>
              )}
            </div>
          )}

          <button onClick={generate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700">
            <Zap size={14} /> Generar workflows de n8n
          </button>
        </div>
      )}

      {activeSection === "workflows" && generatedWorkflows && (
        <div className="space-y-5">
          {[
            { wf: generatedWorkflows.registration_workflow, filename: `n8n_captacion_${config.platform}.json`, icon: "📥", label: "Workflow 1: Captación de registro" },
            { wf: generatedWorkflows.wa_receiver_workflow, filename: `n8n_receptor_whatsapp.json`, icon: "📲", label: "Workflow 2: Receptor WhatsApp" },
          ].map((item, idx) => (
            <div key={item.filename} className="bg-white border border-stone-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-stone-900">{item.icon} {item.label}</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">{item.wf.explanation.overview}</div>
                </div>
                <button onClick={() => downloadJSON(item.wf, item.filename)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700 shrink-0">
                  <Download size={12} /> Descargar JSON
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <div className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest mb-2">Pasos para implementar</div>
                  <ol className="space-y-1.5">
                    {item.wf.explanation.setup_steps.map((step, i) => (
                      <li key={`setup-${item.filename}-${i}`} className="text-[12px] text-stone-700 flex items-start gap-2">
                        <span className="font-mono text-[10px] bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{i + 1}</span>
                        {step.replace(/^\d+\.\s/, "")}
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest mb-2">Nodos del workflow</div>
                  <div className="space-y-2">
                    {item.wf.explanation.nodes.map((n, i) => (
                      <div key={`node-${item.filename}-${n.name}-${i}`} className="flex items-start gap-2 text-[12px]">
                        <span className="w-5 h-5 rounded bg-stone-100 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                        <div>
                          <span className="font-medium text-stone-900">{n.name}</span>
                          {n.purpose && <span className="text-stone-500 ml-1">· {n.purpose}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Preview del JSON */}
                <details className="group">
                  <summary className="text-[11px] font-medium text-stone-600 cursor-pointer hover:text-stone-900">Ver JSON completo ↓</summary>
                  <pre className="mt-2 text-[10px] bg-stone-50 border border-stone-200 rounded p-3 overflow-auto max-h-64 font-mono text-stone-700">
                    {JSON.stringify(item.wf, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === "workflows" && !generatedWorkflows && (
        <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center">
          <Zap size={24} className="mx-auto text-stone-400" />
          <div className="text-sm text-stone-600 mt-2">Configura la plataforma en el paso 1 y pulsa "Generar workflows"</div>
        </div>
      )}

      {activeSection === "snippets" && generatedWorkflows && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-stone-900">🌐 Snippet — Página de gracias</div>
                <div className="text-[11px] text-stone-500 mt-0.5">Pega este bloque HTML en tu página de gracias post-registro</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => copyText(generatedWorkflows.thank_you_snippet, "html")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition ${copyStates.html ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white border-stone-300 hover:border-stone-900"}`}>
                  {copyStates.html ? <Check size={12} /> : <Copy size={12} />} {copyStates.html ? "Copiado" : "Copiar"}
                </button>
                <button onClick={() => downloadHTML(generatedWorkflows.thank_you_snippet, "pagina_gracias_wa_button.html")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md">
                  <Download size={12} /> Descargar HTML
                </button>
              </div>
            </div>
            <pre className="p-5 text-[11px] font-mono text-stone-700 bg-stone-50 overflow-auto max-h-80">
              {generatedWorkflows.thank_you_snippet}
            </pre>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="text-[11px] font-semibold text-amber-900 uppercase tracking-widest mb-2">⚠️ Importante antes de publicar</div>
            <ul className="text-[12px] text-amber-900 space-y-1 list-disc list-inside">
              <li>Sustituye <code className="bg-white px-1 rounded font-mono">REG_TOKEN_AQUI</code> por el token dinámico que genera n8n (pásalo como parámetro en la URL de redirección: <code className="bg-white px-1 rounded font-mono">?token=REG_XXXXX</code>)</li>
              <li>Prueba el link de WA en móvil antes de lanzar</li>
              <li>Añade el mismo botón en el email de confirmación automática como plan B</li>
              {!config.formHasPhone && <li>El 100% de la captación de números depende de este botón. Insiste también en D-7 y D-5 por email.</li>}
            </ul>
          </div>
        </div>
      )}

      {activeSection === "snippets" && !generatedWorkflows && (
        <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center">
          <div className="text-sm text-stone-600">Genera los workflows primero (paso 2)</div>
        </div>
      )}

      {activeSection === "test" && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-4">
            <div className="font-semibold text-stone-900">🧪 Checklist de prueba</div>
            <div className="space-y-2">
              {[
                { step: "Importar Workflow 1 (captación) en n8n y activarlo", critical: true },
                { step: "Importar Workflow 2 (receptor WA) en n8n y activarlo", critical: true },
                { step: `Pegar la URL del Webhook en ${plat?.label || "tu plataforma"} (${plat?.webhookPath || ""})`, critical: true },
                { step: "Hacer un registro de prueba con un email real", critical: true },
                { step: "Verificar en n8n que el Workflow 1 se ejecutó y el contacto se guardó", critical: true },
                { step: config.formHasPhone ? "Verificar que el Flujo A se activó directamente" : "Abrir el email de confirmación y hacer clic en el botón de WA", critical: true },
                { step: config.formHasPhone === false ? "Verificar que el Workflow 2 recibió el mensaje y cruzó el token" : "N/A — teléfono ya disponible desde el registro", critical: config.formHasPhone === false },
                { step: "Confirmar que el mensaje M1 del Flujo A llega al móvil de prueba", critical: true },
                { step: "Pulsar un botón del mensaje y verificar que la rama correcta se activa", critical: false },
                { step: "Verificar tracking: el link de Zoom lleva el user_id correcto", critical: false },
              ].map((item, i) => (
                <div key={`qa-${i}`} className="flex items-start gap-3">
                  <div className={`w-4 h-4 rounded border-2 shrink-0 mt-0.5 ${item.critical ? "border-red-400" : "border-stone-300"}`} />
                  <div className="text-[12px] text-stone-700">{item.step}</div>
                  {item.critical && <span className="text-[10px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded shrink-0">crítico</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
            <div className="text-[11px] font-semibold text-stone-700 uppercase tracking-widest mb-2">Payload de prueba para {plat?.label}</div>
            <div className="relative">
              <pre className="text-[11px] font-mono bg-white border border-stone-200 rounded p-3 overflow-auto text-stone-700">
                {plat?.payloadExample || ""}
              </pre>
              <button onClick={() => copyText(plat?.payloadExample || "", "payload")}
                className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition ${copyStates.payload ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white border-stone-300 hover:border-stone-900"}`}>
                {copyStates.payload ? <Check size={10} /> : <Copy size={10} />} {copyStates.payload ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="text-[11px] text-stone-600 mt-2">Puedes usar este payload para probar el webhook de n8n directamente con Postman o Insomnia.</div>
          </div>
        </div>
      )}
    </div>
  );
}


// ====================================================================
// MONITORING — Mock con datos simulados
// ====================================================================
function generateMockEvents(flows) {
  const events = [];
  const users = ["usr_9f3k2", "usr_x82l0", "usr_m4h7a", "usr_b6g1w", "usr_t5qwe"];
  const now = Date.now();
  const types = ["message_sent", "message_delivered", "message_read", "button_clicked", "reply_received", "message_failed"];
  for (let i = 0; i < 45; i++) {
    const flow = flows[Math.floor(Math.random() * flows.length)];
    const msg = flow.items[Math.floor(Math.random() * flow.items.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const user = users[Math.floor(Math.random() * users.length)];
    events.push({
      id: "evt_" + i, at: now - (i * 60000 + Math.random() * 30000), type, flow: flow.key, flowLabel: flow.label,
      msgId: msg.id || "m" + i, user,
      error: type === "message_failed" ? ["Rate limit", "Invalid token", "User blocked", "Template not approved"][Math.floor(Math.random() * 4)] : null,
    });
  }
  return events.sort((a, b) => b.at - a.at);
}

function MonitoringPanel({ flows, projectId }) {
  const [events, setEvents] = useState([]);
  const [mode, setMode] = useState("mock"); // "live" | "mock"
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");

  const fetchEvents = useCallback(async () => {
    if (!projectId) { setEvents(generateMockEvents(flows)); setMode("mock"); setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/events?project_id=${encodeURIComponent(projectId)}&limit=500`);
      const data = await r.json();
      const mapped = (data || []).map(e => ({
        id: e.id,
        type: e.event || "message_sent",
        flow: e.flow || "",
        msg_id: e.msg_id || "",
        user: e.user_id || "",
        timestamp: typeof e.timestamp === "string" ? new Date(e.timestamp).getTime() : e.timestamp,
        error: e.error || null,
      }));
      if (mapped.length === 0) { setEvents(generateMockEvents(flows)); setMode("mock"); }
      else { setEvents(mapped); setMode("live"); }
    } catch (err) {
      setEvents(generateMockEvents(flows)); setMode("mock");
    } finally {
      setLoading(false);
    }
  }, [projectId, flows]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const filtered = events.filter(e => (filter === "all" || e.type === filter) && (flowFilter === "all" || e.flow === flowFilter));
  const failed = events.filter(e => e.type === "message_failed");
  const stats = useMemo(() => ({
    sent: events.filter(e => e.type === "message_sent").length,
    delivered: events.filter(e => e.type === "message_delivered").length,
    read: events.filter(e => e.type === "message_read").length,
    clicked: events.filter(e => e.type === "button_clicked").length,
    replied: events.filter(e => e.type === "reply_received").length,
    failed: events.filter(e => e.type === "message_failed").length,
  }), [events]);

  const deliveryRate = stats.sent > 0 ? Math.round((stats.delivered / stats.sent) * 100) : 0;
  const readRate = stats.delivered > 0 ? Math.round((stats.read / stats.delivered) * 100) : 0;

  const typeIcon = t => ({ message_sent: "📤", message_delivered: "✓", message_read: "✓✓", button_clicked: "👆", reply_received: "💬", message_failed: "❌" })[t] || "•";
  const typeLabel = t => ({ message_sent: "Enviado", message_delivered: "Entregado", message_read: "Leído", button_clicked: "Clic", reply_received: "Respuesta", message_failed: "FALLO" })[t] || t;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Salud del flujo</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {mode === "live"
              ? <>Eventos en tiempo real desde n8n · <span className="text-emerald-700 font-medium">{events.length} eventos recibidos</span></>
              : <>Monitoreo · <span className="text-amber-700 font-medium">sin eventos reales todavía — mostrando datos simulados</span></>
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchEvents} disabled={loading}
            data-testid="monitor-refresh-btn"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-white border border-stone-300 rounded-md hover:border-stone-900 disabled:opacity-50">
            <RotateCcw size={11} className={loading ? "animate-spin" : ""} /> {loading ? "Actualizando" : "Refrescar"}
          </button>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] border rounded-md ${
            mode === "live" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${mode === "live" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} /> {mode === "live" ? "LIVE" : "MOCK"}
          </div>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-red-900">{failed.length} envíos fallidos en la última hora</div>
            <div className="text-[12px] text-red-800 mt-1">Revisa el listado de errores abajo. Las causas más comunes: token expirado, usuario bloqueó el número, rate limit de Meta o template no aprobada.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Enviados" value={stats.sent} icon="📤" />
        <StatCard label="Entregados" value={stats.delivered} sub={`${deliveryRate}%`} icon="✓" />
        <StatCard label="Leídos" value={stats.read} sub={`${readRate}%`} icon="✓✓" />
        <StatCard label="Clics botón" value={stats.clicked} icon="👆" />
        <StatCard label="Respuestas" value={stats.replied} icon="💬" />
        <StatCard label="Fallidos" value={stats.failed} icon="❌" alert={stats.failed > 0} />
      </div>

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="font-semibold text-stone-900 text-sm">Log de eventos ({filtered.length})</div>
          <div className="flex gap-2">
            <select value={flowFilter} onChange={e => setFlowFilter(e.target.value)} className="text-xs px-2 py-1 border border-stone-200 rounded bg-white">
              <option value="all">Todos los flujos</option>
              {flows.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select value={filter} onChange={e => setFilter(e.target.value)} className="text-xs px-2 py-1 border border-stone-200 rounded bg-white">
              <option value="all">Todos los eventos</option>
              <option value="message_sent">Enviado</option><option value="message_delivered">Entregado</option>
              <option value="message_read">Leído</option><option value="button_clicked">Clic</option>
              <option value="reply_received">Respuesta</option><option value="message_failed">Fallo</option>
            </select>
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-stone-50 border-b border-stone-200 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-stone-600 text-[10px] uppercase tracking-widest">Hora</th>
                <th className="text-left px-4 py-2 font-semibold text-stone-600 text-[10px] uppercase tracking-widest">Tipo</th>
                <th className="text-left px-4 py-2 font-semibold text-stone-600 text-[10px] uppercase tracking-widest">Usuario</th>
                <th className="text-left px-4 py-2 font-semibold text-stone-600 text-[10px] uppercase tracking-widest">Flujo / Msg</th>
                <th className="text-left px-4 py-2 font-semibold text-stone-600 text-[10px] uppercase tracking-widest">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className={`border-b border-stone-100 hover:bg-stone-50 ${e.type === "message_failed" ? "bg-red-50/40" : ""}`}>
                  <td className="px-4 py-2 text-stone-600 font-mono text-[11px] whitespace-nowrap">{new Date(e.at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                  <td className="px-4 py-2 whitespace-nowrap"><span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${e.type === "message_failed" ? "bg-red-100 text-red-800" : "bg-stone-100 text-stone-700"}`}>{typeIcon(e.type)} {typeLabel(e.type)}</span></td>
                  <td className="px-4 py-2 font-mono text-[11px] text-stone-600">{e.user}</td>
                  <td className="px-4 py-2 text-stone-700">{e.flowLabel} · <span className="font-mono text-[11px]">{e.msgId}</span></td>
                  <td className="px-4 py-2 text-stone-600">{e.error ? <span className="text-red-700 font-medium">{e.error}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 rounded-md bg-stone-100 border border-stone-200">
        <div className="text-[11px] text-stone-700 leading-relaxed">
          <strong>Cómo conectar datos reales:</strong> en tu workflow de n8n, añade un nodo <span className="font-mono bg-white px-1 py-0.5 rounded">HTTP Request</span> después de cada envío de WhatsApp que mande un POST a un webhook de este editor con <span className="font-mono">{`{ event, user, flow, msgId, timestamp, error? }`}</span>. Cuando montemos backend propio, sustituimos el mock por esos datos.
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, alert }) {
  return (
    <div className={`bg-white rounded-lg border p-3 ${alert ? "border-red-200" : "border-stone-200"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase">{label}</span>
        <span className="text-sm">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-stone-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}

// ====================================================================
// CHECKER — Validación previa
// ====================================================================
function CheckerPanel({ flows, vars, edits, creatives, templatesByMsg, variantsByMsg, onGoToMessage }) {
  const checks = useMemo(() => {
    const issues = [];
    flows.forEach(f => {
      f.items.forEach((m, i) => {
        const msgKey = `${f.key}:${m.id || i}`;
        const copy = edits[msgKey] ?? m.copy;
        const tpl = templatesByMsg[msgKey];

        // 1. Vars sin definir
        const used = extractVarsUsed(copy);
        const undef = used.filter(n => !vars.find(v => v.name === n) && !RUNTIME_VARS.has(n));
        if (undef.length > 0) issues.push({ type: "error", flowKey: f.key, msgKey, label: `${f.label} · ${m.id || i}`, text: `Variables sin definir: ${undef.join(", ")}` });

        // 2. Body > 1024
        if (copy && copy.length > 1024) issues.push({ type: "error", flowKey: f.key, msgKey, label: `${f.label} · ${m.id || i}`, text: `Copy supera 1024 chars (${copy.length}) · límite Meta para templates` });

        // 3. Botones sin tracking
        if (m.botones && m.botones.includes("Link:") && !m.botones.includes("user_id")) issues.push({ type: "warning", flowKey: f.key, msgKey, label: `${f.label} · ${m.id || i}`, text: "Botón con link pero sin user_id (tracking incompleto)" });

        // 4. Recursos mencionados pero sin creativo asociado
        const msgCreatives = creatives.filter(c => c.messageKey === msgKey);
        if (m.recursos && m.recursos.trim() && msgCreatives.length === 0) issues.push({ type: "info", flowKey: f.key, msgKey, label: `${f.label} · ${m.id || i}`, text: `Excel menciona recurso ("${m.recursos.slice(0, 40)}...") pero no hay creativo subido` });

        // 5. Template sin nombre
        if (tpl?.isTemplate && !tpl.name) issues.push({ type: "warning", flowKey: f.key, msgKey, label: `${f.label} · ${m.id || i}`, text: "Marcado como template Meta pero sin nombre" });

        // 6. Variantes A/B con % que no suma
        const v = variantsByMsg[msgKey];
        if (v?.enabled && v.items?.length > 0) {
          const total = 100 / (v.items.length + 1); // aproximado
          const sum = v.items.reduce((s, vv) => s + (vv.traffic || 0), 0);
          if (sum >= 100) issues.push({ type: "warning", flowKey: f.key, msgKey, label: `${f.label} · ${m.id || i}`, text: `A/B: suma de tráfico = ${sum}% · quedaría 0% para la variante A (principal)` });
        }
      });
    });

    // 7. Variables huérfanas (definidas pero no usadas)
    const allUsed = new Set();
    flows.forEach(f => f.items.forEach((m, i) => {
      const copy = edits[`${f.key}:${m.id || i}`] ?? m.copy;
      extractVarsUsed(copy).forEach(n => allUsed.add(n));
      extractVarsUsed(m.botones).forEach(n => allUsed.add(n));
    }));
    vars.forEach(v => { if (v.name && !allUsed.has(v.name) && !RUNTIME_VARS.has(v.name)) issues.push({ type: "info", text: `Variable {${v.name}} definida pero no usada en ningún mensaje` }); });

    return issues;
  }, [flows, vars, edits, creatives, templatesByMsg, variantsByMsg]);

  const errors = checks.filter(c => c.type === "error");
  const warnings = checks.filter(c => c.type === "warning");
  const infos = checks.filter(c => c.type === "info");

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Validación previa</h2>
        <p className="text-xs text-stone-500 mt-0.5">Revisa que todo esté correcto antes de lanzar la automatización</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-lg border p-4 ${errors.length > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="text-[10px] font-semibold tracking-widest uppercase">{errors.length > 0 ? "Errores" : "Sin errores"}</div>
          <div className={`text-2xl font-bold mt-1 ${errors.length > 0 ? "text-red-700" : "text-emerald-700"}`}>{errors.length}</div>
        </div>
        <div className={`rounded-lg border p-4 ${warnings.length > 0 ? "bg-amber-50 border-amber-200" : "bg-stone-50 border-stone-200"}`}>
          <div className="text-[10px] font-semibold tracking-widest uppercase">Avisos</div>
          <div className={`text-2xl font-bold mt-1 ${warnings.length > 0 ? "text-amber-700" : "text-stone-700"}`}>{warnings.length}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-[10px] font-semibold tracking-widest uppercase">Info</div>
          <div className="text-2xl font-bold text-stone-700 mt-1">{infos.length}</div>
        </div>
      </div>

      {checks.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center">
          <CheckCircle2 size={32} className="mx-auto text-emerald-600" />
          <div className="text-emerald-800 font-semibold mt-2">Todo correcto · sin problemas detectados</div>
          <div className="text-[12px] text-emerald-700 mt-1">Tu proyecto está listo para lanzamiento.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {[...errors, ...warnings, ...infos].map((c, i) => {
            const color = c.type === "error" ? "bg-red-50 border-red-200 text-red-900" : c.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-white border-stone-200 text-stone-700";
            const icon = c.type === "error" ? <AlertCircle size={14} className="text-red-700 shrink-0 mt-0.5" /> : c.type === "warning" ? <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" /> : <AlertCircle size={14} className="text-stone-500 shrink-0 mt-0.5" />;
            return (
              <div key={`chk-${c.type}-${i}-${c.flowKey||""}-${c.msgKey||""}`} className={`flex items-start gap-3 p-3 rounded-md border ${color}`}>
                {icon}
                <div className="flex-1">
                  {c.label && <div className="text-[11px] font-semibold opacity-80">{c.label}</div>}
                  <div className="text-[13px]">{c.text}</div>
                </div>
                {c.flowKey && c.msgKey && (
                  <button onClick={() => onGoToMessage(c.flowKey, c.msgKey)} className="text-[11px] font-medium text-stone-700 hover:text-stone-900 border border-stone-300 bg-white rounded px-2 py-1 shrink-0">
                    Ir →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ====================================================================
// SIMULADOR DE FLUJO
// ====================================================================
function SimulatorPanel({ flows, vars, edits }) {
  const [currentFlowKey, setCurrentFlowKey] = useState(flows[0]?.key || "");
  const [path, setPath] = useState([]); // [{msgId, pickedBtn?}]
  const [currentIdx, setCurrentIdx] = useState(0);
  const [running, setRunning] = useState(false);

  const flow = flows.find(f => f.key === currentFlowKey);
  const items = flow?.items || [];
  const currentMsg = items[currentIdx];

  const start = () => { setPath([]); setCurrentIdx(0); setRunning(true); };
  const reset = () => { setPath([]); setCurrentIdx(0); setRunning(false); };

  const chooseNext = (buttonLabel) => {
    if (!currentMsg) return;
    const msgKey = currentMsg.id || `#${currentIdx + 1}`;
    const newPath = [...path, { msgId: msgKey, picked: buttonLabel, copy: edits[`${flow.key}:${currentMsg.id || currentIdx}`] ?? currentMsg.copy }];
    setPath(newPath);

    // Lógica simplificada de ramificación para flujo A
    if (flow.key === "flujo_a" && buttonLabel) {
      const btn = buttonLabel.toLowerCase();
      let nextId = null;
      if (btn.includes("cuenta ajena")) nextId = "M3.A1";
      else if (btn.includes("freelance") || btn.includes("autónomo")) nextId = "M3.B1";
      else if (btn.includes("mi negocio")) nextId = "M3.C1";
      else if (btn.includes("paro")) nextId = "M3.D1";
      if (nextId) { const idx = items.findIndex(m => m.id === nextId); if (idx >= 0) { setCurrentIdx(idx); return; } }
    }
    // Default: siguiente mensaje
    if (currentIdx + 1 < items.length) setCurrentIdx(currentIdx + 1);
    else setRunning(false);
  };

  const skip = () => {
    if (currentIdx + 1 < items.length) setCurrentIdx(currentIdx + 1);
    else setRunning(false);
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Simulador de flujo</h2>
        <p className="text-xs text-stone-500 mt-0.5">Recorre el flujo como si fueras el usuario · verifica ramas y copys</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={currentFlowKey} onChange={e => { setCurrentFlowKey(e.target.value); reset(); }}
          className="px-3 py-1.5 text-sm border border-stone-200 rounded-md bg-white">
          {flows.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        {!running ? (
          <button onClick={start} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md">
            <Play size={13} /> Empezar simulación
          </button>
        ) : (
          <>
            <button onClick={skip} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 border border-stone-300 rounded-md">
              Saltar al siguiente →
            </button>
            <button onClick={reset} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 border border-stone-300 rounded-md">
              <RotateCcw size={12} /> Reiniciar
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chat */}
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <div className="bg-[#075E54] text-white px-4 py-3 text-sm font-medium">Simulación — {flow?.label}</div>
          <div className="px-3 py-5 min-h-[400px] max-h-[500px] overflow-y-auto" style={{ backgroundColor: "#ECE5DD" }}>
            {path.length === 0 && !running && <div className="text-center text-stone-500 text-[12px] mt-16">Pulsa "Empezar" para iniciar la simulación</div>}
            {path.map((step, i) => (
              <div key={`sim-${i}-${step.msgId||""}`} className="mb-2">
                <div className="flex justify-start mb-1">
                  <div className="max-w-[85%] bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm text-[13px] text-stone-800 whitespace-pre-wrap">{replaceVars(step.copy, vars)}</div>
                </div>
                {step.picked && (
                  <div className="flex justify-end mt-1">
                    <div className="max-w-[85%] bg-[#DCF8C6] rounded-lg rounded-tr-none px-3 py-2 shadow-sm text-[13px] text-stone-800">{step.picked}</div>
                  </div>
                )}
              </div>
            ))}
            {running && currentMsg && (
              <div className="mb-2">
                <div className="flex justify-start mb-1">
                  <div className="max-w-[85%] bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm text-[13px] text-stone-800 whitespace-pre-wrap border-2 border-dashed border-stone-400">
                    {replaceVars(edits[`${flow.key}:${currentMsg.id || currentIdx}`] ?? currentMsg.copy, vars)}
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {parseButtons(currentMsg.botones).map((b, i) => (
                    <button key={`simbtn-${i}-${b}`} onClick={() => chooseNext(b)} className="w-full bg-white rounded-lg px-3 py-2 text-left text-[13px] text-[#00A5F4] shadow-sm border border-stone-200 hover:bg-stone-50">
                      → {b}
                    </button>
                  ))}
                  {parseButtons(currentMsg.botones).length === 0 && (
                    <button onClick={() => chooseNext(null)} className="w-full bg-stone-50 rounded-lg px-3 py-2 text-center text-[12px] text-stone-600 border border-stone-200 hover:bg-stone-100">
                      (mensaje sin botones · continuar)
                    </button>
                  )}
                </div>
              </div>
            )}
            {!running && path.length > 0 && (
              <div className="text-center mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-[12px] text-emerald-800">
                ✓ Simulación finalizada · {path.length} pasos recorridos
              </div>
            )}
          </div>
        </div>

        {/* Path */}
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-200 font-semibold text-sm text-stone-900">Camino recorrido</div>
          <div className="p-4 max-h-[500px] overflow-y-auto">
            {path.length === 0 ? (
              <div className="text-center text-stone-500 text-[12px] py-8">Aún no has navegado ningún mensaje</div>
            ) : (
              <ol className="space-y-2">
                {path.map((step, i) => (
                  <li key={`p-${i}-${step.msgId||""}`} className="flex items-start gap-2">
                    <span className="text-[10px] font-mono bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-mono text-stone-900">{step.msgId}</div>
                      {step.picked && <div className="text-[11px] text-emerald-700">→ {step.picked}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// SNAPSHOTS — Versionado
// ====================================================================
function SnapshotsPanel({ snapshots, onCreate, onRestore, onDelete }) {
  const [label, setLabel] = useState("");
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Versiones / Snapshots</h2>
        <p className="text-xs text-stone-500 mt-0.5">Guarda el estado completo del proyecto para poder volver atrás si algo se rompe</p>
      </div>
      <div className="bg-white border border-stone-200 rounded-lg p-4">
        <div className="text-sm font-semibold mb-2">Crear snapshot ahora</div>
        <div className="flex gap-2">
          <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Etiqueta (ej: v1 pre-lanzamiento enero)"
            className="flex-1 px-3 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900" />
          <button onClick={() => { if (label.trim()) { onCreate(label.trim()); setLabel(""); } }}
            className="px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md">
            <GitCommit size={13} className="inline mr-1" /> Guardar
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {snapshots.length === 0 ? (
          <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center">
            <GitBranch size={24} className="mx-auto text-stone-400" />
            <div className="text-sm text-stone-600 mt-2">Aún no hay snapshots</div>
          </div>
        ) : snapshots.map(s => (
          <div key={s.id} className="bg-white border border-stone-200 rounded-lg p-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-stone-900">{s.label}</div>
              <div className="text-[11px] text-stone-500">{new Date(s.at).toLocaleString("es-ES")} · por {s.author || "Anónimo"}</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => onRestore(s)} className="text-xs px-2.5 py-1 border border-stone-300 rounded hover:border-stone-900">↺ Restaurar</button>
              <button onClick={() => onDelete(s.id)} className="text-xs px-2 py-1 text-stone-500 hover:text-red-600"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ====================================================================
// CALENDARIO VISUAL
// ====================================================================
function CalendarPanel({ flows, vars }) {
  // Base date: webinar date from vars
  const webDate = useMemo(() => {
    const v = vars.find(x => x.name === "FECHA_WEBINAR");
    if (!v || !v.value) return new Date();
    const d = new Date(v.value);
    return isNaN(d.getTime()) ? new Date() : d;
  }, [vars]);

  const schedule = useMemo(() => {
    const list = [];
    flows.forEach(f => {
      f.items.forEach((m, i) => {
        const d = parseDayOffset(m.dia);
        if (d === null) return;
        const date = new Date(webDate);
        date.setDate(date.getDate() + d);
        const hourMatch = (m.hora || m.timing || "").match(/(\d{1,2}):(\d{2})/);
        if (hourMatch) { date.setHours(parseInt(hourMatch[1]), parseInt(hourMatch[2]), 0, 0); }
        list.push({ date, flow: f, msg: m, dayOffset: d });
      });
    });
    return list.sort((a, b) => a.date - b.date);
  }, [flows, webDate]);

  // Agrupar por día
  const byDay = useMemo(() => {
    const g = {};
    schedule.forEach(s => {
      const k = s.date.toISOString().slice(0, 10);
      if (!g[k]) g[k] = [];
      g[k].push(s);
    });
    return g;
  }, [schedule]);

  const days = Object.keys(byDay).sort();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Calendario de envíos</h2>
        <p className="text-xs text-stone-500 mt-0.5">Todos los mensajes programados · basado en {`{FECHA_WEBINAR}`} = {webDate.toLocaleDateString("es-ES")}</p>
      </div>
      {days.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center">
          <CalIcon size={24} className="mx-auto text-stone-400" />
          <div className="text-sm text-stone-600 mt-2">No hay mensajes con fecha parseable</div>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map(k => {
            const items = byDay[k];
            const day = new Date(k);
            const isWebDay = day.toDateString() === webDate.toDateString();
            const colliding = items.length > 2;
            return (
              <div key={k} className={`bg-white border rounded-lg overflow-hidden ${isWebDay ? "border-red-300" : colliding ? "border-amber-300" : "border-stone-200"}`}>
                <div className={`px-4 py-2 text-xs font-semibold ${isWebDay ? "bg-red-50 text-red-900" : colliding ? "bg-amber-50 text-amber-900" : "bg-stone-50 text-stone-700"}`}>
                  {day.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                  {isWebDay && <span className="ml-2">🎥 DÍA DEL WEBINAR</span>}
                  {colliding && <span className="ml-2">⚠️ {items.length} mensajes el mismo día</span>}
                </div>
                <div className="divide-y divide-stone-100">
                  {items.map((it, i) => (
                    <div key={`cal-${it.msg.id||i}-${it.flow.key}`} className="px-4 py-2 flex items-center gap-3 text-[12px]">
                      <span className="font-mono text-[11px] text-stone-500 w-16">{it.date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="font-mono text-[11px] bg-stone-100 px-1.5 py-0.5 rounded">{it.msg.id || it.msg.dia}</span>
                      <span className="text-stone-700 truncate flex-1">{it.flow.label}</span>
                      <span className="text-stone-500 text-[11px] truncate max-w-xs">{it.msg.objetivo}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ====================================================================
// PANEL CLIENTE (modo revisión)
// ====================================================================
function MagicLinkCard({ projectId }) {
  const [state, setState] = useState({ loading: false, token: null, error: null, copied: false });

  const generate = async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/review/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!r.ok) throw new Error("No se pudo generar");
      const j = await r.json();
      setState({ loading: false, token: j.token, error: null, copied: false });
    } catch (e) {
      setState({ loading: false, token: null, error: e.message, copied: false });
    }
  };

  const fullUrl = state.token ? `${window.location.origin}/review/${state.token}` : "";

  const copy = async () => {
    if (!fullUrl) return;
    try { await navigator.clipboard.writeText(fullUrl); } catch {
      const ta = document.createElement("textarea"); ta.value = fullUrl;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    setState(s => ({ ...s, copied: true }));
    setTimeout(() => setState(s => ({ ...s, copied: false })), 1600);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-200 rounded-xl p-5 mb-5" data-testid="magic-link-card">
      <div className="flex items-center gap-2 mb-2">
        <LinkIcon size={14} className="text-indigo-700" />
        <div className="text-[11px] font-semibold tracking-widest text-indigo-900 uppercase">Link mágico para el cliente</div>
      </div>
      <div className="text-[12px] text-indigo-900/80 mb-3 leading-relaxed">
        Genera una URL pública (solo lectura + aprobación) que puedes enviar a tu cliente. No necesita cuenta ni login.
      </div>

      {!state.token ? (
        <button onClick={generate} disabled={state.loading}
          data-testid="generate-magic-link-btn"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
          <Zap size={14} /> {state.loading ? "Generando…" : "Generar link de aprobación"}
        </button>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <input readOnly value={fullUrl}
            data-testid="magic-link-url"
            onClick={e => e.target.select()}
            className="flex-1 min-w-[260px] px-3 py-2 text-xs font-mono bg-white border border-indigo-200 rounded-md text-indigo-900 focus:outline-none focus:border-indigo-600" />
          <button onClick={copy} data-testid="copy-magic-link-btn"
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition ${
              state.copied ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50"
            }`}>
            {state.copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
          </button>
          <a href={fullUrl} target="_blank" rel="noreferrer" data-testid="open-magic-link-btn"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            <ExternalLink size={13} /> Abrir
          </a>
        </div>
      )}
      {state.error && <div className="mt-2 text-[12px] text-red-700">{state.error}</div>}
    </div>
  );
}

function ClientReviewPanel({ flows, vars, edits, approvalByMsg, onSetApproval, me, projectName, projectId }) {
  const [commentBoxOpen, setCommentBoxOpen] = useState({});
  const [commentText, setCommentText] = useState({});

  const total = useMemo(() => flows.reduce((s, f) => s + f.items.length, 0), [flows]);
  const approved = Object.values(approvalByMsg).filter(a => a?.status === "approved").length;
  const changes = Object.values(approvalByMsg).filter(a => a?.status === "changes").length;

  return (
    <div className="space-y-5 max-w-3xl">
      {projectId && <MagicLinkCard projectId={projectId} />}
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl p-6 text-white">
        <div className="text-[11px] uppercase tracking-widest opacity-75">Revisión del cliente</div>
        <div className="text-2xl font-bold mt-1">{projectName}</div>
        <div className="text-sm opacity-90 mt-1">Aprueba cada mensaje o pide cambios · {approved}/{total} aprobados · {changes} con cambios</div>
        <div className="mt-4 bg-white/20 rounded-full h-2">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${total > 0 ? (approved / total * 100) : 0}%` }} />
        </div>
      </div>

      {flows.map(f => (
        <div key={f.key}>
          <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-3 mt-6">{f.label}</div>
          <div className="space-y-3">
            {f.items.map((m, i) => {
              const mk = `${f.key}:${m.id || i}`;
              const copy = replaceVars(edits[mk] ?? m.copy, vars);
              const btns = parseButtons(replaceVars(m.botones, vars));
              const app = approvalByMsg[mk];
              const isOpen = commentBoxOpen[mk];

              return (
                <div key={mk} className={`bg-white rounded-xl overflow-hidden border-2 transition ${
                  app?.status === "approved" ? "border-emerald-300" :
                  app?.status === "changes" ? "border-amber-300" : "border-stone-200"
                }`}>
                  <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-mono font-semibold">{m.id || m.dia} · {m.timing || m.hora}</div>
                    {app?.status === "approved" && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">✓ Aprobado por {app.by}</span>}
                    {app?.status === "changes" && <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">✎ Cambios por {app.by}</span>}
                  </div>
                  <div className="p-4" style={{ backgroundColor: "#ECE5DD" }}>
                    <div className="max-w-[85%] bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm">
                      <div className="text-[13.5px] text-stone-800 whitespace-pre-wrap leading-[1.35]">{copy}</div>
                    </div>
                    {btns.length > 0 && (
                      <div className="mt-1 space-y-0.5 max-w-[85%]">
                        {btns.map((b, j) => <div key={`prevbtn-${j}-${b}`} className="bg-white rounded-lg px-3 py-2 text-center text-[13px] font-medium text-[#00A5F4] shadow-sm">{b}</div>)}
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3 border-t border-stone-200 bg-white flex items-center gap-2 flex-wrap">
                    <button onClick={() => onSetApproval(mk, { status: "approved", by: me, at: Date.now() })}
                      className={`text-xs px-3 py-1.5 rounded-md border font-medium ${app?.status === "approved" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>
                      ✓ Aprobar
                    </button>
                    <button onClick={() => setCommentBoxOpen(p => ({ ...p, [mk]: !p[mk] }))}
                      className={`text-xs px-3 py-1.5 rounded-md border font-medium ${app?.status === "changes" ? "bg-amber-600 text-white border-amber-600" : "bg-white border-amber-300 text-amber-700 hover:bg-amber-50"}`}>
                      ✎ Necesita cambios
                    </button>
                    {app && <button onClick={() => onSetApproval(mk, null)} className="text-xs text-stone-500 hover:text-stone-900">Borrar estado</button>}
                  </div>
                  {isOpen && (
                    <div className="px-4 py-3 border-t border-stone-200 bg-stone-50">
                      <textarea value={commentText[mk] || ""} onChange={e => setCommentText({ ...commentText, [mk]: e.target.value })}
                        placeholder="Qué cambiarías..." className="w-full p-2 text-sm border border-stone-200 rounded-md min-h-[60px]" />
                      <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => { setCommentBoxOpen(p => ({ ...p, [mk]: false })); }} className="text-xs px-2 py-1 text-stone-500">Cancelar</button>
                        <button onClick={() => {
                          onSetApproval(mk, { status: "changes", by: me, at: Date.now(), comment: commentText[mk] || "" });
                          setCommentBoxOpen(p => ({ ...p, [mk]: false }));
                        }} className="text-xs px-3 py-1 bg-amber-600 text-white rounded-md">Enviar</button>
                      </div>
                    </div>
                  )}
                  {app?.comment && (
                    <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[12px] text-amber-900">
                      <strong>Comentario de {app.by}:</strong> {app.comment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ====================================================================
// HISTORIAL
// ====================================================================
function HistoryPanel({ history }) {
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Historial de cambios</h2>
        <p className="text-xs text-stone-500 mt-0.5">Quién editó qué y cuándo · últimos 200 eventos</p>
      </div>
      {history.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-lg p-8 text-center">
          <History size={24} className="mx-auto text-stone-400" />
          <div className="text-sm text-stone-600 mt-2">Aún no hay cambios registrados</div>
        </div>
      ) : (
        <div className="space-y-1">
          {history.slice(0, 200).map((h, i) => (
            <div key={`hist-${h.at||i}-${i}`} className="bg-white border border-stone-200 rounded-md px-3 py-2 flex items-center justify-between gap-2 text-[12px]">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[10px] text-stone-500 font-mono w-32 shrink-0">{new Date(h.at).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="font-medium text-stone-900">{h.author}</span>
                <span className="text-stone-600">{h.action}</span>
                {h.target && <span className="font-mono text-[11px] text-stone-500 truncate">{h.target}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ====================================================================
// INTAKE PANEL — checklist de datos y recursos que pedimos al cliente
// Auto-detecta variables editables sin valor + mensajes con recursos sin creativo.
// Agencia: seleccionar qué pedir, copiar link /intake/:token, revisar pending, aprobar/rechazar.
// ====================================================================
function IntakePanel({ projectId, projectName, vars, flows, creatives }) {
  const API = useMemo(() => `${process.env.REACT_APP_BACKEND_URL}/api`, []);
  const [token, setToken] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rejectState, setRejectState] = useState({}); // itemId -> { open, comment }

  const autoSuggest = useMemo(() => {
    const suggestions = [];
    // 1) Variables editables sin valor
    vars.forEach(v => {
      if (!v.editable) return;
      if (v.value && v.value.trim() !== "") return;
      suggestions.push({
        id: `var:${v.name}`,
        type: "variable",
        key: v.name,
        label: v.name,
        section: v.category || "Tu marca",
        example: "",
        help: `Variable ${v.name}. Se usará en los mensajes a tus leads.`,
      });
    });
    // 2) Mensajes con "recursos" declarados pero sin creativo adjunto
    flows.forEach(f => {
      (f.items || []).forEach((m, idx) => {
        const rec = (m.recursos || "").trim();
        if (!rec || rec.toLowerCase() === "n/a") return;
        const msgKey = `${f.key}:${m.id || idx}`;
        const hasCreative = creatives.some(c => c.messageKey === msgKey);
        if (hasCreative) return;
        suggestions.push({
          id: `cre:${msgKey}`,
          type: "creative",
          key: msgKey,
          label: `${m.id || m.dia || idx} — ${rec.slice(0, 60)}`,
          section: "Creativos",
          help: `Para ${f.label}. Sube imagen, video o PDF (máx 10 MB).`,
        });
      });
    });
    return suggestions;
  }, [vars, flows, creatives]);

  // Cargar intake existente
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/intake/project/${projectId}`);
        const data = await r.json();
        if (data.exists) {
          setToken(data.token);
          setItems(data.items || []);
        } else {
          setToken(null);
          // Pre-cargar con auto-sugeridos, todos marcados como requested
          setItems(autoSuggest.map(s => ({ ...s, requested: true, status: "empty" })));
        }
      } catch (e) {
        console.warn("intake load failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, API, autoSuggest]);

  const persistItems = async (nextItems) => {
    setSaving(true);
    try {
      if (!token) {
        // Crear
        const r = await fetch(`${API}/intake/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, items: nextItems }),
        });
        const data = await r.json();
        if (r.ok) setToken(data.token);
      } else {
        await fetch(`${API}/intake/project/${projectId}/items`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: nextItems }),
        });
      }
    } catch (e) {
      console.warn("intake persist failed", e);
    } finally {
      setSaving(false);
    }
  };

  const toggleRequested = (itemId) => {
    const next = items.map(it => it.id === itemId ? { ...it, requested: !it.requested } : it);
    setItems(next);
    persistItems(next);
  };

  const addAllSuggested = () => {
    const existingIds = new Set(items.map(i => i.id));
    const toAdd = autoSuggest.filter(s => !existingIds.has(s.id)).map(s => ({ ...s, requested: true, status: "empty" }));
    const next = items.concat(toAdd).map(i =>
      autoSuggest.some(s => s.id === i.id) ? { ...i, requested: true } : i
    );
    setItems(next);
    persistItems(next);
  };

  const reviewItem = async (itemId, action, comment) => {
    try {
      const r = await fetch(`${API}/intake/project/${projectId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, action, comment: comment || null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Error");
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, status: data.status, review_comment: action === "reject" ? (comment || null) : it.review_comment } : it));
      setRejectState(s => ({ ...s, [itemId]: { open: false, comment: "" } }));
    } catch (e) {
      alert("No se pudo " + (action === "approve" ? "aprobar" : "rechazar") + ": " + e.message);
    }
  };

  const intakeUrl = token ? `${window.location.origin}/intake/${token}` : "";
  const copyIntakeLink = async () => {
    if (!intakeUrl) return;
    try { await navigator.clipboard.writeText(intakeUrl); } catch {
      const ta = document.createElement("textarea"); ta.value = intakeUrl; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    alert("Link copiado al portapapeles");
  };

  const requested = items.filter(i => i.requested);
  const pending = requested.filter(i => i.status === "pending");
  const approved = requested.filter(i => i.status === "approved");
  const rejected = requested.filter(i => i.status === "rejected");
  const empty = requested.filter(i => !i.status || i.status === "empty");

  if (loading) {
    return <div className="text-sm text-stone-500">Cargando checklist...</div>;
  }

  return (
    <div className="space-y-5 max-w-4xl" data-testid="intake-panel">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Checklist del cliente</h2>
        <p className="text-xs text-stone-500 mt-0.5">Todo lo que necesitamos del cliente: variables de texto + creativos. Genera un link público, se lo pasas al cliente, y él rellena con auto-guardado.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-stone-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Solicitados</div>
          <div className="text-2xl font-bold text-stone-900 mt-1" data-testid="intake-count-requested">{requested.length}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-widest text-amber-700">En revisión</div>
          <div className="text-2xl font-bold text-amber-900 mt-1" data-testid="intake-count-pending">{pending.length}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-widest text-emerald-700">Aprobados</div>
          <div className="text-2xl font-bold text-emerald-900 mt-1" data-testid="intake-count-approved">{approved.length}</div>
        </div>
        <div className="bg-stone-100 border border-stone-200 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Pendientes de enviar</div>
          <div className="text-2xl font-bold text-stone-700 mt-1">{empty.length}</div>
        </div>
      </div>

      {/* Link público */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Share2 size={16} />
          <div className="text-[11px] uppercase tracking-widest opacity-75">Link público para tu cliente</div>
        </div>
        {token && intakeUrl ? (
          <>
            <div className="font-mono text-[11.5px] bg-white/10 rounded p-2 break-all mb-2" data-testid="intake-url">{intakeUrl}</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={copyIntakeLink} data-testid="intake-copy-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-white text-indigo-700 rounded-md hover:bg-indigo-50">
                <Copy size={13} /> Copiar link
              </button>
              <a href={intakeUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-white/10 border border-white/30 rounded-md hover:bg-white/20">
                <ExternalLink size={13} /> Abrir vista cliente
              </a>
            </div>
          </>
        ) : (
          <div className="text-[12.5px] opacity-90">
            Marca abajo qué vas a pedirle al cliente y se generará el link automáticamente al guardar.
          </div>
        )}
      </div>

      {/* Pending review (destacado) */}
      {pending.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-700" />
            <div className="font-bold text-amber-900 text-sm">{pending.length} {pending.length === 1 ? "dato pendiente de revisar" : "datos pendientes de revisar"}</div>
          </div>
          <div className="space-y-2">
            {pending.map(it => {
              const rej = rejectState[it.id] || {};
              return (
                <div key={it.id} className="bg-white border border-amber-200 rounded-lg p-3" data-testid={`intake-pending-${it.id}`}>
                  <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
                    <div className="text-[11.5px] text-amber-700 font-semibold uppercase tracking-widest">{it.section}</div>
                    <div className="text-[10px] text-stone-500">
                      {it.submitted_at ? `Enviado ${new Date(it.submitted_at).toLocaleString("es-ES")}` : ""}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-stone-900 mb-1">{it.label}</div>
                  {it.type === "variable" ? (
                    <div className="text-[13px] bg-stone-50 border border-stone-200 rounded p-2 font-mono whitespace-pre-wrap text-stone-800">
                      {it.client_value || "(vacío)"}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded p-2">
                      <div className="text-xl">📎</div>
                      <a href={`${API}/intake/file/${it.client_file_id}`} target="_blank" rel="noreferrer"
                        className="flex-1 min-w-0 text-[12px] font-medium text-indigo-700 truncate hover:underline">
                        {it.client_file_name || "archivo"}
                      </a>
                      <span className="text-[10px] text-stone-500">{it.client_file_size ? `${(it.client_file_size / 1024).toFixed(0)} KB` : ""}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <button onClick={() => reviewItem(it.id, "approve")}
                      data-testid={`intake-approve-${it.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
                      <Check size={12} /> Aprobar y aplicar
                    </button>
                    {!rej.open ? (
                      <button onClick={() => setRejectState(s => ({ ...s, [it.id]: { open: true, comment: "" } }))}
                        data-testid={`intake-reject-open-${it.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-300 text-red-700 rounded-md hover:bg-red-50">
                        <X size={12} /> Rechazar
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 w-full">
                        <input value={rej.comment || ""} onChange={e => setRejectState(s => ({ ...s, [it.id]: { ...s[it.id], comment: e.target.value } }))}
                          placeholder="Motivo (ej: el logo no se ve bien en fondo oscuro)"
                          data-testid={`intake-reject-reason-${it.id}`}
                          className="flex-1 px-2 py-1 text-[12px] border border-red-200 rounded" />
                        <button onClick={() => reviewItem(it.id, "reject", rej.comment)}
                          data-testid={`intake-reject-confirm-${it.id}`}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-md hover:bg-red-700">Enviar rechazo</button>
                        <button onClick={() => setRejectState(s => ({ ...s, [it.id]: { open: false, comment: "" } }))}
                          className="text-xs text-stone-500 hover:text-stone-900">Cancelar</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Checklist completo */}
      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="font-semibold text-stone-900 text-sm">Qué pedirle al cliente</div>
          <button onClick={addAllSuggested} data-testid="intake-add-all-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700">
            <Plus size={12} /> Añadir todo lo auto-detectado ({autoSuggest.length})
          </button>
        </div>
        <div className="text-[11px] text-stone-500 mb-3">
          Marca/desmarca cada item. Al guardar se genera/actualiza el link público. {saving && <span className="text-amber-700">Guardando...</span>}
        </div>
        {items.length === 0 ? (
          <div className="text-[12px] text-stone-500 py-4 text-center">
            No hay sugerencias: todas tus variables editables tienen valor y todos los mensajes con recursos tienen creativo. Puedes añadir items custom manualmente en futuras versiones.
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map(it => (
              <label key={it.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-stone-50 cursor-pointer"
                data-testid={`intake-toggle-${it.id}`}>
                <input type="checkbox" checked={!!it.requested} onChange={() => toggleRequested(it.id)}
                  className="w-4 h-4 accent-stone-900" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-stone-900 truncate">
                    {it.type === "creative" ? "🎨 " : ""}{it.label}
                  </div>
                  <div className="text-[10.5px] text-stone-500 truncate">{it.section} · {it.type}</div>
                </div>
                {it.status && it.status !== "empty" && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    it.status === "approved" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : it.status === "pending" ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-red-50 border-red-200 text-red-800"
                  }`}>{it.status}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



// ====================================================================
// PROJECT WORKSPACE — todo el editor de un proyecto
// ====================================================================
function ProjectWorkspace({ project, onBack, me, onUpdateProject }) {
  const strat = STRATEGY_TEMPLATES[project.strategy];
  // customMsgs: mensajes añadidos manualmente por el usuario (desde Mapa o Flujos)
  // Estructura: { [flowKey]: [{id, dia, timing, hora, objetivo, copy, botones, position}] }
  const [customMsgs, setCustomMsgs] = useState({});
  const FLOWS = useMemo(() => {
    const base = getFlowsForStrategy(project.strategy);
    return base.map(f => {
      const customs = (customMsgs[f.key] || []).map(m => ({ ...m, _custom: true }));
      if (customs.length === 0) return f;
      // Insertar por position (si tiene) o al final
      const items = [...f.items];
      const withPos = customs.filter(c => typeof c.position === "number");
      const withoutPos = customs.filter(c => typeof c.position !== "number");
      withPos.sort((a, b) => a.position - b.position).forEach(c => {
        const pos = Math.max(0, Math.min(items.length, c.position));
        items.splice(pos, 0, c);
      });
      withoutPos.forEach(c => items.push(c));
      return { ...f, items };
    });
  }, [project.strategy, customMsgs]);

  // Estados por proyecto
  const [vars, setVars] = useState(getDefaultVarsForStrategy(project.strategy));
  const [edits, setEdits] = useState({});
  const [creatives, setCreatives] = useState([]);
  const [connections, setConnections] = useState({});
  const [notifyConfig, setNotifyConfig] = useState({ slack_url: "", discord_url: "" });
  const [captacionConfig, setCaptacionConfig] = useState({
    platform: "", formHasPhone: null, whatsappNumber: "", webinarDate: "",
  });
  const [aiPrompt, setAIPrompt] = useState(DEFAULT_AI_PROMPT);
  const [commentsByMsg, setCommentsByMsg] = useState({});
  const [variantsByMsg, setVariantsByMsg] = useState({});
  const [approvalByMsg, setApprovalByMsg] = useState({});
  const [templatesByMsg, setTemplatesByMsg] = useState({});
  const [snapshots, setSnapshots] = useState([]);
  const [history, setHistory] = useState([]);

  const [activeTab, setActiveTab] = useState("flows");
  const [activeFlow, setActiveFlow] = useState(FLOWS[0]?.key);
  const [search, setSearch] = useState("");
  const [showVars, setShowVars] = useState(true);
  const [sidebarTab, setSidebarTab] = useState("flows");
  const [previewMsg, setPreviewMsg] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("synced");
  const [scrollToMsg, setScrollToMsg] = useState(null);

  const pid = project.id;
  useEffect(() => {
    (async () => {
      const sv = await loadFromStorage(pk(pid, "vars"));
      const se = await loadFromStorage(pk(pid, "edits"));
      const sc = await loadFromStorage(pk(pid, "creatives"));
      const scn = await loadFromStorage(pk(pid, "connections"));
      const sp = await loadFromStorage(pk(pid, "aiPrompt"));
      const scmm = await loadFromStorage(pk(pid, "comments"));
      const svar = await loadFromStorage(pk(pid, "variants"));
      const sapp = await loadFromStorage(pk(pid, "approval"));
      const stpl = await loadFromStorage(pk(pid, "templates"));
      const sss = await loadFromStorage(pk(pid, "snapshots"));
      const sh = await loadFromStorage(pk(pid, "history"));

      const base = getDefaultVarsForStrategy(project.strategy);
      if (sv && Array.isArray(sv)) {
        const merged = base.map(v => {
          const saved = sv.find(s => s.name === v.name);
          if (!saved) return v;
          return { ...v, value: saved.value ?? v.value, editable: saved.editable !== undefined ? saved.editable : v.editable };
        });
        setVars(merged);
      }
      if (se) setEdits(se);
      if (sc) setCreatives(sc);
      if (scn) setConnections(scn);
      const sncfg = await loadFromStorage(pk(pid, "notify_config"));
      if (sncfg) setNotifyConfig(sncfg);
      const scust = await loadFromStorage(pk(pid, "custom_msgs"));
      if (scust) setCustomMsgs(scust);
      const scap = await loadFromStorage(pk(pid, "captacion"));
      if (scap) setCaptacionConfig(scap);
      if (sp) setAIPrompt(sp);
      if (scmm) setCommentsByMsg(scmm);
      if (svar) setVariantsByMsg(svar);
      if (sapp) setApprovalByMsg(sapp);
      if (stpl) setTemplatesByMsg(stpl);
      if (sss) setSnapshots(sss);
      if (sh) setHistory(sh);
      setLoaded(true);
    })();
  }, [pid, project.strategy]);

  const debouncedSave = useCallback((key, val) => {
    if (!loaded) return;
    setSaveStatus("saving");
    const t = setTimeout(async () => {
      const ok = await saveToStorage(pk(pid, key), val);
      setSaveStatus(ok ? "synced" : "offline");
    }, 500);
    return () => clearTimeout(t);
  }, [loaded, pid]);

  useEffect(() => debouncedSave("vars", vars.map(v => ({ name: v.name, value: v.value, editable: v.editable }))), [vars, loaded, debouncedSave]);
  useEffect(() => debouncedSave("edits", edits), [edits, loaded, debouncedSave]);
  useEffect(() => debouncedSave("creatives", creatives), [creatives, loaded, debouncedSave]);
  useEffect(() => debouncedSave("connections", connections), [connections, loaded, debouncedSave]);
  useEffect(() => debouncedSave("notify_config", notifyConfig), [notifyConfig, loaded, debouncedSave]);
  useEffect(() => debouncedSave("custom_msgs", customMsgs), [customMsgs, loaded, debouncedSave]);
  useEffect(() => debouncedSave("captacion", captacionConfig), [captacionConfig, loaded, debouncedSave]);
  useEffect(() => debouncedSave("aiPrompt", aiPrompt), [aiPrompt, loaded, debouncedSave]);
  useEffect(() => debouncedSave("comments", commentsByMsg), [commentsByMsg, loaded, debouncedSave]);
  useEffect(() => debouncedSave("variants", variantsByMsg), [variantsByMsg, loaded, debouncedSave]);
  useEffect(() => debouncedSave("approval", approvalByMsg), [approvalByMsg, loaded, debouncedSave]);
  useEffect(() => debouncedSave("templates", templatesByMsg), [templatesByMsg, loaded, debouncedSave]);
  useEffect(() => debouncedSave("snapshots", snapshots), [snapshots, loaded, debouncedSave]);
  useEffect(() => debouncedSave("history", history), [history, loaded, debouncedSave]);

  const logHistory = (action, target) => {
    setHistory(h => [{ at: Date.now(), author: me || "Anónimo", action, target }, ...h].slice(0, 500));
  };

  const getCopy = (fk, msg, idx) => edits[`${fk}:${msg.id || idx}`] ?? msg.copy;

  const handleEditCopy = (key, value) => {
    setEdits(prev => {
      const next = { ...prev };
      if (value === null) delete next[key]; else next[key] = value;
      return next;
    });
    logHistory("editó copy", key);
  };

  const addComment = (msgKey, text) => {
    const c = { id: Date.now().toString(36), author: me || "Anónimo", text, at: Date.now() };
    setCommentsByMsg(prev => ({ ...prev, [msgKey]: [...(prev[msgKey] || []), c] }));
    logHistory("comentó", msgKey);
  };
  const removeComment = (msgKey, id) => {
    setCommentsByMsg(prev => ({ ...prev, [msgKey]: (prev[msgKey] || []).filter(c => c.id !== id) }));
  };
  const setVariants = (msgKey, v) => { setVariantsByMsg(prev => ({ ...prev, [msgKey]: v })); logHistory("editó A/B", msgKey); };

  // Adjuntar creativo desde MessageCard: si creative tiene id existente -> reasignar messageKey;
  // si no, crear nuevo creativo asociado al mensaje.
  const attachCreative = (msgKey, creative) => {
    setCreatives(prev => {
      if (creative && creative.id && prev.find(c => c.id === creative.id)) {
        return prev.map(c => c.id === creative.id ? { ...c, messageKey: msgKey } : c);
      }
      const newC = { ...creative, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), messageKey: msgKey };
      return [...prev, newC];
    });
    logHistory("adjuntó creativo", msgKey);
  };
  const removeCreativeAssoc = (msgKey, creativeId) => {
    setCreatives(prev => prev.map(c => c.id === creativeId ? { ...c, messageKey: "" } : c));
    logHistory("desvinculó creativo", msgKey);
  };

  // Mensajes custom (añadidos desde Mapa o Flujos)
  const addCustomMessage = (flowKey, draft) => {
    const id = "CUSTOM_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const newMsg = {
      id,
      dia: draft.dia || "",
      timing: draft.timing || draft.hora || "",
      hora: draft.hora || "",
      objetivo: draft.objetivo || "",
      copy: draft.copy || "",
      botones: draft.botones || "",
      position: typeof draft.position === "number" ? draft.position : undefined,
    };
    setCustomMsgs(prev => ({ ...prev, [flowKey]: [...(prev[flowKey] || []), newMsg] }));
    logHistory("añadió mensaje custom", `${flowKey}:${id}`);
    return id;
  };
  const removeCustomMessage = (flowKey, id) => {
    setCustomMsgs(prev => ({ ...prev, [flowKey]: (prev[flowKey] || []).filter(m => m.id !== id) }));
    logHistory("eliminó mensaje custom", `${flowKey}:${id}`);
  };

  // Estado para el modal de nuevo mensaje (desde Mapa o Flujos)
  const [newMsgState, setNewMsgState] = useState(null); // { flow, position }
  const openNewMsg = (flow, position) => setNewMsgState({ flow, position });

  // Envío real via Evolution API (solo para broadcasts y venta_comunidad)
  const handleEvolutionSend = async (params) => {
    const evo = connections.evolution;
    if (!evo?.server_url || !evo?.api_key || !evo?.instance) {
      alert("Falta configurar Evolution API en Conexiones (server URL, API key e instancia).");
      return { ok: false };
    }
    try {
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/evolution/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_url: evo.server_url,
          api_key: evo.api_key,
          instance: evo.instance,
          to: params.to,
          message: params.message,
          delay_ms: params.delay_ms || 0,
        }),
      });
      const data = await r.json();
      logHistory(data.ok ? "envió via Evolution" : "falló envío Evolution", params.msgKey || "");
      return data;
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  };
  const setApproval = (msgKey, a) => {
    setApprovalByMsg(prev => { const n = { ...prev }; if (a === null) delete n[msgKey]; else n[msgKey] = a; return n; });
    if (a) logHistory(a.status === "approved" ? "aprobó" : "pidió cambios", msgKey);
  };
  const setTemplateMeta = (msgKey, t) => { setTemplatesByMsg(prev => ({ ...prev, [msgKey]: t })); logHistory("editó template", msgKey); };

  const createSnapshot = (label) => {
    const snap = {
      id: Date.now().toString(36), label, at: Date.now(), author: me || "Anónimo",
      data: { vars, edits, creatives, connections, aiPrompt, commentsByMsg, variantsByMsg, approvalByMsg, templatesByMsg },
    };
    setSnapshots(s => [snap, ...s]);
    logHistory("creó snapshot", label);
    return snap.id;
  };
  const askConfirm = useConfirm();
  const restoreSnapshot = async (s) => {
    if (!(await askConfirm({ title: "Restaurar snapshot", message: `¿Restaurar el proyecto al estado "${s.label}"? Se reemplazan variables, ediciones, creativos, conexiones, aprobaciones y comentarios.`, confirmLabel: "Restaurar", danger: true }))) return;
    setVars(s.data.vars);
    setEdits(s.data.edits);
    setCreatives(s.data.creatives);
    setConnections(s.data.connections);
    setAIPrompt(s.data.aiPrompt);
    setCommentsByMsg(s.data.commentsByMsg || {});
    setVariantsByMsg(s.data.variantsByMsg || {});
    setApprovalByMsg(s.data.approvalByMsg || {});
    setTemplatesByMsg(s.data.templatesByMsg || {});
    logHistory("restauró snapshot", s.label);
  };
  const deleteSnapshot = async (id) => {
    if (!(await askConfirm({ title: "Eliminar snapshot", message: "¿Eliminar esta versión guardada?", confirmLabel: "Eliminar", danger: true }))) return;
    setSnapshots(s => s.filter(x => x.id !== id));
  };

  const resetVars = async () => {
    if (!(await askConfirm({ title: "Restaurar variables originales", message: "Perderás los valores custom de las variables editables de esta estrategia.", confirmLabel: "Restaurar", danger: true }))) return;
    setVars(getDefaultVarsForStrategy(project.strategy));
  };

  const totalMessages = FLOWS.reduce((s, f) => s + f.items.length, 0);
  const editCount = Object.keys(edits).filter(k => edits[k] !== undefined && edits[k] !== null).length;
  const undefinedVars = useMemo(() => {
    const used = new Set();
    FLOWS.forEach(f => f.items.forEach(m => { extractVarsUsed(m.copy).forEach(v => used.add(v)); extractVarsUsed(m.botones).forEach(v => used.add(v)); }));
    return [...used].filter(n => !vars.find(v => v.name === n) && !RUNTIME_VARS.has(n));
  }, [vars, FLOWS]);

  const allMessages = useMemo(() => {
    const list = [];
    FLOWS.forEach(f => f.items.forEach((m, i) => {
      const id = m.id || m.dia || `#${i + 1}`;
      list.push({ key: `${f.key}:${m.id || i}`, label: `${f.label} · ${id}`, excerpt: (m.copy || "").slice(0, 60) });
    }));
    return list;
  }, [FLOWS]);

  const current = FLOWS.find(f => f.key === activeFlow) || FLOWS[0];

  const exportAll = () => {
    const payload = {
      project: { id: project.id, name: project.name, client: project.client, strategy: project.strategy },
      generated_at: new Date().toISOString(),
      variables: vars.reduce((a, v) => { a[v.name] = v.value; return a; }, {}),
      runtime_variables: [...RUNTIME_VARS],
      flows: FLOWS.reduce((acc, f) => {
        acc[f.key] = f.items.map((m, i) => {
          const c = getCopy(f.key, m, i);
          const skip = computeSkipCondition(f.key, m);
          const mk = `${f.key}:${m.id || i}`;
          const msgCr = creatives.filter(cr => cr.messageKey === mk);
          const isMetaFlow = !(f.key === "broadcasts" || f.key === "venta_comunidad");
          const explicitTpl = templatesByMsg[mk];
          // Auto-generar meta_template para flujos individuales sin override manual
          const autoTpl = isMetaFlow && !(explicitTpl?.isTemplate)
            ? { isTemplate: true, auto: true, name: `waflow_${f.key}_${(m.id || i).toString().toLowerCase()}`, language: "es" }
            : null;
          const finalTpl = explicitTpl?.isTemplate ? explicitTpl : autoTpl;
          return {
            ...m, copy: c,
            copy_rendered: replaceVars(c, vars),
            botones_rendered: replaceVars(m.botones, vars),
            ...(skip ? { skip_condition: skip } : {}),
            ...(msgCr.length ? { creatives: msgCr } : {}),
            ...(variantsByMsg[mk]?.enabled ? { ab_variants: variantsByMsg[mk] } : {}),
            ...(finalTpl ? { meta_template: finalTpl } : {}),
            ...(approvalByMsg[mk] ? { approval: approvalByMsg[mk] } : {}),
          };
        });
        return acc;
      }, {}),
      ai_system_prompt_rendered: replaceVars(aiPrompt, vars),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${project.name.replace(/\W+/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const SaveIcon = saveStatus === "offline" ? CloudOff : saveStatus === "saving" ? Save : Cloud;
  const saveLabel = saveStatus === "offline" ? "Sin sincronizar" : saveStatus === "saving" ? "Guardando…" : "Guardado";

  const TABS = [
    { key: "autopilot", label: "Autopilot", icon: Zap },
    { key: "flows", label: "Flujos", icon: MessageCircle },
    { key: "mindmap", label: "Mapa", icon: Map },
    { key: "calendar", label: "Calendario", icon: CalIcon },
    { key: "simulator", label: "Simulador", icon: FlaskConical },
    { key: "checker", label: "Checker", icon: ClipboardCheck },
    { key: "creatives", label: "Creativos", icon: ImageIcon },
    { key: "monitoring", label: "Salud", icon: Activity },
    { key: "client", label: "Panel cliente", icon: Share2 },
    { key: "intake", label: "Checklist cliente", icon: ClipboardCheck },
    { key: "snapshots", label: "Versiones", icon: GitBranch },
    { key: "history", label: "Historial", icon: History },
    { key: "connections", label: "Conexiones", icon: Plug },
    { key: "captacion", label: "Captación", icon: Zap },
    { key: "ai", label: "Prompt IA", icon: Bot },
  ];

  const goToMessage = (flowKey, msgKey) => { setActiveFlow(flowKey); setActiveTab("flows"); setScrollToMsg(msgKey); };

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-6 py-3">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={onBack} data-testid="back-to-dashboard-btn" className="text-stone-500 hover:text-stone-900 p-1.5 rounded hover:bg-stone-100"><ArrowLeft size={16} /></button>
              <img src="/fascinads-logo.png" alt="Fascinads" className="h-5 w-auto select-none shrink-0" draggable="false" />
              <div className="h-6 w-px bg-stone-200" />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: project.color + "22", border: `2px solid ${project.color}` }}>{project.emoji}</div>
              <div className="min-w-0">
                <div className="text-sm font-bold tracking-tight text-stone-900 truncate">{project.name}{project.status === "frozen" && <span className="ml-2 text-[10px] bg-slate-800 text-white px-2 py-0.5 rounded font-semibold uppercase tracking-widest">🔒 Congelado</span>}</div>
                <div className="text-[10px] text-stone-500 truncate flex items-center gap-2 flex-wrap">
                  <span>{project.client || "Sin cliente"} · {strat?.emoji} {strat?.label}</span>
                  {project.created_by && (
                    <span data-testid="project-creator-badge" className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded">
                      <User size={9} /> Creado por {project.created_by}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] text-stone-500 hidden md:block">{totalMessages} msgs · {vars.length} vars {editCount > 0 && <span className="text-emerald-700">· {editCount} editados</span>} {undefinedVars.length > 0 && <span className="text-amber-700">· {undefinedVars.length} sin def</span>}</div>
              <div data-testid="connected-user-workspace" title={`Estás conectado como ${me || "sin nombre"}`}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                  {(me || "?").charAt(0).toUpperCase()}
                </span>
                <strong>{me || "sin nombre"}</strong>
              </div>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md ${saveStatus === "offline" ? "text-amber-700 bg-amber-50" : saveStatus === "saving" ? "text-stone-600 bg-stone-100" : "text-emerald-700 bg-emerald-50"}`}>
                <SaveIcon size={12} /> {saveLabel}
              </div>
              <button onClick={() => setShowVars(!showVars)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 border border-stone-300 rounded-md hover:border-stone-900">
                {showVars ? <Eye size={13} /> : <EyeOff size={13} />} {showVars ? "Con vars" : "Raw"}
              </button>
              <button onClick={exportAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700">
                <Download size={13} /> Exportar
              </button>
            </div>
          </div>
          <div className="flex gap-0.5 overflow-x-auto pb-1">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap ${activeTab === t.key ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"}`}>
                  <Icon size={13} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto flex">
        {activeTab === "autopilot" && (
          <main className="flex-1 min-w-0 px-8 py-8">
            <AutopilotPanel
              project={project}
              vars={vars}
              edits={edits}
              creatives={creatives}
              connections={connections}
              notifyConfig={notifyConfig}
              templatesByMsg={templatesByMsg}
              approvalByMsg={approvalByMsg}
              snapshots={snapshots}
              flows={FLOWS}
              onCreateSnapshot={(label) => {
                if (label) return createSnapshot(label);
                const userLabel = prompt("Etiqueta del snapshot:", `Autopilot · ${new Date().toLocaleDateString("es-ES")}`);
                if (userLabel) return createSnapshot(userLabel);
                return null;
              }}
              onFreezeToggle={() => {
                const newStatus = project.status === "frozen" ? "active" : "frozen";
                onUpdateProject && onUpdateProject(project.id, { status: newStatus });
                logHistory(newStatus === "frozen" ? "congeló proyecto" : "descongeló proyecto", "");
              }}
              onGoToTab={(tab) => setActiveTab(tab)}
              onUpdateProject={onUpdateProject}
            />
          </main>
        )}
        {activeTab === "flows" && (
          <>
            <aside className="w-80 shrink-0 border-r border-stone-200 bg-white min-h-[calc(100vh-105px)]">
              <div className="flex border-b border-stone-200">
                <button onClick={() => setSidebarTab("flows")} className={`flex-1 py-3 text-xs font-semibold tracking-widest uppercase ${sidebarTab === "flows" ? "text-stone-900 border-b-2 border-stone-900" : "text-stone-500 hover:text-stone-900"}`}>Flujos</button>
                <button onClick={() => setSidebarTab("vars")} className={`flex-1 py-3 text-xs font-semibold tracking-widest uppercase ${sidebarTab === "vars" ? "text-stone-900 border-b-2 border-stone-900" : "text-stone-500 hover:text-stone-900"}`}>Variables</button>
              </div>
              <div className="p-5">
                {sidebarTab === "flows" ? (
                  <div className="space-y-1">
                    {FLOWS.map(f => {
                      const Icon = f.icon;
                      const isActive = activeFlow === f.key;
                      return (
                        <button key={f.key} onClick={() => setActiveFlow(f.key)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left ${isActive ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"}`}>
                          <Icon size={15} style={{ color: f.color }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{f.label}</div>
                            <div className={`text-[10px] ${isActive ? "text-stone-400" : "text-stone-500"}`}>{f.items.length} mensajes{f.branching && " · ramas"}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <VariablesPanel vars={vars} setVars={setVars} search={search} setSearch={setSearch} onReset={resetVars} />
                )}
              </div>
            </aside>
            <main className="flex-1 min-w-0 px-8 py-8">
              <div className="mb-6">
                <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-1">Flujo</div>
                <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{current?.label}</h1>
                <div className="text-sm text-stone-500 mt-1">{current?.items.length} mensajes</div>
              </div>
              {current && <FlowView flow={current} vars={vars} showVars={showVars} onPreview={setPreviewMsg}
                edits={edits} onEditCopy={handleEditCopy} creatives={creatives}
                commentsByMsg={commentsByMsg} onAddComment={addComment} onRemoveComment={removeComment}
                variantsByMsg={variantsByMsg} onSaveVariants={setVariants}
                approvalByMsg={approvalByMsg} onSetApproval={setApproval}
                templatesByMsg={templatesByMsg} onSetTemplateMeta={setTemplateMeta}
                me={me}
                onAttachCreative={attachCreative}
                onRemoveCreativeAssoc={removeCreativeAssoc}
                onAddCustomMessage={openNewMsg}
                onRemoveCustomMessage={removeCustomMessage}
                evolutionConfig={connections.evolution || null}
                onEvolutionSend={handleEvolutionSend}
                projectId={project.id}
              />}
            </main>
          </>
        )}

        {activeTab === "mindmap" && <main className="flex-1 min-w-0 px-8 py-8"><MindMap strategyKey={project.strategy} flows={FLOWS} onFlowClick={fk => { setActiveFlow(fk); setActiveTab("flows"); }} onAddMessage={openNewMsg} /></main>}
        {activeTab === "calendar" && <main className="flex-1 min-w-0 px-8 py-8"><CalendarPanel flows={FLOWS} vars={vars} /></main>}
        {activeTab === "simulator" && <main className="flex-1 min-w-0 px-8 py-8"><SimulatorPanel flows={FLOWS} vars={vars} edits={edits} /></main>}
        {activeTab === "checker" && <main className="flex-1 min-w-0 px-8 py-8"><CheckerPanel flows={FLOWS} vars={vars} edits={edits} creatives={creatives} templatesByMsg={templatesByMsg} variantsByMsg={variantsByMsg} onGoToMessage={goToMessage} /></main>}
        {activeTab === "creatives" && <main className="flex-1 min-w-0 px-8 py-8"><CreativesPanel creatives={creatives} setCreatives={setCreatives} allMessages={allMessages} /></main>}
        {activeTab === "monitoring" && <main className="flex-1 min-w-0 px-8 py-8"><MonitoringPanel flows={FLOWS} projectId={project.id} /></main>}
        {activeTab === "client" && <main className="flex-1 min-w-0 px-8 py-8"><ClientReviewPanel flows={FLOWS} vars={vars} edits={edits} approvalByMsg={approvalByMsg} onSetApproval={setApproval} me={me} projectName={project.name} projectId={project.id} /></main>}
        {activeTab === "intake" && <main className="flex-1 min-w-0 px-8 py-8"><IntakePanel projectId={project.id} projectName={project.name} vars={vars} flows={FLOWS} creatives={creatives} /></main>}
        {activeTab === "snapshots" && <main className="flex-1 min-w-0 px-8 py-8"><SnapshotsPanel snapshots={snapshots} onCreate={createSnapshot} onRestore={restoreSnapshot} onDelete={deleteSnapshot} /></main>}
        {activeTab === "history" && <main className="flex-1 min-w-0 px-8 py-8"><HistoryPanel history={history} /></main>}
        {activeTab === "connections" && <main className="flex-1 min-w-0 px-8 py-8"><ConnectionsPanel conn={connections} setConn={setConnections} projectName={project.name} notifyConfig={notifyConfig} setNotifyConfig={setNotifyConfig} /></main>}
        {activeTab === "ai" && <main className="flex-1 min-w-0 px-8 py-8"><AIPromptPanel aiPrompt={aiPrompt} setAIPrompt={setAIPrompt} vars={vars} /></main>}
        {activeTab === "captacion" && <main className="flex-1 min-w-0 px-8 py-8"><CaptacionPanel config={captacionConfig} setConfig={setCaptacionConfig} projectName={project.name} n8nWebhookUrl={connections.n8nWebhookUrl} /></main>}
      </div>

      {previewMsg && <WhatsAppPreview msg={{ ...previewMsg, copy: edits[`${activeFlow}:${previewMsg.id}`] ?? previewMsg.copy }} vars={vars} onClose={() => setPreviewMsg(null)} />}
      {newMsgState && (
        <NewMessageModal
          flow={newMsgState.flow}
          defaultPosition={newMsgState.position}
          onSave={(draft) => { addCustomMessage(newMsgState.flow.key, draft); setNewMsgState(null); }}
          onClose={() => setNewMsgState(null)}
        />
      )}
    </div>
  );
}


// ====================================================================
// APP RAÍZ — gestión proyectos
// ====================================================================
function MainApp() {
  const askConfirm = useConfirm();
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [me, setMe] = useState("");
  const [showProjectDialog, setShowProjectDialog] = useState(null); // { isNew, project }
  const [showMeDialog, setShowMeDialog] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const ps = await loadFromStorage(K_PROJECTS);
      const act = await loadFromStorage(K_ACTIVE);
      const m = await loadFromStorage(K_ME, false); // me es local (no compartido)
      if (ps) setProjects(ps);
      if (act) setActiveId(act);
      if (m) setMe(m);
      else setShowMeDialog(true); // pedir nombre si no hay
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) saveToStorage(K_PROJECTS, projects); }, [projects, loaded]);
  useEffect(() => { if (loaded) saveToStorage(K_ACTIVE, activeId); }, [activeId, loaded]);
  useEffect(() => { if (loaded && me) saveToStorage(K_ME, me, false); }, [me, loaded]);

  const activeProject = projects.find(p => p.id === activeId);

  const handleCreate = (draft) => {
    setProjects(ps => [draft, ...ps]);
    setShowProjectDialog(null);
  };
  const handleSaveEdit = (draft) => {
    setProjects(ps => ps.map(p => p.id === draft.id ? draft : p));
    setShowProjectDialog(null);
  };
  const handleDuplicate = async (p) => {
    const copy = newProject({ name: p.name + " (copia)", strategy: p.strategy, client: p.client, notes: p.notes, emoji: p.emoji, color: p.color });
    // Clonar datos del proyecto original
    const keys = ["vars", "edits", "creatives", "connections", "aiPrompt", "comments", "variants", "approval", "templates"];
    for (const k of keys) {
      const v = await loadFromStorage(pk(p.id, k));
      if (v !== null) await saveToStorage(pk(copy.id, k), v);
    }
    setProjects(ps => [copy, ...ps]);
  };
  const handleArchive = (p) => {
    setProjects(ps => ps.map(x => x.id === p.id ? { ...x, status: x.status === "archived" ? "active" : "archived", updated_at: Date.now() } : x));
  };
  const handleUpdateProject = (id, patch) => {
    setProjects(ps => ps.map(x => x.id === id ? { ...x, ...patch, updated_at: Date.now() } : x));
  };
  const handleDelete = async (p) => {
    const ok = await askConfirm({
      title: `Eliminar "${p.name}"`,
      message: `¿Seguro que quieres eliminar este proyecto DEFINITIVAMENTE?\n\nTodos sus datos (variables, ediciones, creativos, conexiones, aprobaciones, snapshots, historial) se perderán y no se puede deshacer.`,
      confirmLabel: "Eliminar definitivamente",
      danger: true,
    });
    if (!ok) return;
    const keys = ["vars", "edits", "creatives", "connections", "notify_config", "aiPrompt", "comments", "variants", "approval", "templates", "snapshots", "history", "captacion"];
    for (const k of keys) await deleteFromStorage(pk(p.id, k));
    setProjects(ps => ps.filter(x => x.id !== p.id));
    if (activeId === p.id) setActiveId(null);
  };

  if (!loaded) return <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-500 text-sm">Cargando...</div>;

  return (
    <>
      {activeProject ? (
        <ProjectWorkspace project={activeProject} onBack={() => setActiveId(null)} me={me} onUpdateProject={handleUpdateProject} />
      ) : (
        <ProjectsDashboard
          projects={projects}
          onOpen={id => setActiveId(id)}
          onCreate={() => setShowProjectDialog({ isNew: true, project: null })}
          onEdit={p => setShowProjectDialog({ isNew: false, project: p })}
          onDuplicate={handleDuplicate}
          onArchive={handleArchive}
          onDelete={handleDelete}
          me={me}
          onEditMe={() => setShowMeDialog(true)}
        />
      )}

      {showProjectDialog && (
        <ProjectDialog
          project={showProjectDialog.project}
          isNew={showProjectDialog.isNew}
          me={me}
          onSave={showProjectDialog.isNew ? handleCreate : handleSaveEdit}
          onClose={() => setShowProjectDialog(null)}
        />
      )}

      {showMeDialog && (
        <MeDialog me={me} onSave={n => { setMe(n); setShowMeDialog(false); }} onClose={() => setShowMeDialog(false)} />
      )}
    </>
  );
}

// Router manual: /review/:token → PublicReviewPage, /intake/:token → PublicIntakePage, resto → MainApp
export default function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const reviewMatch = path.match(/^\/review\/([A-Za-z0-9_-]+)\/?$/);
  const intakeMatch = path.match(/^\/intake\/([A-Za-z0-9_-]+)\/?$/);
  return (
    <ConfirmProvider>
      {reviewMatch ? <PublicReviewPage token={reviewMatch[1]} />
        : intakeMatch ? <PublicIntakePage token={intakeMatch[1]} />
        : <MainApp />}
    </ConfirmProvider>
  );
}
