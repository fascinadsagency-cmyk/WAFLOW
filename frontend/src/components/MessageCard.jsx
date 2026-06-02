import React, { useState, useMemo, useRef } from "react";
import {
  ChevronDown, ChevronRight, Smartphone, FlaskConical, FileCheck,
  Image as ImageIcon, MessageSquare, Send, Trash2, Upload, Search, X,
} from "lucide-react";

import { CopyButton, Field } from "./ui-primitives";
import {
  replaceVars, extractVarsUsed, stripEmojis, hasEmojis,
  countEmojis, startsWithEmoji,
  computeSkipCondition, RUNTIME_VARS,
} from "../waflow-utils";

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
// META TEMPLATE SEND MODAL — envío real vía /api/whatsapp/send-template
// ====================================================================
function MetaTemplateSendModal({ msg, effectiveCopy, vars, templateMeta, flowKey, msgId, projectId, creatives, onClose }) {
  const detectedVarNames = useMemo(() => {
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
        credentials: "include",
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

// ====================================================================
// EVOLUTION SEND MODAL — envío real via Evolution API (broadcasts & comunidad)
// ====================================================================
function EvolutionSendModal({ msg, rendered, evolutionConfig, onSend, onClose, flowKey, msgKey }) {
  const [target, setTarget] = useState("group");
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

// ====================================================================
// ATTACH CREATIVE MODAL — asociar creativo a un mensaje desde la tarjeta
// ====================================================================
function AttachCreativeModal({ msgKey, creatives, onAttach, onRemove, onClose }) {
  const [tab, setTab] = useState("existing");
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
// MESSAGE CARD — tarjeta completa de un mensaje con todas sus acciones
// ====================================================================
export default function MessageCard({
  msg, vars, showVars, index, onPreview, editedCopy, onEditCopy, flowKey, creatives,
  comments = [], onAddComment, onRemoveComment,
  variants = null, onSaveVariants,
  approval = null, onSetApproval,
  templateMeta = null, onSetTemplateMeta,
  me = "",
  onAttachCreative, onRemoveCreativeAssoc,
  isCustom = false, onRemoveCustom = null,
  canUseEvolution = false, evolutionConfig = null, onEvolutionSend = null,
  metaConfig = null,
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

  const approvalBadge = () => {
    if (!approval) return null;
    if (approval.status === "approved") return <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">✓ Aprobado</span>;
    if (approval.status === "changes") return <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">✎ Cambios</span>;
    return null;
  };

  const tplBadge = () => {
    if (!templateMeta || !templateMeta.isTemplate) {
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
    }`} data-testid={`message-card-${flowKey}-${msg.id || index}`}>
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
                  <textarea ref={textareaRef} value={effectiveCopy}
                    onChange={e => onEditCopy(e.target.value)}
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
                        } catch { /* noop */ }
                      }, 0);
                    }} />
                  )}
                </div>
              ) : (
                <div className="bg-white border border-stone-200 rounded-md p-3 text-sm text-stone-800 whitespace-pre-wrap leading-relaxed">{rendered}</div>
              )}
              <div className="mt-1 text-[10px] text-stone-500 flex justify-end gap-3 flex-wrap">
                <span>{effectiveCopy.length} chars</span>
                {effectiveCopy.length > 1024 && <span className="text-red-600 font-semibold">⚠️ supera 1024 (límite Meta Body)</span>}
                {isMetaFlow && (() => {
                  const n = countEmojis(effectiveCopy);
                  if (n === 0) return null;
                  return <span className={n > 10 ? "text-red-600 font-semibold" : "text-stone-600"}>
                    {n} emoji{n !== 1 ? "s" : ""} {n > 10 && "· máx 10 Meta"}
                  </span>;
                })()}
                {isMetaFlow && startsWithEmoji(effectiveCopy) && (
                  <span className="text-red-600 font-semibold">⚠️ Body NO puede empezar con emoji</span>
                )}
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
              {isMetaFlow && (() => {
                const warnings = [];
                if (hasEmojis(msg.botones)) {
                  warnings.push("⚠ Botones contienen emojis · Meta NO los admite en botones");
                }
                const btns = msg.botones.split(/[\n;]/).map(s => s.replace(/^\[BOTÓN\]\s*/, "").trim()).filter(Boolean);
                const tooLong = btns.filter(b => b.length > 20);
                if (tooLong.length > 0) {
                  warnings.push(`⚠ ${tooLong.length} botón(es) >20 chars: ${tooLong.map(b => `"${b}" (${b.length})`).join(", ")}`);
                }
                if (warnings.length === 0) return null;
                return (
                  <div className="mt-1 text-[10.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 space-y-0.5"
                    data-testid={`buttons-warning-${flowKey}-${msg.id || index}`}>
                    {warnings.map((w, i) => <div key={i}>{w}</div>)}
                  </div>
                );
              })()}
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
