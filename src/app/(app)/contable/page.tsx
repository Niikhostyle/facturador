"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { formatCLP } from "@/lib/utils";

export default function ContablePage() {
  const [data, setData] = useState<{ periodo: string; ventas: number; compras: number; documentos: number } | null>(null);
  useEffect(() => {
    api<{ data: typeof data extends infer T ? NonNullable<T> : never }>("/contable").then((r) => setData(r.data));
  }, []);

  return (
    <AppShell title="Contable" subtitle="Resumen RCV / libros">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-slate-500">Periodo</p><p className="text-xl font-semibold">{data?.periodo ?? "—"}</p></div>
        <div className="card p-4"><p className="text-sm text-slate-500">Ventas</p><p className="text-xl font-semibold">{formatCLP(data?.ventas ?? 0)}</p></div>
        <div className="card p-4"><p className="text-sm text-slate-500">Documentos</p><p className="text-xl font-semibold">{data?.documentos ?? 0}</p></div>
      </div>
    </AppShell>
  );
}
