// storage-shim.js — implementa window.storage para el WhatsApp Flow Editor
// - shared=true  -> persistencia en backend MongoDB (compartida entre todo el equipo)
// - shared=false -> localStorage (por navegador, p.ej. el nombre "me")
//
// API esperada por App.jsx:
//   window.storage.set(key, value, shared)  -> Promise<void>
//   window.storage.get(key, shared)          -> Promise<{ value: string } | null>
//   window.storage.delete(key, shared)       -> Promise<void>

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LOCAL_PREFIX = "wa_editor_local::";

async function apiSet(key, value) {
  const res = await fetch(`${API}/storage/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, shared: true }),
  });
  if (!res.ok) throw new Error(`set ${key} failed: ${res.status}`);
}

async function apiGet(key) {
  const res = await fetch(
    `${API}/storage/get?key=${encodeURIComponent(key)}&shared=true`
  );
  if (!res.ok) throw new Error(`get ${key} failed: ${res.status}`);
  const json = await res.json();
  return json.value ?? null;
}

async function apiDelete(key) {
  const res = await fetch(`${API}/storage/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, shared: true }),
  });
  if (!res.ok) throw new Error(`delete ${key} failed: ${res.status}`);
}

const storage = {
  async set(key, value, shared = true) {
    if (shared === false) {
      try {
        localStorage.setItem(LOCAL_PREFIX + key, value);
      } catch (e) {
        console.warn("localStorage set failed", e);
      }
      return;
    }
    await apiSet(key, value);
  },

  async get(key, shared = true) {
    if (shared === false) {
      try {
        const v = localStorage.getItem(LOCAL_PREFIX + key);
        return v === null ? null : { value: v };
      } catch (e) {
        return null;
      }
    }
    const v = await apiGet(key);
    return v === null ? null : { value: v };
  },

  async delete(key, shared = true) {
    if (shared === false) {
      try {
        localStorage.removeItem(LOCAL_PREFIX + key);
      } catch (e) {
        console.warn("localStorage delete failed", e);
      }
      return;
    }
    await apiDelete(key);
  },
};

if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;
