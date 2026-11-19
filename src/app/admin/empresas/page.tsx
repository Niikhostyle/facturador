"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAuth } from "@/lib/api";
import { formatCLP } from "@/lib/utils";

type Empresa = {
  id: number;
  rut_formateado: string;
  razon_social: string;
  plan: string;
  estado: string;
  features: string[];
  max_dte_mes: number;
  usuarios: number;
  created_at: string;
};

export default function AdminEmpresasPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Empresa[]>([]);
  const [error, setError] = useState("");

  function load(query = q) {
    const a = getAuth();
    fetch(`/api/v1/admin/empresas?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${a?.token || ""}` },
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || "Error");
        setRows(j.data || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }

  useEffect(() => {
    load("");
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-fiscal">Empresas</h1>
        <p className="text-sm text-[var(--ink-muted)]">Cuentas independientes registradas en la plataforma.</p>
      </div>
      <input
        className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        placeholder="Buscar por RUT o razón social…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          load(e.target.value);
        }}
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-white shadow-pf-1">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Módulos</th>
              <th className="px-4 py-3">Usuarios</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink-900">{e.razon_social}</p>
                  <p className="text-xs text-slate-500">{e.rut_formateado}</p>
                </td>
                <td className="px-4 py-3 capitalize">{e.plan}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      e.estado === "activa" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {e.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{e.features?.join(", ")}</td>
                <td className="px-4 py-3">{e.usuarios}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/empresas/${e.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="py-10 text-center text-sm text-slate-500">Sin empresas.</p> : null}
      </div>
      <p className="text-xs text-slate-400">Límites DTE se configuran por plan ({formatCLP(0)} = gratis en catálogo).</p>
    </div>
  );
}
