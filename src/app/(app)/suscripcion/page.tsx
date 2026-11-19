"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { formatCLP } from "@/lib/utils";

type Plan = {
  slug: string;
  nombre: string;
  precio: number;
  dte_mes: number;
  descripcion: string;
  features: string[];
};

export default function SuscripcionPage() {
  const [actual, setActual] = useState<{ slug: string; nombre: string; precio: number } | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await api<{
      plan_actual: { slug: string; nombre: string; precio: number };
      planes?: Plan[];
    }>("/suscripcion");
    setActual(r.plan_actual);
    if (r.planes?.length) setPlanes(r.planes);
    else {
      const p = await api<{ data: Plan[] }>("/planes");
      setPlanes(p.data || []);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  async function elegir(slug: string) {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const r = await api<{ plan_actual: { slug: string; nombre: string; precio: number }; message?: string }>(
        "/suscripcion",
        { method: "POST", body: JSON.stringify({ plan: slug }) },
      );
      setActual(r.plan_actual);
      setMsg(r.message || "Plan actualizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Planes" subtitle={`Plan actual: ${actual?.nombre ?? "—"}`}>
      {msg ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {msg}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {planes.map((p) => {
          const current = actual?.slug === p.slug;
          return (
            <div key={p.slug} className="rounded-[16px] border border-[var(--line)] bg-white p-5 shadow-pf-1">
              <p className="font-display text-lg font-semibold">{p.nombre}</p>
              <p className="mt-1 text-2xl font-bold text-[var(--pulso)]">
                {p.precio === 0 ? "Gratis" : formatCLP(p.precio)}
              </p>
              <p className="mt-2 text-sm text-slate-600">{p.descripcion}</p>
              <p className="mt-3 text-xs text-slate-500">
                {p.dte_mes === 0 ? "DTE ilimitados" : `${p.dte_mes} DTE / mes`}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{(p.features || []).join(" · ")}</p>
              <button
                type="button"
                disabled={saving || current}
                onClick={() => void elegir(p.slug)}
                className="mt-4 w-full rounded-[10px] border border-slate-200 py-2 text-sm font-semibold hover:bg-brand-50 disabled:opacity-60"
              >
                {current ? "Plan actual" : "Elegir plan"}
              </button>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
