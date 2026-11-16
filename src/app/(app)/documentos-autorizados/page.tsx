"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Doc = { tipo_dte: number; nombre: string; autorizado: boolean; ambiente: string };

export default function DocumentosAutorizadosPage() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await api<{ data: Doc[] }>("/documentos-autorizados");
    setRows(r.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function marcarInscripcion() {
    await api("/onboarding/paso", {
      method: "POST",
      body: JSON.stringify({ key: "inscripcion_sii" }),
    });
    await api("/onboarding/paso", {
      method: "POST",
      body: JSON.stringify({ key: "renuncia_portal_gratuito" }),
    });
    setMsg("Inscripción y salida del portal gratuito marcadas. Revisa el % en Dashboard.");
    await load();
  }

  return (
    <AppShell title="Documentos autorizados" subtitle="Estado SII por tipo de DTE">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={marcarInscripcion}
          className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Confirmar inscripción SII
        </button>
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      </div>
      <div className="space-y-2">
        {rows.map((d) => (
          <div key={d.tipo_dte} className="card flex items-center justify-between p-4 text-sm">
            <div>
              <p className="font-medium">{d.nombre}</p>
              <p className="text-slate-500">
                Tipo {d.tipo_dte} · {d.ambiente}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-xs ${
                d.autorizado ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {d.autorizado ? "Autorizado" : "Sin autorizar"}
            </span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
