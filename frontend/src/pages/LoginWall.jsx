// Login wall + callback handler para Emergent Google Auth.
// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function AuthCallback({ onComplete }) {
  const { setUser, refresh } = useAuth();
  const hasProcessed = useRef(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    (async () => {
      const hash = window.location.hash || "";
      const match = hash.match(/session_id=([^&]+)/);
      if (!match) { setErr("No se recibió session_id"); return; }
      const sessionId = match[1];
      try {
        const r = await fetch(`${API}/auth/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || "Error de autenticación");
        setUser(data.user);
        // Limpiar hash y volver a la raíz
        window.history.replaceState(null, "", window.location.origin + "/");
        if (onComplete) onComplete();
        else await refresh();
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, [setUser, refresh, onComplete]);

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 max-w-md text-center">
        {err ? (
          <>
            <div className="text-red-600 font-semibold mb-2">🔒 {err}</div>
            <a href="/" className="text-sm text-stone-700 underline">Volver al inicio</a>
          </>
        ) : (
          <div className="text-sm text-stone-700">Completando login...</div>
        )}
      </div>
    </div>
  );
}

export default function LoginWall() {
  const { loginWithGoogle } = useAuth();
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-10 max-w-md w-full text-center">
        <img src="/fascinads-logo.png" alt="Fascinads" className="h-7 w-auto mx-auto mb-6" />
        <div className="text-2xl font-bold text-stone-900 mb-1">WAFLOW</div>
        <div className="text-[12px] text-stone-500 mb-6">Editor colaborativo de flujos WhatsApp · by Fascinads</div>
        <button onClick={loginWithGoogle}
          data-testid="login-google-btn"
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold bg-stone-900 text-white rounded-lg hover:bg-stone-700">
          <svg width="16" height="16" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Iniciar sesión con Google
        </button>
        <div className="text-[11px] text-stone-400 mt-4">
          Acceso restringido. Si no estás invitado, pide al admin que te añada.
        </div>
      </div>
    </div>
  );
}
