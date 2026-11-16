"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { formatCLP } from "@/lib/utils";

type Producto = { id: number; codigo: string; nombre: string; precio: number; unidad: string; exento: boolean };

export default function ProductosPage() {
  const [rows, setRows] = useState<Producto[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ codigo: "", nombre: "", precio: "0", unidad: "UN", exento: false });

  async function load() {
    const r = await api<{ data: Producto[] }>("/productos?per_page=50");
    setRows(r.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/productos", {
      method: "POST",
      body: JSON.stringify({ ...form, precio: Number(form.precio) }),
    });
    setOpen(false);
    await load();
  }

  return (
    <AppShell
      title="Productos"
      subtitle="Catálogo para armar tus DTE"
      actions={
        <button onClick={() => setOpen(true)} className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
          Nuevo producto
        </button>
      }
    >
      <section className="card overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3 text-right">Precio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{p.codigo}</td>
                <td className="px-4 py-3 font-medium">{p.nombre}</td>
                <td className="px-4 py-3">{p.unidad}</td>
                <td className="px-4 py-3 text-right">{formatCLP(p.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <form onSubmit={onCreate} className="card w-full max-w-md space-y-3 p-5">
            <h2 className="font-display text-lg font-semibold">Nuevo producto</h2>
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            <input className="w-full rounded-xl border px-3 py-2 text-sm" type="number" placeholder="Precio" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm">Cancelar</button>
              <button className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Guardar</button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
