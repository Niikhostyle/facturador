"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

export default function RecibidosPage() {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    api<{ total: number }>("/dte/recibidos?per_page=20").then((r) => setTotal(r.total ?? 0));
  }, []);
  return (
    <AppShell title="Recibidos" subtitle="Documentos de proveedores">
      <section className="card grid place-items-center py-16 text-center">
        <p className="font-medium text-ink-900">Sin documentos recibidos</p>
        <p className="mt-1 text-sm text-slate-500">Total en bandeja: {total}</p>
      </section>
    </AppShell>
  );
}
