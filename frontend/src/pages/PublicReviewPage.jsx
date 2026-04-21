// Public review page — vista accesible por /review/:token sin login.
// Solo lectura del copy + aprobar / pedir cambios + firmar (lock).
import React, { useState, useEffect, useMemo } from "react";
import { Download } from "lucide-react";
import { useConfirm } from "../hooks/useConfirm";
import { getFlowsForStrategy, replaceVars, parseButtons } from "../waflow-utils";

function ReviewHeader({ project, approvedCount, total, changesCount }) {
  return (
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
  );
}

function ReviewerNameCard({ reviewerName, setReviewerName, savedReviewer, setSavedReviewer, saveReviewer }) {
  return (
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
          <button onClick={() => setSavedReviewer(false)} className="text-[11px] text-stone-500 hover:text-stone-900 underline">Cambiar</button>
        </div>
      )}
    </div>
  );
}

function ProgressCard({ approvedCount, total }) {
  return (
    <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl p-5 text-white mb-5">
      <div className="text-[11px] uppercase tracking-widest opacity-75">Progreso de revisión</div>
      <div className="text-lg font-bold mt-1">{approvedCount} de {total} mensajes aprobados</div>
      <div className="mt-3 bg-white/20 rounded-full h-2">
        <div className="h-full bg-white rounded-full transition-all" style={{ width: `${total > 0 ? (approvedCount / total * 100) : 0}%` }} />
      </div>
    </div>
  );
}

function SignatureCard({ signature }) {
  return (
    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl p-5 text-white mb-5" data-testid="signature-card">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-2xl">🔐</div>
        <div>
          <div className="text-[11px] uppercase tracking-widest opacity-75">Revisión firmada y cerrada</div>
          <div className="text-lg font-bold">Firmado por {signature.signer_name}</div>
        </div>
      </div>
      <div className="text-[11.5px] opacity-90 leading-relaxed">
        Fecha: {signature.signed_at ? new Date(signature.signed_at).toLocaleString("es-ES") : "—"}<br />
        Hash SHA-256: <code className="font-mono text-[10px] bg-white/10 px-1.5 py-0.5 rounded break-all">{signature.signature_hash}</code>
      </div>
      <div className="text-[10.5px] opacity-75 mt-2">Este contenido ya no puede modificarse. El PDF descargable incluye la firma digital.</div>
    </div>
  );
}

