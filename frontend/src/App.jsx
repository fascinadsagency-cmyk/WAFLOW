import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Copy, Check, Download, Search, MessageCircle, Radio, DollarSign, Users,
  PlayCircle, ChevronDown, ChevronRight, FileJson, Eye, EyeOff, Smartphone,
  X, RotateCcw, Save, Cloud, CloudOff, Map, Image as ImageIcon, Plug, Bot,
  Upload, Link as LinkIcon, Send, AlertTriangle, Trash2, Play, ArrowLeft,
  Plus, Folder, Archive, Edit3, Calendar as CalIcon, GitBranch, Clock, Activity,
  History, FlaskConical, FileCheck, MessageSquare, CheckCircle2, AlertCircle,
  Share2, ExternalLink, ClipboardCheck, GitCommit, TrendingUp, Zap
} from "lucide-react";

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

function newProject({ name, strategy, client, notes, emoji, color } = {}) {
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
                <div key={i} className="bg-white rounded-lg px-3 py-2.5 text-center text-[13px] font-medium text-[#00A5F4] shadow-sm cursor-pointer hover:bg-stone-50">{b}</div>
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
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showAB, setShowAB] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [newComment, setNewComment] = useState("");

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
    if (!templateMeta || !templateMeta.isTemplate) return null;
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
                  <button onClick={e => { e.stopPropagation(); setShowComments(!showComments); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-600 border border-stone-300 rounded-md hover:border-stone-900">
                    <MessageSquare size={12} /> {comments.length}
                  </button>
                  <CopyButton text={rendered} />
                </div>
              </div>
              {editing ? (
                <div>
                  <textarea value={effectiveCopy} onChange={e => onEditCopy(e.target.value)}
                    className="w-full min-h-[160px] p-3 text-sm font-mono bg-white border border-stone-300 rounded-md focus:outline-none focus:border-stone-900" />
                  {isEdited && <button onClick={() => onEditCopy(null)} className="mt-2 text-[11px] text-stone-500 hover:text-stone-900">↺ Volver al original</button>}
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
                <div key={i} className="bg-white border border-indigo-200 rounded-md p-2 mb-2">
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
    </div>
  );
}

function FlowView({
  flow, vars, showVars, onPreview, edits, onEditCopy, creatives,
  commentsByMsg, onAddComment, onRemoveComment,
  variantsByMsg, onSaveVariants,
  approvalByMsg, onSetApproval,
  templatesByMsg, onSetTemplateMeta,
  me,
}) {
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
        me={me}
      />
    );
  };
  if (flow.branching) {
    const branches = buildBranches(flow.items);
    return (
      <div className="space-y-6">
        {Object.entries(branches).map(([bname, items]) => (
          <div key={bname}>
            <div className="sticky top-[105px] bg-stone-50 py-2 z-10">
              <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-0.5">{bname === "main" ? "Secuencia principal" : bname}</div>
              <div className="h-px bg-stone-200" />
            </div>
            <div className="space-y-2 mt-3">{items.map((m, i) => renderMsg(m, i, bname))}</div>
          </div>
        ))}
      </div>
    );
  }
  return <div className="space-y-2">{flow.items.map((m, i) => renderMsg(m, i, flow.key))}</div>;
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

function ProjectDialog({ project, onSave, onClose, isNew }) {
  const [draft, setDraft] = useState(project || newProject());
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 border border-stone-300 rounded-md hover:border-stone-900">
              👤 {me || "Sin nombre"}
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
                    <div className="text-[10px] text-stone-400 mt-2">Actualizado {new Date(p.updated_at || p.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</div>
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
function MindMap({ strategyKey, onFlowClick }) {
  const flows = getFlowsForStrategy(strategyKey);

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
    return <MindMapSVG nodes={nodes} edges={edges} onFlowClick={onFlowClick} viewBox="0 0 1320 480" />;
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
  return <MindMapSVG nodes={nodes} edges={edges} onFlowClick={onFlowClick} viewBox="0 0 1300 400" />;
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
              <g key={i}>
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
                  <text key={i} x={n.x} y={n.y - ((arr.length - 1) * 6) + (i * 13)} textAnchor="middle" fontSize="11" fill="white" fontWeight={i === 0 ? "600" : "400"}>{line}</text>
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
function ConnectionsPanel({ conn, setConn, projectName }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("Mensaje de prueba ✅");

  const update = (k, v) => setConn({ ...conn, [k]: v });

  const sendTest = async () => {
    if (!conn.phoneNumberId || !conn.accessToken || !testPhone) { setTestResult({ ok: false, msg: "Faltan: Phone Number ID, Access Token o teléfono" }); return; }
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${conn.phoneNumberId}/messages`, {
        method: "POST", headers: { "Authorization": `Bearer ${conn.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: testPhone.replace(/\D/g, ""), type: "text", text: { body: testMsg } })
      });
      const data = await r.json();
      if (r.ok) setTestResult({ ok: true, msg: `✓ Enviado. ID: ${data.messages?.[0]?.id || "?"}` });
      else setTestResult({ ok: false, msg: `Error ${r.status}: ${data.error?.message || "desconocido"}` });
    } catch (e) { setTestResult({ ok: false, msg: "Red: " + e.message }); }
    setTesting(false);
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Display phone" value={conn.displayPhone} onChange={v => update("displayPhone", v)} placeholder="+34 612 345 678" />
          <Field label="Phone Number ID" value={conn.phoneNumberId} onChange={v => update("phoneNumberId", v)} mono />
          <Field label="WABA ID" value={conn.wabaId} onChange={v => update("wabaId", v)} mono />
          <Field label="App ID" value={conn.appId} onChange={v => update("appId", v)} mono />
          <Field label="Access Token" value={conn.accessToken} onChange={v => update("accessToken", v)} mono password full />
          <Field label="App Secret" value={conn.appSecret} onChange={v => update("appSecret", v)} mono password />
          <Field label="Webhook Verify Token" value={conn.webhookVerifyToken} onChange={v => update("webhookVerifyToken", v)} mono />
        </div>
      </div>
      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded bg-[#EA4B71] flex items-center justify-center text-white text-xs font-bold">n8n</div>
          <div className="font-semibold">n8n</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Webhook URL (Meta → n8n)" value={conn.n8nWebhookUrl} onChange={v => update("n8nWebhookUrl", v)} mono full />
          <Field label="n8n API URL" value={conn.n8nApiUrl} onChange={v => update("n8nApiUrl", v)} mono />
          <Field label="n8n API Key" value={conn.n8nApiKey} onChange={v => update("n8nApiKey", v)} mono password />
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
            <button onClick={sendTest} disabled={testing} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-md disabled:opacity-50">
              <Send size={14} /> {testing ? "Enviando..." : "Enviar"}
            </button>
            {testResult && <div className={`text-xs ${testResult.ok ? "text-emerald-700" : "text-red-700"}`}>{testResult.msg}</div>}
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
// PROMPT IA
// ====================================================================
function AIPromptPanel({ aiPrompt, setAIPrompt, vars }) {
  const [preview, setPreview] = useState(false);
  const rendered = replaceVars(aiPrompt, vars);
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Prompt del asistente IA</h2>
        <p className="text-xs text-stone-500 mt-0.5">System prompt para nodo IA en n8n</p>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setPreview(false)} className={`px-3 py-1.5 text-xs font-medium rounded-md border ${!preview ? "bg-stone-900 text-white border-stone-900" : "bg-white border-stone-200"}`}>Editar</button>
          <button onClick={() => setPreview(true)} className={`px-3 py-1.5 text-xs font-medium rounded-md border ${preview ? "bg-stone-900 text-white border-stone-900" : "bg-white border-stone-200"}`}>Preview</button>
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
          className="w-full min-h-[500px] p-5 text-sm font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900 leading-relaxed" />
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
                    ? <span key={i} className="text-stone-400 self-center">→</span>
                    : <span key={i} className="px-2 py-1 rounded-md text-white text-[10px] font-medium" style={{ backgroundColor: step.color }}>{step.label}</span>
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
            <div key={idx} className="bg-white border border-stone-200 rounded-lg overflow-hidden">
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
                      <li key={i} className="text-[12px] text-stone-700 flex items-start gap-2">
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
                      <div key={i} className="flex items-start gap-2 text-[12px]">
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
                <div key={i} className="flex items-start gap-3">
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

function MonitoringPanel({ flows }) {
  const [events] = useState(() => generateMockEvents(flows));
  const [filter, setFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");

  const filtered = events.filter(e => (filter === "all" || e.type === filter) && (flowFilter === "all" || e.flow === flowFilter));
  const failed = events.filter(e => e.type === "message_failed");
  const stats = useMemo(() => ({
    sent: events.filter(e => e.type === "message_sent").length,
    delivered: events.filter(e => e.type === "message_delivered").length,
    read: events.filter(e => e.type === "message_read").length,
    clicked: events.filter(e => e.type === "button_clicked").length,
    replied: events.filter(e => e.type === "reply_received").length,
    failed: failed.length,
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
          <p className="text-xs text-stone-500 mt-0.5">Monitoreo en tiempo real · <span className="text-amber-700 font-medium">datos simulados — conectar a n8n pendiente</span></p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-emerald-50 border border-emerald-200 rounded-md text-emerald-700">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Mock activo
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
              <div key={i} className={`flex items-start gap-3 p-3 rounded-md border ${color}`}>
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
              <div key={i} className="mb-2">
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
                    <button key={i} onClick={() => chooseNext(b)} className="w-full bg-white rounded-lg px-3 py-2 text-left text-[13px] text-[#00A5F4] shadow-sm border border-stone-200 hover:bg-stone-50">
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
                  <li key={i} className="flex items-start gap-2">
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
                    <div key={i} className="px-4 py-2 flex items-center gap-3 text-[12px]">
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
                        {btns.map((b, j) => <div key={j} className="bg-white rounded-lg px-3 py-2 text-center text-[13px] font-medium text-[#00A5F4] shadow-sm">{b}</div>)}
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
            <div key={i} className="bg-white border border-stone-200 rounded-md px-3 py-2 flex items-center justify-between gap-2 text-[12px]">
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
// PROJECT WORKSPACE — todo el editor de un proyecto
// ====================================================================
function ProjectWorkspace({ project, onBack, me }) {
  const strat = STRATEGY_TEMPLATES[project.strategy];
  const FLOWS = useMemo(() => getFlowsForStrategy(project.strategy), [project.strategy]);

  // Estados por proyecto
  const [vars, setVars] = useState(getDefaultVarsForStrategy(project.strategy));
  const [edits, setEdits] = useState({});
  const [creatives, setCreatives] = useState([]);
  const [connections, setConnections] = useState({});
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

  useEffect(() => debouncedSave("vars", vars.map(v => ({ name: v.name, value: v.value, editable: v.editable }))), [vars, loaded]);
  useEffect(() => debouncedSave("edits", edits), [edits, loaded]);
  useEffect(() => debouncedSave("creatives", creatives), [creatives, loaded]);
  useEffect(() => debouncedSave("connections", connections), [connections, loaded]);
  useEffect(() => debouncedSave("captacion", captacionConfig), [captacionConfig, loaded]);
  useEffect(() => debouncedSave("aiPrompt", aiPrompt), [aiPrompt, loaded]);
  useEffect(() => debouncedSave("comments", commentsByMsg), [commentsByMsg, loaded]);
  useEffect(() => debouncedSave("variants", variantsByMsg), [variantsByMsg, loaded]);
  useEffect(() => debouncedSave("approval", approvalByMsg), [approvalByMsg, loaded]);
  useEffect(() => debouncedSave("templates", templatesByMsg), [templatesByMsg, loaded]);
  useEffect(() => debouncedSave("snapshots", snapshots), [snapshots, loaded]);
  useEffect(() => debouncedSave("history", history), [history, loaded]);

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
  };
  const restoreSnapshot = (s) => {
    if (!confirm(`¿Restaurar proyecto al estado "${s.label}"?`)) return;
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
  const deleteSnapshot = (id) => { if (confirm("¿Eliminar snapshot?")) setSnapshots(s => s.filter(x => x.id !== id)); };

  const resetVars = () => {
    if (!confirm("¿Restaurar variables originales de esta estrategia?")) return;
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
          return {
            ...m, copy: c,
            copy_rendered: replaceVars(c, vars),
            botones_rendered: replaceVars(m.botones, vars),
            ...(skip ? { skip_condition: skip } : {}),
            ...(msgCr.length ? { creatives: msgCr } : {}),
            ...(variantsByMsg[mk]?.enabled ? { ab_variants: variantsByMsg[mk] } : {}),
            ...(templatesByMsg[mk]?.isTemplate ? { meta_template: templatesByMsg[mk] } : {}),
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
    { key: "flows", label: "Flujos", icon: MessageCircle },
    { key: "mindmap", label: "Mapa", icon: Map },
    { key: "calendar", label: "Calendario", icon: CalIcon },
    { key: "simulator", label: "Simulador", icon: FlaskConical },
    { key: "checker", label: "Checker", icon: ClipboardCheck },
    { key: "creatives", label: "Creativos", icon: ImageIcon },
    { key: "monitoring", label: "Salud", icon: Activity },
    { key: "client", label: "Panel cliente", icon: Share2 },
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
              <button onClick={onBack} className="text-stone-500 hover:text-stone-900 p-1.5 rounded hover:bg-stone-100"><ArrowLeft size={16} /></button>
              <img src="/fascinads-logo.png" alt="Fascinads" className="h-5 w-auto select-none shrink-0" draggable="false" />
              <div className="h-6 w-px bg-stone-200" />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: project.color + "22", border: `2px solid ${project.color}` }}>{project.emoji}</div>
              <div className="min-w-0">
                <div className="text-sm font-bold tracking-tight text-stone-900 truncate">{project.name}</div>
                <div className="text-[10px] text-stone-500 truncate">{project.client || "Sin cliente"} · {strat?.emoji} {strat?.label}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] text-stone-500 hidden md:block">{totalMessages} msgs · {vars.length} vars {editCount > 0 && <span className="text-emerald-700">· {editCount} editados</span>} {undefinedVars.length > 0 && <span className="text-amber-700">· {undefinedVars.length} sin def</span>}</div>
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
                me={me} />}
            </main>
          </>
        )}

        {activeTab === "mindmap" && <main className="flex-1 min-w-0 px-8 py-8"><MindMap strategyKey={project.strategy} onFlowClick={fk => { setActiveFlow(fk); setActiveTab("flows"); }} /></main>}
        {activeTab === "calendar" && <main className="flex-1 min-w-0 px-8 py-8"><CalendarPanel flows={FLOWS} vars={vars} /></main>}
        {activeTab === "simulator" && <main className="flex-1 min-w-0 px-8 py-8"><SimulatorPanel flows={FLOWS} vars={vars} edits={edits} /></main>}
        {activeTab === "checker" && <main className="flex-1 min-w-0 px-8 py-8"><CheckerPanel flows={FLOWS} vars={vars} edits={edits} creatives={creatives} templatesByMsg={templatesByMsg} variantsByMsg={variantsByMsg} onGoToMessage={goToMessage} /></main>}
        {activeTab === "creatives" && <main className="flex-1 min-w-0 px-8 py-8"><CreativesPanel creatives={creatives} setCreatives={setCreatives} allMessages={allMessages} /></main>}
        {activeTab === "monitoring" && <main className="flex-1 min-w-0 px-8 py-8"><MonitoringPanel flows={FLOWS} /></main>}
        {activeTab === "client" && <main className="flex-1 min-w-0 px-8 py-8"><ClientReviewPanel flows={FLOWS} vars={vars} edits={edits} approvalByMsg={approvalByMsg} onSetApproval={setApproval} me={me} projectName={project.name} projectId={project.id} /></main>}
        {activeTab === "snapshots" && <main className="flex-1 min-w-0 px-8 py-8"><SnapshotsPanel snapshots={snapshots} onCreate={createSnapshot} onRestore={restoreSnapshot} onDelete={deleteSnapshot} /></main>}
        {activeTab === "history" && <main className="flex-1 min-w-0 px-8 py-8"><HistoryPanel history={history} /></main>}
        {activeTab === "connections" && <main className="flex-1 min-w-0 px-8 py-8"><ConnectionsPanel conn={connections} setConn={setConnections} projectName={project.name} /></main>}
        {activeTab === "ai" && <main className="flex-1 min-w-0 px-8 py-8"><AIPromptPanel aiPrompt={aiPrompt} setAIPrompt={setAIPrompt} vars={vars} /></main>}
        {activeTab === "captacion" && <main className="flex-1 min-w-0 px-8 py-8"><CaptacionPanel config={captacionConfig} setConfig={setCaptacionConfig} projectName={project.name} n8nWebhookUrl={connections.n8nWebhookUrl} /></main>}
      </div>

      {previewMsg && <WhatsAppPreview msg={{ ...previewMsg, copy: edits[`${activeFlow}:${previewMsg.id}`] ?? previewMsg.copy }} vars={vars} onClose={() => setPreviewMsg(null)} />}
    </div>
  );
}

// ====================================================================
// PUBLIC REVIEW PAGE — vista pública accesible por /review/:token
// No requiere login. Solo lectura del copy + aprobar / pedir cambios.
// ====================================================================
function PublicReviewPage({ token }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [reviewerName, setReviewerName] = useState("");
  const [savedReviewer, setSavedReviewer] = useState(false);
  const [saving, setSaving] = useState({}); // por msgKey
  const [commentOpen, setCommentOpen] = useState({});
  const [commentText, setCommentText] = useState({});
  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/review/${token}`);
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.detail || "Link no válido");
        }
        const data = await r.json();
        setState({ loading: false, error: null, data });
      } catch (e) {
        setState({ loading: false, error: e.message, data: null });
      }
    })();
    // Recuperar nombre del revisor previo (localStorage)
    try {
      const n = localStorage.getItem("waflow:reviewer_name");
      if (n) { setReviewerName(n); setSavedReviewer(true); }
    } catch {}
  }, [token]);

  const saveReviewer = () => {
    if (!reviewerName.trim()) return;
    try { localStorage.setItem("waflow:reviewer_name", reviewerName.trim()); } catch {}
    setSavedReviewer(true);
  };

  const setApproval = async (msgKey, status, comment) => {
    if (!savedReviewer || !reviewerName.trim()) {
      alert("Por favor escribe tu nombre antes de aprobar o pedir cambios.");
      return;
    }
    setSaving(s => ({ ...s, [msgKey]: true }));
    try {
      const r = await fetch(`${API}/review/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msgKey, status, by: reviewerName.trim(), comment: comment || null }),
      });
      if (!r.ok) throw new Error("No se pudo guardar");
      // Actualizar estado local
      setState(prev => {
        const newApproval = { ...(prev.data.approval || {}) };
        if (status === null) delete newApproval[msgKey];
        else newApproval[msgKey] = { status, by: reviewerName.trim(), at: Date.now(), ...(comment ? { comment } : {}) };
        return { ...prev, data: { ...prev.data, approval: newApproval } };
      });
    } catch (e) {
      alert("Error al guardar: " + e.message);
    } finally {
      setSaving(s => ({ ...s, [msgKey]: false }));
    }
  };

  if (state.loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="text-stone-500 text-sm">Cargando revisión...</div>
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="bg-white border border-red-200 rounded-xl p-6 max-w-md text-center">
          <div className="text-red-600 font-semibold mb-2">🔒 Link no válido</div>
          <div className="text-sm text-stone-600">{state.error}</div>
          <div className="text-[11px] text-stone-400 mt-3">Pide a tu contacto que te envíe un link actualizado.</div>
        </div>
      </div>
    );
  }

  const { project, vars, edits, approval } = state.data;
  const flows = getFlowsForStrategy(project.strategy);
  const total = flows.reduce((s, f) => s + f.items.length, 0);
  const approvedCount = Object.values(approval || {}).filter(a => a?.status === "approved").length;
  const changesCount = Object.values(approval || {}).filter(a => a?.status === "changes").length;

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/fascinads-logo.png" alt="Fascinads" className="h-5 w-auto select-none" draggable="false" />
            <div className="h-5 w-px bg-stone-200" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-stone-500">Revisión</div>
              <div className="text-sm font-bold text-stone-900 truncate">{project.name}</div>
            </div>
          </div>
          <div className="text-[10px] text-stone-500 text-right">
            <div>{approvedCount}/{total} aprobados</div>
            {changesCount > 0 && <div className="text-amber-700">{changesCount} con cambios</div>}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        {/* Nombre del revisor */}
        <div className="bg-white border border-stone-200 rounded-xl p-4 mb-5" data-testid="reviewer-name-card">
          <div className="text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2">Antes de empezar</div>
          {!savedReviewer ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input autoFocus value={reviewerName} onChange={e => setReviewerName(e.target.value)} placeholder="Tu nombre"
                data-testid="reviewer-name-input"
                className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900"
                onKeyDown={e => e.key === "Enter" && saveReviewer()} />
              <button onClick={saveReviewer} disabled={!reviewerName.trim()}
                data-testid="reviewer-name-save"
                className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700 disabled:opacity-50">
                Entrar a revisar
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm text-stone-800">Revisando como <strong>{reviewerName}</strong></div>
              <button onClick={() => { setSavedReviewer(false); }} className="text-[11px] text-stone-500 hover:text-stone-900 underline">Cambiar</button>
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl p-5 text-white mb-5">
          <div className="text-[11px] uppercase tracking-widest opacity-75">Progreso de revisión</div>
          <div className="text-lg font-bold mt-1">{approvedCount} de {total} mensajes aprobados</div>
          <div className="mt-3 bg-white/20 rounded-full h-2">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${total > 0 ? (approvedCount / total * 100) : 0}%` }} />
          </div>
        </div>

        {flows.map(f => (
          <div key={f.key} className="mb-6">
            <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-3">{f.label}</div>
            <div className="space-y-3">
              {f.items.map((m, i) => {
                const mk = `${f.key}:${m.id || i}`;
                const copy = replaceVars(edits?.[mk] ?? m.copy, vars);
                const btns = parseButtons(replaceVars(m.botones, vars));
                const app = approval?.[mk];
                const isOpen = commentOpen[mk];
                const isSaving = saving[mk];

                return (
                  <div key={mk} className={`bg-white rounded-xl overflow-hidden border-2 transition ${
                    app?.status === "approved" ? "border-emerald-300" :
                    app?.status === "changes" ? "border-amber-300" : "border-stone-200"
                  }`} data-testid={`review-msg-${mk}`}>
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
                          {btns.map((b, j) => <div key={j} className="bg-white rounded-lg px-3 py-2 text-center text-[13px] font-medium text-[#00A5F4] shadow-sm">{b}</div>)}
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-3 border-t border-stone-200 bg-white flex items-center gap-2 flex-wrap">
                      <button onClick={() => setApproval(mk, "approved")} disabled={isSaving}
                        data-testid={`approve-btn-${mk}`}
                        className={`text-xs px-3 py-1.5 rounded-md border font-medium transition ${app?.status === "approved" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50"} disabled:opacity-50`}>
                        ✓ Aprobar
                      </button>
                      <button onClick={() => setCommentOpen(p => ({ ...p, [mk]: !p[mk] }))} disabled={isSaving}
                        data-testid={`changes-btn-${mk}`}
                        className={`text-xs px-3 py-1.5 rounded-md border font-medium transition ${app?.status === "changes" ? "bg-amber-600 text-white border-amber-600" : "bg-white border-amber-300 text-amber-700 hover:bg-amber-50"} disabled:opacity-50`}>
                        ✎ Pedir cambios
                      </button>
                      {app && <button onClick={() => setApproval(mk, null)} disabled={isSaving} className="text-xs text-stone-500 hover:text-stone-900 disabled:opacity-50">Borrar estado</button>}
                      {isSaving && <span className="text-[10px] text-stone-400">guardando…</span>}
                    </div>
                    {isOpen && (
                      <div className="px-4 py-3 border-t border-stone-200 bg-stone-50">
                        <textarea value={commentText[mk] || ""} onChange={e => setCommentText({ ...commentText, [mk]: e.target.value })}
                          placeholder="¿Qué cambiarías? (opcional)" className="w-full p-2 text-sm border border-stone-200 rounded-md min-h-[60px]" />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => setCommentOpen(p => ({ ...p, [mk]: false }))} className="text-xs px-2 py-1 text-stone-500">Cancelar</button>
                          <button onClick={() => { setApproval(mk, "changes", commentText[mk] || ""); setCommentOpen(p => ({ ...p, [mk]: false })); }}
                            className="text-xs px-3 py-1 bg-amber-600 text-white rounded-md hover:bg-amber-700">
                            Enviar cambios
                          </button>
                        </div>
                      </div>
                    )}
                    {app?.comment && (
                      <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[12px] text-amber-900">
                        <strong>Nota de {app.by}:</strong> {app.comment}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="text-center text-[11px] text-stone-400 py-6">
          Powered by WAFLOW · by Fascinads
        </div>
      </main>
    </div>
  );
}

// ====================================================================
// APP RAÍZ — gestión proyectos
// ====================================================================
function MainApp() {
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
  const handleDelete = async (p) => {
    if (!confirm(`¿Eliminar "${p.name}" definitivamente? Todos sus datos se perderán.`)) return;
    const keys = ["vars", "edits", "creatives", "connections", "aiPrompt", "comments", "variants", "approval", "templates", "snapshots", "history"];
    for (const k of keys) await deleteFromStorage(pk(p.id, k));
    setProjects(ps => ps.filter(x => x.id !== p.id));
    if (activeId === p.id) setActiveId(null);
  };

  if (!loaded) return <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-500 text-sm">Cargando...</div>;

  return (
    <>
      {activeProject ? (
        <ProjectWorkspace project={activeProject} onBack={() => setActiveId(null)} me={me} />
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

// Router manual: /review/:token → PublicReviewPage, resto → MainApp
export default function App() {
  const reviewMatch = typeof window !== "undefined"
    ? window.location.pathname.match(/^\/review\/([A-Za-z0-9_-]+)\/?$/)
    : null;
  if (reviewMatch) return <PublicReviewPage token={reviewMatch[1]} />;
  return <MainApp />;
}
