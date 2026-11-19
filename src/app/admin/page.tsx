"use client";

import { useEffect, useState } from "react";
import { getAuth } from "@/lib/api";

type Stats = {
  empresas: number;
  usuarios: number;
  dtes_mes: number;
  cuentas_nuevas_30d: number;
  suspendidas: number;
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const a = getAuth();
    fetch("/api/v1/admin/stats", {
      headers: { Authorization: `Bearer ${a?.token || ""}` },
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || "Error");
        setStats(j.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-fiscal">Dashboard plataforma</h1>
        <p className="text-sm text-[var(--ink-muted)]">Vista global de cuentas y consumo.</p>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Empresas", stats?.empresas],
            ["Usuarios", stats?.usuarios],
            ["DTE este mes", stats?.dtes_mes],
            ["Nuevas (30d)", stats?.cuentas_nuevas_30d],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-pf-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink-900">
              {stats ? value : "—"}
            </p>
          </div>
        ))}
      </div>
      {stats?.suspendidas ? (
        <p className="text-sm text-amber-800">{stats.suspendidas} cuenta(s) suspendida(s).</p>
      ) : null}
    </div>
  );
}
