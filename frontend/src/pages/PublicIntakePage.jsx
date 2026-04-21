// Public intake page — accesible por /intake/:token sin login.
// El cliente rellena variables + sube creativos que la agencia le ha pedido.
// Auto-save en cada cambio. Al completar → notifica por webhook al equipo.
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Check, Upload, AlertTriangle, Loader2, X } from "lucide-react";

const API = () => `${process.env.REACT_APP_BACKEND_URL}/api`;

function IntakeHeader({ projectName, projectEmoji, approvedCount, pendingCount, total }) {
  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
      <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/fascinads-logo.png" alt="Fascinads" className="h-5 w-auto select-none" draggable="false" />
          <div className="h-5 w-px bg-stone-200" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">Datos del cliente</div>
            <div className="text-sm font-bold text-stone-900 truncate">{projectEmoji} {projectName}</div>
          </div>
        </div>
        <div className="text-[10px] text-stone-500 text-right">
          <div>{approvedCount + pendingCount} / {total} enviados</div>
          {pendingCount > 0 && <div className="text-amber-700">{pendingCount} en revisión</div>}
        </div>
      </div>
    </header>
  );
}

function ProgressBar({ submitted, total }) {
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
  return (
    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl p-5 text-white mb-5">
      <div className="text-[11px] uppercase tracking-widest opacity-75">Tu progreso</div>
      <div className="text-lg font-bold mt-1" data-testid="intake-progress-text">{submitted} de {total} datos enviados</div>
      <div className="mt-3 bg-white/20 rounded-full h-2">
        <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] opacity-85 mt-2">
        Guarda automáticamente cada cambio. Puedes cerrar esta pestaña y volver cuando quieras desde el mismo link.
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    empty:    { cls: "bg-stone-100 text-stone-600 border-stone-200",     text: "Pendiente" },
    pending:  { cls: "bg-amber-50 text-amber-800 border-amber-200",      text: "En revisión" },
    approved: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200",text: "✓ Aprobado" },
    rejected: { cls: "bg-red-50 text-red-800 border-red-200",            text: "Rechazado — revisa abajo" },
  };
  const conf = map[status] || map.empty;
  return <span className={`text-[10px] font-medium border px-2 py-0.5 rounded-full ${conf.cls}`}>{conf.text}</span>;
}

function VariableItem({ item, onSave, saving }) {
  const [value, setValue] = useState(item.client_value || "");
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef(null);
  const disabled = item.status === "approved";

  useEffect(() => { setValue(item.client_value || ""); }, [item.client_value]);

  const schedule = (v) => {
    setValue(v);
    setDirty(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(item.id, v);
      setDirty(false);
    }, 600);
  };

  return (
    <div className={`bg-white border-2 rounded-xl p-4 ${item.status === "rejected" ? "border-red-200" : item.status === "approved" ? "border-emerald-200" : "border-stone-200"}`}
      data-testid={`intake-item-${item.id}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
        <div className="text-sm font-semibold text-stone-900">{item.label}</div>
        <StatusBadge status={item.status || "empty"} />
      </div>
      {item.help && <div className="text-[11.5px] text-stone-500 mb-2 leading-relaxed">{item.help}</div>}
      <input
        type="text"
        value={value}
        onChange={e => schedule(e.target.value)}
        placeholder={item.example ? `Ej: ${item.example}` : "Escribe aquí..."}
        disabled={disabled}
        data-testid={`intake-input-${item.id}`}
        className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none ${disabled ? "bg-stone-50 border-stone-200 text-stone-500 cursor-not-allowed" : "bg-white border-stone-300 focus:border-stone-900"}`}
      />
      <div className="flex items-center justify-between mt-1 text-[10.5px]">
        <span className="text-stone-400">
          {dirty ? "..." : saving ? "Guardando..." : value ? "✓ Guardado" : ""}
        </span>
        {item.status === "rejected" && item.review_comment && (
          <span className="text-red-700">Motivo: {item.review_comment}</span>
        )}
      </div>
    </div>
  );
}

