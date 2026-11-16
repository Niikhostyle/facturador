"use client";

import { AppShell } from "@/components/AppShell";

export default function ProgramadasPage() {
  return (
    <AppShell title="Programadas" subtitle="Emisiones recurrentes">
      <section className="card grid place-items-center py-16 text-center">
        <p className="font-medium text-ink-900">Sin programaciones</p>
        <p className="mt-1 text-sm text-slate-500">Programa boletas o facturas periódicas desde aquí.</p>
      </section>
    </AppShell>
  );
}
