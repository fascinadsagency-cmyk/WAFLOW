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
