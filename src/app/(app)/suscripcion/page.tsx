"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { PLANES } from "@/lib/seed";
import { formatCLP } from "@/lib/utils";

export default function SuscripcionPage() {
  const [plan, setPlan] = useState<{ plan_actual: { nombre: string; precio: number } } | null>(null);
  useEffect(() => {
    api<typeof plan extends infer T ? NonNullable<T> : never>("/suscripcion").then(setPlan);
  }, []);

  return (
    <AppShell title="Planes" subtitle={`Plan actual: ${plan?.plan_actual.nombre ?? "—"}`}>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANES.map((p) => (
          <div key={p.slug} className="card p-5">
            <p className="font-display text-lg font-semibold">{p.nombre}</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">
              {p.precio === 0 ? "Gratis" : formatCLP(p.precio)}
            </p>
            <p className="mt-2 text-sm text-slate-600">{p.descripcion}</p>
            <p className="mt-3 text-xs text-slate-500">{p.dte_mes} DTE / mes</p>
            <button className="mt-4 w-full rounded-xl border border-slate-200 py-2 text-sm font-medium hover:bg-brand-50">
              {p.slug === "free" ? "Plan actual" : "Elegir plan"}
            </button>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
