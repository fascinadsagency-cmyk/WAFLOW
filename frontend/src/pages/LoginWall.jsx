// Login wall: email + password como flujo principal. Google queda como opción secundaria.
// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE GOOGLE AUTH
import React, { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Guard a nivel módulo para el callback OAuth (sobrevive a remounts React StrictMode).
const _processedSessionIds = new Set();
let _activeCallbackPromise = null;

export function AuthCallback({ onComplete }) {
  const { setUser, refresh } = useAuth();
  const [err, setErr] = useState(null);

  useEffect(() => {
    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) { setErr("No se recibió session_id"); return; }
    const sessionId = match[1];
    if (_processedSessionIds.has(sessionId)) return;
    if (_activeCallbackPromise) return;
    _processedSessionIds.add(sessionId);
    _activeCallbackPromise = (async () => {
      try {
        const r = await fetch(`${API}/auth/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ session_id: sessionId }),
        });
        let data = {};
        try { data = await r.json(); } catch { /* respuesta vacía o no-JSON */ }
        if (!r.ok) {
          const msg = data.detail || `HTTP ${r.status}`;
          throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
        setUser(data.user);
        window.history.replaceState(null, "", window.location.origin + "/");
        if (onComplete) onComplete();
        else await refresh();
      } catch (e) {
        setErr(e.message || String(e));
        _processedSessionIds.delete(sessionId);
      } finally {
        _activeCallbackPromise = null;
      }
    })();
  }, [setUser, refresh, onComplete]);

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
        <div className="max-w-md w-full bg-white rounded-xl border border-red-200 p-6">
          <div className="text-lg font-bold text-red-700">🔒 Error de autenticación</div>
          <div className="text-sm text-stone-700 mt-2">{err}</div>
          <a href="/" className="mt-4 inline-block text-sm font-semibold text-stone-900 underline">Volver al inicio</a>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-sm text-stone-600">Iniciando sesión…</div>
    </div>
  );
}

export default function LoginWall() {
  const { loginWithGoogle, setUser, refresh } = useAuth();
  const [mode, setMode] = useState("login"); // login | register
  const [showGoogle, setShowGoogle] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submittingRef = React.useRef(false);

  const submit = async (e) => {
    e.preventDefault();
    // Guard contra double-submit (React StrictMode o doble click humano).
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true); setErr(null);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login"
        ? { email: email.trim().toLowerCase(), password }
        : { email: email.trim().toLowerCase(), password, name: name.trim() };
      const r = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      // Bulletproof body read: clonar ANTES de leer, así si algún interceptor / extensión
      // ya consumió el body original, todavía tenemos una copia limpia para parsear.
      let data = {};
      let raw = "";
      try {
        const clone = (typeof r.clone === "function") ? r.clone() : r;
        raw = await clone.text();
      } catch (readErr) {
        // Si fallar el read del clone, intentar parsear del original como último recurso.
        try { raw = await r.text(); } catch { raw = ""; }
      }
      if (raw) {
        try { data = JSON.parse(raw); } catch { data = { detail: raw }; }
      }
      if (!r.ok) {
        const msg = data.detail || data.message || `HTTP ${r.status}`;
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      if (!data || !data.user) {
        throw new Error("Respuesta inválida del servidor");
      }
      setUser(data.user);
      // No await refresh() — el setUser ya actualiza la UI, refresh puede correr en background.
      refresh().catch(() => {});
    } catch (e) {
      // Traducir errores de red comunes a español para debugging
      let msg = e?.message || String(e);
      if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
        msg = "Sin conexión al servidor. Puede ser bloqueado por una extensión, adblock, o red. Intenta en incógnito con extensiones desactivadas.";
      } else if (msg.includes("body stream already read")) {
        msg = "Error interno de fetch (probable caché del navegador). Prueba Ctrl+Shift+R o ventana incógnito.";
      } else if (msg === "TypeError: fetch failed" || msg.includes("aborted")) {
        msg = "Petición interrumpida. Reintenta o revisa tu conexión.";
      }
      setErr(msg);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 flex items-center justify-center p-6"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-10 max-w-md w-full">
        <div className="text-center mb-6">
          <img src="/fascinads-logo.png" alt="Fascinads" className="h-7 w-auto mx-auto mb-4" />
          <div className="text-2xl font-bold text-stone-900">WAFLOW</div>
          <div className="text-[12px] text-stone-500 mt-1">Editor colaborativo de flujos WhatsApp · by Fascinads</div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-200 mb-5">
          <button onClick={() => { setMode("login"); setErr(null); }}
            data-testid="tab-login"
            className={`flex-1 py-2 text-sm font-semibold tracking-wide ${isLogin ? "text-stone-900 border-b-2 border-stone-900" : "text-stone-400"}`}>
            Iniciar sesión
          </button>
          <button onClick={() => { setMode("register"); setErr(null); }}
            data-testid="tab-register"
            className={`flex-1 py-2 text-sm font-semibold tracking-wide ${!isLogin ? "text-stone-900 border-b-2 border-stone-900" : "text-stone-400"}`}>
            Crear cuenta
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {!isLogin && (
            <div>
              <label className="text-[11px] font-medium text-stone-600">Nombre (opcional)</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                data-testid="register-name-input"
                placeholder="Tu nombre"
                className="w-full mt-1 px-3 py-2 text-sm border border-stone-300 rounded-md focus:outline-none focus:border-stone-900" />
            </div>
          )}
          <div>
            <label className="text-[11px] font-medium text-stone-600">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              data-testid={isLogin ? "login-email-input" : "register-email-input"}
              required autoFocus placeholder="tu@fascinads.com"
              className="w-full mt-1 px-3 py-2 text-sm border border-stone-300 rounded-md focus:outline-none focus:border-stone-900" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-stone-600">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              data-testid={isLogin ? "login-password-input" : "register-password-input"}
              required placeholder={isLogin ? "" : "Mínimo 8 caracteres"}
              minLength={isLogin ? undefined : 8}
              className="w-full mt-1 px-3 py-2 text-sm border border-stone-300 rounded-md focus:outline-none focus:border-stone-900" />
          </div>

          {err && (
            <div className="text-[11.5px] text-red-700 bg-red-50 border border-red-200 rounded p-2"
              data-testid="login-error">
              {err}
            </div>
          )}

          <button type="submit" disabled={loading || !email || !password}
            data-testid={isLogin ? "login-submit-btn" : "register-submit-btn"}
            className="w-full px-5 py-2.5 text-sm font-semibold bg-stone-900 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50">
            {loading
              ? (isLogin ? "Entrando…" : "Creando cuenta…")
              : (isLogin ? "Entrar" : "Crear cuenta")}
          </button>
        </form>

        {!isLogin && (
          <div className="mt-3 text-[11px] text-stone-500 text-center">
            Tu email debe estar autorizado por el admin (allowlist) para poder registrarte.
          </div>
        )}

        {/* Google fallback discreto */}
        <div className="mt-6 pt-5 border-t border-stone-100 text-center">
          {showGoogle ? (
            <button onClick={loginWithGoogle}
              data-testid="login-google-btn"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium border border-stone-300 text-stone-700 rounded-md hover:bg-stone-50">
              <svg width="14" height="14" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continuar con Google
            </button>
          ) : (
            <button onClick={() => setShowGoogle(true)}
              data-testid="show-google-btn"
              className="text-[11px] text-stone-400 hover:text-stone-700 underline">
              ¿Prefieres entrar con Google?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
