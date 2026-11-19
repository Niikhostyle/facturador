"use client";

import { useEffect, useState } from "react";
import { getAuth } from "@/lib/api";

type Mod = { key: string; nombre: string; descripcion: string; default_on: boolean };

export default function AdminModulosPage() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [msg, setMsg] = useState("");

  function headers() {
    const a = getAuth();
    return { Authorization: `Bearer ${a?.token || ""}`, "Content-Type": "application/json" };
  }

  useEffect(() => {
    fetch("/api/v1/admin/modulos", { headers: headers() })
      .then((r) => r.json())
      .then((j) => setMods(j.data || []));
  }, []);

  async function toggle(m: Mod) {
    const r = await fetch("/api/v1/admin/modulos", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ key: m.key, default_on: !m.default_on }),
    });
    const j = await r.json();
    if (r.ok) {
      setMods((prev) => prev.map((x) => (x.key === j.data.key ? j.data : x)));
      setMsg(`${j.data.nombre}: default ${j.data.default_on ? "ON" : "OFF"}`);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-fiscal">Módulos del sistema</h1>
        <p className="text-sm text-[var(--ink-muted)]">
          Catálogo global. El acceso real lo define el plan + overrides por empresa (p. ej. Recibidos).
        </p>
      </div>
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {mods.map((m) => (
          <div key={m.key} className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-pf-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink-900">{m.nombre}</p>
              <button
                type="button"
                onClick={() => void toggle(m)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  m.default_on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {m.default_on ? "Default ON" : "Default OFF"}
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">{m.descripcion}</p>
            <p className="mt-2 font-mono text-[11px] text-slate-400">{m.key}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
