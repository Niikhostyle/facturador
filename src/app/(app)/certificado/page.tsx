"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Cert = {
  tiene_certificado: boolean;
  data: {
    vigente: boolean;
    sujeto: string;
    emisor: string;
    vence_el: string;
    dias_restantes: number;
  } | null;
};

export default function CertificadoPage() {
  const [data, setData] = useState<Cert | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setData(await api<Cert>("/certificado/estado"));
  }

  useEffect(() => {
    load();
  }, []);

  async function upload() {
    setLoading(true);
    try {
      await api("/certificado", { method: "POST", body: JSON.stringify({}) });
      await load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Certificado digital" subtitle="Firma electrónica para el SII">
      <section className="card p-5">
        {data?.tiene_certificado && data.data ? (
          <div className="space-y-2 text-sm">
            <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
              Vigente · {data.data.dias_restantes} días
            </p>
            <p>
              <span className="text-slate-500">Titular:</span> {data.data.sujeto}
            </p>
            <p>
              <span className="text-slate-500">Emisor:</span> {data.data.emisor}
            </p>
            <p>
              <span className="text-slate-500">Vence:</span> {data.data.vence_el}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <p className="font-medium text-ink-900">No hay certificado cargado</p>
            <p className="mt-1 text-sm text-slate-500">
              Al cargar el .p12 el paso “Certificado digital” marca completo y sube el %.
            </p>
          </div>
        )}
        <button
          onClick={upload}
          disabled={loading}
          className="mt-4 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Cargando…" : data?.tiene_certificado ? "Renovar certificado (.p12)" : "Subir certificado (.p12)"}
        </button>
      </section>
    </AppShell>
  );
}
