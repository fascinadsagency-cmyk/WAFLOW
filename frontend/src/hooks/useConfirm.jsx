// Confirm dialog — reemplaza window.confirm (bloqueado en iframes Emergent).
// Uso:
//   const confirm = useConfirm();
//   if (await confirm({ title, message, confirmLabel, danger })) { ... }
import React, { useState, useCallback, createContext, useContext } from "react";

function ConfirmDialog({ open, title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className={`text-lg font-bold ${danger ? "text-red-700" : "text-stone-900"} mb-2`}>{title}</div>
          <div className="text-sm text-stone-600 whitespace-pre-line">{message}</div>
        </div>
        <div className="px-6 py-3 bg-stone-50 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onCancel} data-testid="confirm-dialog-cancel"
            className="px-4 py-2 text-sm font-medium text-stone-700 hover:text-stone-900">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} data-testid="confirm-dialog-ok"
            className={`px-4 py-2 text-sm font-medium rounded-md text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-stone-900 hover:bg-stone-700"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const ConfirmContext = createContext(null);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const ask = useCallback((opts) => new Promise(resolve => {
    setState({
      ...opts,
      onConfirm: () => { setState(null); resolve(true); },
      onCancel: () => { setState(null); resolve(false); },
    });
  }), []);
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <ConfirmDialog open={!!state} {...(state || {})} />
    </ConfirmContext.Provider>
  );
}

export default ConfirmProvider;
