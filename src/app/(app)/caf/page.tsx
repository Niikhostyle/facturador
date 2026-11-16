"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Tipo = {
  tipo_dte: number;
  tipo_nombre: string;
  alerta: string;
  disponibles: number;
  autorizado_sii: boolean;
  caf_en_uso: { desde: number; hasta: number; vence_el: string } | null;
};

export default function CafPage() {
  const [ambiente, setAmbiente] = useState<"certificacion" | "produccion">("certificacion");
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [loadingTipo, setLoadingTipo] = useState<number | null>(null);

  async function load() {
    const r = await api<{ data: { tipos: Tipo[] } }>("/caf/estado");
    setTipos(r.data.tipos);
  }

  useEffect(() => {
    load();
  }, []);

  async function subir(tipo_dte: number) {
    setLoadingTipo(tipo_dte);
    try {
      await api("/caf/cargar", {
        method: "POST",
        body: JSON.stringify({ tipo_dte, cantidad: 100 }),
      });
      await load();
    } finally {
      setLoadingTipo(null);
    }
  }

  return (
    <AppShell
      title="Folios (CAF)"
      subtitle="Los folios que el SII te autoriza para emitir"
      actions={
        <button
          onClick={() => subir(33)}
          className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Subir CAF (.xml)
        </button>
      }
    >
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
        <button
          className={`rounded-lg px-3 py-1.5 ${ambiente === "produccion" ? "bg-slate-900 text-white" : ""}`}
          onClick={() => setAmbiente("produccion")}
        >
          Producción (palena)
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 ${ambiente === "certificacion" ? "bg-slate-900 text-white" : ""}`}
          onClick={() => setAmbiente("certificacion")}
        >
          Certificación (maullin)
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-600">
        Estás viendo los folios de <strong>{ambiente}</strong>. Parte en 0; al subir CAF aumentan los folios y el % de habilitación.
      </p>

      <div className="grid gap-3">
        {tipos.map((t) => (
          <div key={t.tipo_dte} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-ink-900">
                {t.tipo_nombre} <span className="text-xs text-slate-400">Tipo {t.tipo_dte}</span>
              </p>
              <p className="text-sm text-slate-500">
                {t.disponibles <= 0
                  ? "Sin folios para emitir"
                  : `Rango ${t.caf_en_uso?.desde}-${t.caf_en_uso?.hasta} · Vence ${t.caf_en_uso?.vence_el}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="font-display text-xl font-semibold">{t.disponibles}</p>
                <p className="text-xs text-slate-500">folios</p>
              </div>
              <button
                onClick={() => subir(t.tipo_dte)}
                disabled={loadingTipo === t.tipo_dte}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-brand-50 disabled:opacity-60"
              >
                {loadingTipo === t.tipo_dte ? "…" : "+ CAF"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <section className="card mt-4 p-5">
        <h3 className="font-display text-base font-semibold">¿Cómo obtener nuevos CAF?</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Ingresa a maullin.sii.cl (certificación) o www.sii.cl (producción)</li>
          <li>Ve a Factura Electrónica → Administración de CAF → Solicitud de CAF</li>
          <li>Selecciona el tipo de documento y la cantidad de folios</li>
          <li>Descarga el archivo XML del CAF</li>
          <li>Súbelo con el botón Subir CAF (.xml)</li>
        </ol>
      </section>
    </AppShell>
  );
}