function CreativeItem({ item, token, onUpload, uploading }) {
  const [localErr, setLocalErr] = useState(null);
  const inputRef = useRef(null);
  const disabled = item.status === "approved";

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setLocalErr(null);
    if (f.size > 10 * 1024 * 1024) {
      setLocalErr("Archivo supera los 10 MB. Súbelo a Drive/Dropbox y pega el link como texto aquí.");
      return;
    }
    await onUpload(item.id, f);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={`bg-white border-2 rounded-xl p-4 ${item.status === "rejected" ? "border-red-200" : item.status === "approved" ? "border-emerald-200" : "border-stone-200"}`}
      data-testid={`intake-item-${item.id}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
        <div className="text-sm font-semibold text-stone-900">🎨 {item.label}</div>
        <StatusBadge status={item.status || "empty"} />
      </div>
      {item.help && <div className="text-[11.5px] text-stone-500 mb-2 leading-relaxed">{item.help}</div>}
      {item.client_file_id ? (
        <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-md p-2.5 mb-2">
          <div className="text-xl">📎</div>
          <div className="flex-1 min-w-0">
            <a href={`${API()}/intake/file/${item.client_file_id}`} target="_blank" rel="noreferrer"
              className="text-[12px] font-medium text-stone-800 truncate block hover:underline">
              {item.client_file_name || "archivo subido"}
            </a>
            <div className="text-[10px] text-stone-500">
              {item.client_file_size ? `${(item.client_file_size / 1024).toFixed(0)} KB` : ""}
              {item.client_file_type ? ` · ${item.client_file_type}` : ""}
            </div>
          </div>
        </div>
      ) : null}
      {!disabled && (
        <>
          <input ref={inputRef} type="file" onChange={pick} className="hidden"
            accept="image/*,video/*,.pdf,.gif"
            data-testid={`intake-file-${item.id}`} />
          <button onClick={() => inputRef.current && inputRef.current.click()} disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700 disabled:opacity-50">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? "Subiendo..." : item.client_file_id ? "Reemplazar archivo" : "Subir archivo (máx 10 MB)"}
          </button>
        </>
      )}
      {localErr && (
        <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">{localErr}</div>
      )}
      {item.status === "rejected" && item.review_comment && (
        <div className="mt-2 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded p-2">
          Motivo: {item.review_comment}
        </div>
      )}
    </div>
  );
}

function groupBySection(items) {
  const groups = {};
  (items || []).forEach(it => {
    const sec = it.section || "Otros";
    if (!groups[sec]) groups[sec] = [];
    groups[sec].push(it);
  });
  return groups;
}

export default function PublicIntakePage({ token }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [saving, setSaving] = useState({});
  const [uploading, setUploading] = useState({});
  const [completing, setCompleting] = useState(false);
  const api = useMemo(() => `${process.env.REACT_APP_BACKEND_URL}/api`, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${api}/intake/${token}`);
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
  }, [token, api]);

  const updateItemLocal = (itemId, patch) => {
    setState(prev => {
      if (!prev.data) return prev;
      const items = prev.data.items.map(it => it.id === itemId ? { ...it, ...patch } : it);
      return { ...prev, data: { ...prev.data, items } };
    });
  };

  const saveVar = async (itemId, value) => {
    setSaving(s => ({ ...s, [itemId]: true }));
    try {
      const r = await fetch(`${api}/intake/${token}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, value: value || null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Error guardando");
      updateItemLocal(itemId, { client_value: value, status: data.status });
    } catch (e) {
      alert("No se pudo guardar: " + e.message);
    } finally {
      setSaving(s => ({ ...s, [itemId]: false }));
    }
  };

  const uploadFile = async (itemId, file) => {
    setUploading(u => ({ ...u, [itemId]: true }));
    try {
      const fd = new FormData();
      fd.append("item_id", itemId);
      fd.append("file", file);
      const r = await fetch(`${api}/intake/${token}/upload`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Error subiendo");
      updateItemLocal(itemId, {
        client_file_id: data.file_id,
        client_file_name: file.name,
        client_file_type: file.type,
        client_file_size: file.size,
        status: "pending",
      });
    } catch (e) {
      alert("No se pudo subir: " + e.message);
    } finally {
      setUploading(u => ({ ...u, [itemId]: false }));
    }
  };

  const markComplete = async () => {
    setCompleting(true);
    try {
      const r = await fetch(`${api}/intake/${token}/complete`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Error");
      setState(prev => ({ ...prev, data: { ...prev.data, completed_at: data.completed_at } }));
    } catch (e) {
      alert("No se pudo marcar como listo: " + e.message);
    } finally {
      setCompleting(false);
    }
  };

  if (state.loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="text-stone-500 text-sm">Cargando...</div>
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

  const { project_name, project_emoji, items, completed_at } = state.data;
  const total = items.length;
  const submittedStatuses = new Set(["pending", "approved"]);
  const submittedCount = items.filter(it => submittedStatuses.has(it.status)).length;
  const approvedCount = items.filter(it => it.status === "approved").length;
  const pendingCount = items.filter(it => it.status === "pending").length;
  const allSubmitted = total > 0 && submittedCount === total;
  const groups = groupBySection(items);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <IntakeHeader projectName={project_name} projectEmoji={project_emoji}
        approvedCount={approvedCount} pendingCount={pendingCount} total={total} />
      <main className="max-w-2xl mx-auto px-5 py-6">
        <ProgressBar submitted={submittedCount} total={total} />

        {total === 0 && (
          <div className="bg-white border border-stone-200 rounded-xl p-6 text-center">
            <AlertTriangle size={24} className="mx-auto text-amber-500 mb-2" />
            <div className="text-sm text-stone-700">Aún no hay nada que rellenar. Tu contacto del equipo configurará el checklist en breve.</div>
          </div>
        )}

        {Object.entries(groups).map(([section, list]) => (
          <div key={section} className="mb-6">
            <div className="text-[10.5px] font-semibold tracking-widest text-stone-500 uppercase mb-3">{section}</div>
            <div className="space-y-3">
              {list.map(it => it.type === "creative"
                ? <CreativeItem key={it.id} item={it} token={token} onUpload={uploadFile} uploading={!!uploading[it.id]} />
                : <VariableItem key={it.id} item={it} onSave={saveVar} saving={!!saving[it.id]} />
              )}
            </div>
          </div>
        ))}

        {allSubmitted && (
          <div className={`rounded-xl p-5 mb-5 border-2 ${completed_at ? "bg-emerald-50 border-emerald-300" : "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300"}`}>
            <div className="flex items-start gap-3">
              <div className="text-3xl">{completed_at ? "✅" : "✨"}</div>
              <div className="flex-1">
                <div className="font-bold text-stone-900 text-base mb-1">
                  {completed_at ? "¡Gracias! El equipo ya está revisando" : "¡Lo tienes todo listo!"}
                </div>
                <div className="text-[12.5px] text-stone-700 mb-3 leading-relaxed">
                  {completed_at
                    ? `Marcado como listo el ${new Date(completed_at).toLocaleString("es-ES")}. Si el equipo necesita algún ajuste, te avisará aquí mismo (verás el item en rojo con el motivo).`
                    : "Pulsa para avisar al equipo de que has enviado todos los datos. Podrán revisarlos y preparar el lanzamiento."}
                </div>
                {!completed_at && (
                  <button onClick={markComplete} disabled={completing}
                    data-testid="intake-complete-btn"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50">
                    {completing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {completing ? "Avisando..." : "Listo, avisar al equipo"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="text-center text-[11px] text-stone-400 py-6">
          Powered by WAFLOW · by Fascinads
        </div>
      </main>
    </div>
  );
}
