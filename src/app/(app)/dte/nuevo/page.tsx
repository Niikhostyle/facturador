"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { TIPOS_DTE } from "@/lib/seed";
import { formatCLP } from "@/lib/utils";

function NuevoDteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const tipo = Number(params.get("tipo") || 33);
  const tipoNombre = TIPOS_DTE.find((t) => t.codigo === tipo)?.nombre || `Tipo ${tipo}`;

  const [clientes, setClientes] = useState<{ id: number; razon_social: string; rut: string; dv: string; rut_formateado: string }[]>([]);
  const [productos, setProductos] = useState<{ id: number; nombre: string; precio: number; exento: boolean }[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ nombre: "", cantidad: 1, precio: 0, exento: false }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ data: typeof clientes }>("/clientes?per_page=50"),
      api<{ data: typeof productos }>("/productos?per_page=50"),
    ]).then(([c, p]) => {
      setClientes(c.data);
      setProductos(p.data);
      if (c.data[0]) setClienteId(String(c.data[0].id));
      if (p.data[0]) {
        setItems([{ nombre: p.data[0].nombre, cantidad: 1, precio: p.data[0].precio, exento: p.data[0].exento }]);
      }
    });
  }, []);

  const totals = useMemo(() => {
    const neto = items.reduce((acc, it) => acc + Number(it.cantidad) * Number(it.precio), 0);
    const iva = Math.round(neto * 0.19);
    return { neto, iva, total: neto + iva };
  }, [items]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const cliente = clientes.find((c) => String(c.id) === clienteId);
      if (!cliente) throw new Error("Selecciona un cliente");
      await api("/dte", {
        method: "POST",
        body: JSON.stringify({
          tipo_dte: tipo,
          fecha_emision: fecha,
          receptor: {
            rut: cliente.rut,
            dv: cliente.dv,
            razon_social: cliente.razon_social,
          },
          items: items.map((it) => ({
            nombre: it.nombre,
            cantidad: Number(it.cantidad),
            precio: Number(it.precio),
            exento: it.exento,
          })),
        }),
      });
      router.push("/dte");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo emitir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Nuevo DTE" subtitle={tipoNombre}>
      <Link href="/dte" className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        ← Volver
      </Link>

      <form onSubmit={onSubmit} className="card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Receptor</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              required
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social} ({c.rut_formateado})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Fecha de emisión</span>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Detalle</p>
            <button
              type="button"
              className="text-sm font-medium text-brand-700"
              onClick={() => setItems((prev) => [...prev, { nombre: "", cantidad: 1, precio: 0, exento: false }])}
            >
              + Ítem
            </button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-12">
                <select
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm sm:col-span-5"
                  value={it.nombre}
                  onChange={(e) => {
                    const p = productos.find((x) => x.nombre === e.target.value);
                    setItems((prev) =>
                      prev.map((row, i) =>
                        i === idx
                          ? {
                              nombre: e.target.value,
                              cantidad: row.cantidad,
                              precio: p?.precio ?? row.precio,
                              exento: p?.exento ?? false,
                            }
                          : row,
                      ),
                    );
                  }}
                >
                  <option value="">Producto / servicio</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.nombre}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm sm:col-span-2"
                  value={it.cantidad}
                  onChange={(e) =>
                    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, cantidad: Number(e.target.value) } : row)))
                  }
                />
                <input
                  type="number"
                  min={0}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm sm:col-span-3"
                  value={it.precio}
                  onChange={(e) =>
                    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, precio: Number(e.target.value) } : row)))
                  }
                />
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-red-600 sm:col-span-2"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between"><span>Neto</span><span>{formatCLP(totals.neto)}</span></div>
          <div className="mt-1 flex justify-between"><span>IVA 19%</span><span>{formatCLP(totals.iva)}</span></div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <span>Total</span><span>{formatCLP(totals.total)}</span>
          </div>
        </div>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <button
          disabled={loading}
          className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Emitiendo…" : "Emitir DTE (simulado)"}
        </button>
      </form>
    </AppShell>
  );
}

export default function NuevoDtePage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center">Cargando…</div>}>
      <NuevoDteForm />
    </Suspense>
  );
}
