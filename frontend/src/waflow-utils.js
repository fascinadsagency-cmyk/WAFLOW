// Utilidades compartidas entre App.jsx y otros componentes extraídos (PublicReviewPage, etc.)
// Replicadas de App.jsx para evitar ciclos de importación.
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

export const WEBINAR_DEFAULT_VARS = [...cleanVariablesBase, ...CALENDAR_VARS];

const FLOWS_WEBINAR_DEF = [
  { key: "flujo_a",         label: "Flujo A — Escribe primero",  color: "#25D366", items: RAW.flujo_a,         branching: true  },
  { key: "pre_webinar_1a1", label: "1-1 Pre-webinar",            color: "#128C7E", items: RAW.pre_webinar_1a1, branching: false },
  { key: "broadcasts",      label: "Broadcasts programados",     color: "#075E54", items: RAW.broadcasts,      branching: false },
  { key: "venta_1a1",       label: "Venta 1-1 post-webinar",     color: "#128C7E", items: RAW.venta_1a1,       branching: false },
  { key: "venta_comunidad", label: "Venta comunidad",            color: "#25D366", items: RAW.venta_comunidad, branching: false },
  { key: "replay",          label: "Replay — no asistentes",     color: "#075E54", items: RAW.replay,          branching: false },
];

const FLOWS_EVERGREEN_DEF = [
  {
    key: "welcome", label: "Bienvenida", color: "#25D366", branching: false,
    items: [
      { id: "W1", dia: "T+0", timing: "Inmediato", objetivo: "Bienvenida y expectativas", tipo: "Texto",
        copy: "¡Hola {NOMBRE}! 👋 Gracias por unirte. Durante los próximos días voy a compartirte lo mejor que tenemos para ayudarte con {TEMA_PRINCIPAL}.\n\n¿Te parece?",
        botones: "[BOTÓN] Sí, adelante\n[BOTÓN] Cuéntame más", recursos: "" },
    ],
  },
  {
    key: "nurturing", label: "Nurturing / Valor", color: "#128C7E", branching: false,
    items: [
      { id: "N1", dia: "T+2", timing: "2 días después", objetivo: "Aportar valor sin vender", tipo: "Texto + recurso",
        copy: "{NOMBRE}, te comparto este recurso que seguro te ayuda:\n\n{LINK_RECURSO}",
        botones: "[BOTÓN] Ver recurso", recursos: "" },
      { id: "N2", dia: "T+5", timing: "5 días", objetivo: "Caso de éxito", tipo: "Storytelling",
        copy: "¿Te acuerdas de {NOMBRE_EXPERTO}? Pues quiero contarte cómo logró...", botones: "N/A", recursos: "" },
    ],
  },
  {
    key: "venta_evergreen", label: "Venta permanente", color: "#075E54", branching: false,
    items: [
      { id: "V1", dia: "T+7", timing: "Tras engagement detectado", objetivo: "Presentar oferta", tipo: "Texto + CTA",
        copy: "{NOMBRE}, basándome en lo que me has contado creo que {NOMBRE_PRODUCTO} puede ayudarte mucho.\n\n¿Te paso los detalles?",
        botones: "[BOTÓN] Sí, cuéntame\n[BOTÓN] Ahora no", recursos: "" },
    ],
  },
];

const STRATEGY_MAP = {
  webinar: FLOWS_WEBINAR_DEF,
  evergreen: FLOWS_EVERGREEN_DEF,
};

export function getFlowsForStrategy(strategyKey) {
  return (STRATEGY_MAP[strategyKey] || FLOWS_WEBINAR_DEF).map(f => ({ ...f }));
}

export function replaceVars(text, vars) {
  if (!text) return "";
  let out = text;
  (vars || []).forEach(v => {
    if (!v.name) return;
    const re = new RegExp(`\\{${v.name}\\}`, "g");
    out = out.replace(re, v.value || `{${v.name}}`);
  });
  return out;
}

export function parseButtons(str) {
  if (!str || str.startsWith("N/A")) return [];
  const lines = str.split(/\n/);
  const btns = [];
  lines.forEach(l => {
    const m = l.match(/\[BOTÓN\]\s*(.+?)(?:\s*\\nLink:|$)/i);
    if (m) btns.push(m[1].trim());
  });
  return btns;
}

export function extractVarsUsed(text) {
  if (!text) return [];
  const matches = text.match(/\{([A-Z_][A-Z0-9_]*)\}/g) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

// Regex para detectar emojis (Unicode property Extended_Pictographic + variation selectors + ZWJ).
// Se usa para (a) bloquear entrada en el editor de copy de flujos Meta,
// (b) marcar warnings en el Checker, y (c) strip defensivo antes de enviar a Meta.
const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{3000}-\u{303F}]/gu;

export function stripEmojis(text) {
  if (!text) return text;
  // Quitar emojis + espacios duplicados resultantes + trim por línea
  let out = text.replace(EMOJI_RE, "").replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1");
  out = out.split("\n").map(line => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, "")).join("\n");
  return out.trim();
}

export function hasEmojis(text) {
  if (!text) return false;
  return EMOJI_RE.test(text);
}

export function parseDayOffset(dia) {
  if (!dia) return null;
  const s = String(dia).trim().toUpperCase();
  let m = s.match(/^D\s*-\s*(\d+)$/); if (m) return -parseInt(m[1], 10);
  m = s.match(/^D\s*\+\s*(\d+)$/);    if (m) return parseInt(m[1], 10);
  m = s.match(/^D[ÍI]A\s*(\d+)$/);    if (m) return parseInt(m[1], 10);
  m = s.match(/^D(\d+)$/);            if (m) return parseInt(m[1], 10);
  m = s.match(/^T\s*\+\s*(\d+)$/);    if (m) return parseInt(m[1], 10);
  return null;
}

export function computeSkipCondition(flowKey, msg) {
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

export const RUNTIME_VARS = new Set([
  "NOMBRE", "USER_ID", "EMAIL", "PHONE",
  "RESPUESTA_MOTIVACION", "RESPUESTA_DOLOR", "RESPUESTA_OBJETIVO", "RESPUESTA_MIEDO",
  "RESPUESTA_M3", "RESPUESTA_M4", "RESPUESTA_INGRESOS", "RESPUESTA_ESPECIFICA",
  "RANGO_FACTURACION", "TITULO_GUIA_SEGUN_PERFIL"
]);
