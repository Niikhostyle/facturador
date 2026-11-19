"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { formatCLP } from "@/lib/utils";
import type { Cotizacion } from "@/lib/types";

type Cliente = {
  id: number;
  razon_social: string;
  rut: string;
  dv: string;
  rut_formateado: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  email?: string;
};
type Producto = { id: number; nombre: string; precio: number; exento: boolean };

export default function NuevaCotizacionPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [validez, setValidez] = useState(15);
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState([{ nombre: "", cantidad: 1, precio: 0, exento: false }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ data: Cliente[] }>("/clientes?per_page=50"),
      api<{ data: Producto[] }>("/productos?per_page=50"),
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
    let neto = 0;
    let exento = 0;
    for (const it of items) {
      const monto = Number(it.cantidad) * Number(it.precio);
      if (it.exento) exento += monto;
      else neto += monto;
    }
    const iva = Math.round(neto * 0.19);
    return { neto, exento, iva, total: neto + iva + exento };
  }, [items]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const cliente = clientes.find((c) => String(c.id) === clienteId);
      if (!cliente) throw new Error("Selecciona un cliente");
      if (!items.some((it) => it.nombre && Number(it.precio) >= 0 && Number(it.cantidad) > 0)) {
        throw new Error("Agrega al menos un ítem válido");
      }
      const res = await api<{ data: Cotizacion; archivo_path: string }>("/cotizaciones", {
        method: "POST",
        body: JSON.stringify({
          fecha,
          validez_dias: validez,
          notas,
          estado: "guardada",
          receptor: {
            rut: `${cliente.rut}-${cliente.dv}`,
            razon_social: cliente.razon_social,
            giro: cliente.giro,
            direccion: cliente.direccion,
            comuna: cliente.comuna,
            email: cliente.email,
          },
          items: items.map((it) => ({
            nombre: it.nombre,
            cantidad: Number(it.cantidad),
            precio: Number(it.precio),
            exento: it.exento,
          })),
        }),
      });
      router.push(`/cotizaciones/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Nueva cotización" subtitle="Documento comercial · no se envía al SII">
      <Link href="/cotizaciones" className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        ← Volver
      </Link>

      <form onSubmit={onSubmit} className="card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="text-sm sm:col-span-1">
            <label className="mb-1 block font-medium" htmlFor="cot-cliente">
              Cliente
            </label>
            <select
              id="cot-cliente"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              required
            >
              <option value="">Selecciona…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social} ({c.rut_formateado})
                </option>
              ))}
            </select>
            {clientes.length === 0 ? (
              <p className="mt-1.5 text-xs text-slate-500">
                No hay clientes.{" "}
                <Link href="/clientes" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                  Crear uno
                </Link>
              </p>
            ) : null}
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Fecha</span>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Validez (días)</span>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={validez}
              onChange={(e) => setValidez(Number(e.target.value))}
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
          <div className="mb-1 hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
            <span className="col-span-5">Producto / servicio</span>
            <span className="col-span-2">Cantidad</span>
            <span className="col-span-3">Precio</span>
            <span className="col-span-2 sr-only">Acciones</span>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-12">
                <label className="block text-sm sm:col-span-5">
                  <span className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">Producto / servicio</span>
                  <input
                    list="productos-list-cot"
                    placeholder="Producto / servicio"
                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={it.nombre}
                    onChange={(e) => {
                      const p = productos.find((x) => x.nombre === e.target.value);
                      setItems((prev) =>
                        prev.map((row, i) =>
                          i === idx
                            ? {
                                ...row,
                                nombre: e.target.value,
                                precio: p ? p.precio : row.precio,
                                exento: p ? p.exento : row.exento,
                              }
                            : row,
                        ),
                      );
                    }}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">Cantidad</span>
                  <input
                    type="number"
                    min={1}
                    aria-label={`Cantidad ítem ${idx + 1}`}
                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={it.cantidad}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, cantidad: Number(e.target.value) } : row)),
                      )
                    }
                  />
                </label>
                <label className="block text-sm sm:col-span-3">
                  <span className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">Precio</span>
                  <input
                    type="number"
                    min={0}
                    aria-label={`Precio ítem ${idx + 1}`}
                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={it.precio}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, precio: Number(e.target.value) } : row)),
                      )
                    }
                  />
                </label>
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
          {productos.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              Catálogo vacío: escribe el ítem a mano o{" "}
              <Link href="/productos" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                crea productos
              </Link>
              .
            </p>
          ) : null}
          <datalist id="productos-list-cot">
            {productos.map((p) => (
              <option key={p.id} value={p.nombre} />
            ))}
          </datalist>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Notas / condiciones</span>
          <textarea
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Forma de pago, plazos, observaciones…"
          />
        </label>

        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between">
            <span>Neto</span>
            <span>{formatCLP(totals.neto)}</span>
          </div>
          {totals.exento > 0 && (
            <div className="mt-1 flex justify-between">
              <span>Exento</span>
              <span>{formatCLP(totals.exento)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between">
            <span>IVA 19%</span>
            <span>{formatCLP(totals.iva)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{formatCLP(totals.total)}</span>
          </div>
        </div>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            disabled={loading}
            className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Guardando…" : "Guardar y continuar"}
          </button>
          <p className="text-xs text-slate-500">Después podrás enviar el PDF o convertir a DTE.</p>
        </div>
      </form>
    </AppShell>
  );
}
