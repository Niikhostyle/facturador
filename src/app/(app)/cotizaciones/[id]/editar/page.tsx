"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { formatCLP } from "@/lib/utils";
import { formatRutPuntos, partesRut } from "@/lib/sii/rut";
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
type ItemForm = { nombre: string; cantidad: number; precio: number; exento: boolean };

export default function EditarCotizacionPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || "");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState("");
  const [validez, setValidez] = useState(15);
  const [notas, setNotas] = useState("");
  const [estado, setEstado] = useState<Cotizacion["estado"]>("guardada");
  const [items, setItems] = useState<ItemForm[]>([{ nombre: "", cantidad: 1, precio: 0, exento: false }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api<{ data: Cotizacion }>(`/cotizaciones/${id}`),
      api<{ data: Cliente[] }>("/clientes?per_page=50"),
      api<{ data: Producto[] }>("/productos?per_page=50"),
    ])
      .then(([cRes, cli, prod]) => {
        const c = cRes.data;
        setCot(c);
        setClientes(cli.data);
        setProductos(prod.data);
        setFecha(c.fecha);
        setValidez(c.validez_dias);
        setNotas(c.notas || "");
        setEstado(c.estado);
        setItems(
          c.items.length
            ? c.items.map((it) => ({
                nombre: it.nombre,
                cantidad: it.cantidad,
                precio: it.precio,
                exento: Boolean(it.exento),
              }))
            : [{ nombre: "", cantidad: 1, precio: 0, exento: false }],
        );

        const limpio = `${c.receptor_rut}`.replace(/\./g, "");
        const match = cli.data.find(
          (x) =>
            `${x.rut}-${x.dv}`.toUpperCase() === limpio.toUpperCase() ||
            formatRutPuntos(`${x.rut}-${x.dv}`) === formatRutPuntos(c.receptor_rut) ||
            x.razon_social === c.receptor_razon_social,
        );
        setClienteId(match ? String(match.id) : "");
        setReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "No se pudo cargar");
        setReady(true);
      });
  }, [id]);

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
    if (!cot) return;
    setLoading(true);
    setError("");
    try {
      const cliente = clientes.find((c) => String(c.id) === clienteId);
      let receptor = {
        rut: cot.receptor_rut,
        razon_social: cot.receptor_razon_social,
        giro: cot.receptor_giro,
        direccion: cot.receptor_direccion,
        comuna: cot.receptor_comuna,
        email: cot.receptor_email,
      };
      if (cliente) {
        receptor = {
          rut: `${cliente.rut}-${cliente.dv}`,
          razon_social: cliente.razon_social,
          giro: cliente.giro,
          direccion: cliente.direccion,
          comuna: cliente.comuna,
          email: cliente.email,
        };
      } else if (!partesRut(receptor.rut).cuerpo) {
        throw new Error("Selecciona un cliente");
      }
      if (!items.some((it) => it.nombre && Number(it.cantidad) > 0)) {
        throw new Error("Agrega al menos un ítem válido");
      }
      await api(`/cotizaciones/${cot.id}`, {
        method: "PUT",
        body: JSON.stringify({
          fecha,
          validez_dias: validez,
          notas,
          estado,
          receptor,
          items: items.map((it) => ({
            nombre: it.nombre,
            cantidad: Number(it.cantidad),
            precio: Number(it.precio),
            exento: it.exento,
          })),
        }),
      });
      router.push(`/cotizaciones/${cot.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <AppShell title="Editar cotización">
        <p className="text-sm text-slate-500">Cargando…</p>
      </AppShell>
    );
  }

  if (!cot) {
    return (
      <AppShell title="Editar cotización">
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error || "No encontrada"}</p>
        <Link href="/cotizaciones" className="mt-3 inline-block text-sm text-brand-700">
          ← Volver
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell title={`Editar ${cot.numero}`} subtitle="Modifica cliente, ítems o condiciones">
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={`/cotizaciones/${cot.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          ← Volver al detalle
        </Link>
      </div>

      <form onSubmit={onSubmit} className="card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Cliente</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">Mantener: {cot.receptor_razon_social}</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social} ({c.rut_formateado})
                </option>
              ))}
            </select>
          </label>
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
          <label className="text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block font-medium">Estado</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 capitalize"
              value={estado}
              onChange={(e) => setEstado(e.target.value as Cotizacion["estado"])}
            >
              {(["borrador", "guardada", "enviada", "aceptada", "rechazada", "anulada"] as const).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
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
                <input
                  list="productos-list-cot-edit"
                  placeholder="Producto / servicio"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm sm:col-span-5"
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
                <input
                  type="number"
                  min={1}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm sm:col-span-2"
                  value={it.cantidad}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, cantidad: Number(e.target.value) } : row)),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm sm:col-span-3"
                  value={it.precio}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, precio: Number(e.target.value) } : row)),
                    )
                  }
                />
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-red-600 sm:col-span-2"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={items.length <= 1}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <datalist id="productos-list-cot-edit">
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push(`/cotizaciones/${cot.id}`)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            disabled={loading}
            className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
