"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { formatCLP, monthRange } from "@/lib/utils";
import { TIPOS_DTE } from "@/lib/seed";

type Row = {
  id: number;
  tipo_dte: number;
  tipo_nombre: string;
  folio: number;
  fecha_emision: string;
  receptor_rut: string;
  receptor_razon_social: string;
  monto_total: number;
  estado: string;
};

export default function DtePage() {
  const range = monthRange();
  const [tab, setTab] = useState<"todos" | "facturas" | "boletas">("todos");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [desde, setDesde] = useState(range.desde);
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      per_page: "50",
      page: "1",
      desde,
      hasta,
      sort: "fecha_emision",
      dir: "desc",
    });
    if (q) params.set("q", q);
    if (tipo) params.set("tipo_dte", tipo);
    if (estado) params.set("estado", estado);
    if (tab === "facturas") params.set("tipo_dte", "33");
    if (tab === "boletas") params.set("tipo_dte", "39");
    setLoading(true);
    api<{ data: Row[]; meta: { total: number } }>(`/dte?${params}`)
      .then((r) => {
        setRows(r.data);
        setTotal(r.meta.total);
      })
      .finally(() => setLoading(false));
  }, [q, tipo, estado, desde, hasta, tab]);

  return (
    <AppShell title="Documentos Tributarios" subtitle={`${total} documentos`}>
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">Exportar CSV</button>
        <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">Libro de guías</button>
      </div>

      <section className="card mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(
            [
              ["todos", "Todos"],
              ["facturas", "Facturas"],
              ["boletas", "Boletas"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === k ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          placeholder="Buscar por nombre o RUT del receptor..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="">Todos los tipos</option>
            {TIPOS_DTE.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.nombre}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {["pendiente", "enviado", "aceptado", "rechazado", "anulado"].map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Desde</span>
            <input type="date" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Hasta</span>
            <input type="date" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="card overflow-hidden">
        {loading ? (
          <div className="grid place-items-center py-16 text-sm text-slate-500">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <p className="font-medium text-ink-900">Sin documentos en este filtro</p>
            <p className="mt-1 text-sm text-slate-500">Emite un DTE con el botón +</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Tipo / Folio</th>
                  <th className="px-4 py-3 font-medium">Receptor</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">{r.tipo_nombre}</p>
                      <p className="text-xs text-slate-500">Folio {r.folio}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{r.receptor_razon_social}</p>
                      <p className="text-xs text-slate-500">{r.receptor_rut}</p>
                    </td>
                    <td className="px-4 py-3">{r.fecha_emision}</td>
                    <td className="px-4 py-3 capitalize">{r.estado}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCLP(r.monto_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>50 / pág.</span>
          <span>Página 1 de 1</span>
        </div>
      </section>
    </AppShell>
  );
}