function SignCtaCard({ onSign }) {
  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-5 mb-5" data-testid="sign-cta-card">
      <div className="flex items-start gap-3">
        <div className="text-3xl">✨</div>
        <div className="flex-1">
          <div className="font-bold text-amber-900 text-base mb-1">¡Todos los mensajes aprobados!</div>
          <div className="text-[12.5px] text-amber-900/80 mb-3 leading-relaxed">
            Puedes <strong>firmar y cerrar</strong> esta revisión. Se generará un PDF con firma digital (SHA-256) como constancia de aprobación. Después de firmar no podrás hacer más cambios.
          </div>
          <button onClick={onSign} data-testid="sign-close-btn"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-amber-600 text-white rounded-md hover:bg-amber-700">
            🔐 Firmar y cerrar revisión
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewMessageCard({ f, m, i, edits, vars, approval, locked, saving, commentOpen, commentText, setCommentOpen, setCommentText, setApproval }) {
  const mk = `${f.key}:${m.id || i}`;
  const copy = replaceVars(edits?.[mk] ?? m.copy, vars);
  const btns = parseButtons(replaceVars(m.botones, vars));
  const app = approval?.[mk];
  const isOpen = commentOpen[mk];
  const isSaving = saving[mk];
  return (
    <div className={`bg-white rounded-xl overflow-hidden border-2 transition ${
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
            {btns.map((b, j) => <div key={`rvbtn-${j}-${b}`} className="bg-white rounded-lg px-3 py-2 text-center text-[13px] font-medium text-[#00A5F4] shadow-sm">{b}</div>)}
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-stone-200 bg-white flex items-center gap-2 flex-wrap">
        {locked ? (
          <div className="text-[11.5px] text-stone-500 italic">🔐 Revisión firmada y cerrada · no se admiten más cambios</div>
        ) : (
          <>
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
          </>
        )}
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
}

export default function PublicReviewPage({ token }) {
  const confirm = useConfirm();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [reviewerName, setReviewerName] = useState("");
  const [savedReviewer, setSavedReviewer] = useState(false);
  const [saving, setSaving] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentText, setCommentText] = useState({});
  const API = useMemo(() => `${process.env.REACT_APP_BACKEND_URL}/api`, []);

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
    try {
      const n = localStorage.getItem("waflow:reviewer_name");
      if (n) { setReviewerName(n); setSavedReviewer(true); }
    } catch (e) { /* no-op */ }
  }, [token, API]);

  const saveReviewer = () => {
    if (!reviewerName.trim()) return;
    try { localStorage.setItem("waflow:reviewer_name", reviewerName.trim()); } catch (e) { /* no-op */ }
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

  const flows = useMemo(() => {
    if (!state.data) return [];
    const base = getFlowsForStrategy(state.data.project.strategy);
    const customs = state.data.custom_msgs || {};
    return base.map(f => {
      const cs = (customs[f.key] || []).map(m => ({ ...m, _custom: true }));
      if (cs.length === 0) return f;
      const items = [...f.items];
      const withPos = cs.filter(c => typeof c.position === "number").sort((a, b) => a.position - b.position);
      const without = cs.filter(c => typeof c.position !== "number");
      withPos.forEach(c => { const pos = Math.max(0, Math.min(items.length, c.position)); items.splice(pos, 0, c); });
      without.forEach(c => items.push(c));
      return { ...f, items };
    });
  }, [state.data]);

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

  const { project, vars, edits, approval, locked, signature } = state.data;
  const total = flows.reduce((s, f) => s + f.items.length, 0);
  const approvedCount = Object.values(approval || {}).filter(a => a?.status === "approved").length;
  const changesCount = Object.values(approval || {}).filter(a => a?.status === "changes").length;
  const allApproved = total > 0 && approvedCount === total;

  const signNow = async () => {
    if (!savedReviewer || !reviewerName.trim()) { alert("Pon tu nombre antes de firmar."); return; }
    if (!(await confirm({ title: "Firmar y cerrar la revisión", message: "Después de firmar no se podrán modificar más aprobaciones ni pedir cambios. Se generará un hash digital como constancia.", confirmLabel: "Firmar y cerrar", danger: true }))) return;
    try {
      const r = await fetch(`${API}/review/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer_name: reviewerName.trim(), signer_role: "" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Error al firmar");
      const r2 = await fetch(`${API}/review/${token}`);
      const d2 = await r2.json();
      setState({ loading: false, error: null, data: d2 });
    } catch (e) {
      alert("Error al firmar: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <ReviewHeader project={project} approvedCount={approvedCount} total={total} changesCount={changesCount} />
      <main className="max-w-3xl mx-auto px-5 py-6">
        <ReviewerNameCard
          reviewerName={reviewerName}
          setReviewerName={setReviewerName}
          savedReviewer={savedReviewer}
          setSavedReviewer={setSavedReviewer}
          saveReviewer={saveReviewer}
        />
        <ProgressCard approvedCount={approvedCount} total={total} />
        {locked && signature && <SignatureCard signature={signature} />}
        {allApproved && !locked && savedReviewer && <SignCtaCard onSign={signNow} />}

        {flows.map(f => (
          <div key={f.key} className="mb-6">
            <div className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase mb-3">{f.label}</div>
            <div className="space-y-3">
              {f.items.map((m, i) => (
                <ReviewMessageCard
                  key={`${f.key}:${m.id || i}`}
                  f={f}
                  m={m}
                  i={i}
                  edits={edits}
                  vars={vars}
                  approval={approval}
                  locked={locked}
                  saving={saving}
                  commentOpen={commentOpen}
                  commentText={commentText}
                  setCommentOpen={setCommentOpen}
                  setCommentText={setCommentText}
                  setApproval={setApproval}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="text-center text-[11px] text-stone-400 py-6">
          <a href={`${API}/review/${token}/summary.pdf`} target="_blank" rel="noreferrer"
            data-testid="download-pdf-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-700 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50 mb-4">
            <Download size={14} /> Descargar resumen (PDF)
          </a>
          <div>Powered by WAFLOW · by Fascinads</div>
        </div>
      </main>
    </div>
  );
}
