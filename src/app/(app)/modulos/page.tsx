"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Modulo = { key: string; nombre: string; activo: boolean; descripcion: string };

export default function ModulosPage() {
  const [rows, setRows] = useState<Modulo[]>([]);
  useEffect(() => {
    api<{ data: Modulo[] }>("/modulos").then((r) => setRows(r.data));
  }, []);

  return (
    <AppShell title="Módulos" subtitle="Funciones activas de tu cuenta">
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((m) => (
          <div key={m.key} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-ink-900">{m.nombre}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs ${m.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {m.activo ? "Activo" : "Inactivo"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{m.descripcion}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
