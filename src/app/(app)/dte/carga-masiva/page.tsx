"use client";

import { AppShell } from "@/components/AppShell";

export default function CargaMasivaPage() {
  return (
    <AppShell title="Carga masiva" subtitle="Emite varios DTE desde una planilla">
      <section className="card p-6 text-center">
        <p className="font-medium text-ink-900">Arrastra un CSV/XLSX o selecciónalo</p>
        <p className="mt-1 text-sm text-slate-500">
          Columnas esperadas: tipo_dte, receptor_rut, receptor_razon_social, item, cantidad, precio
        </p>
        <input type="file" accept=".csv,.xlsx" className="mx-auto mt-4 block text-sm" />
        <button className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
          Procesar carga (local)
        </button>
      </section>
    </AppShell>
  );
}
