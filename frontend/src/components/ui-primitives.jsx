import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text, label = "Copiar", size = "sm" }) {
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

export function Field({ label, value, onChange, placeholder, mono, password, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-[11px] font-medium text-stone-600">{label}</label>
      <input type={password ? "password" : "text"} value={value || ""} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full mt-1 px-2.5 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-stone-900 ${mono ? "font-mono" : ""}`} />
    </div>
  );
}
