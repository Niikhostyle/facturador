"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Cliente = {
  id: number;
  rut_formateado: string;
  razon_social: string;
  giro: string;
  email: string;
  comuna: string;
  ciudad: string;
};

export default function ClientesPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Cliente[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    razon_social: "",
    rut: "",
    dv: "",
    giro: "",
    email: "",
    direccion: "",
    comuna: "",
    ciudad: "",
  });

  async function load(query = q) {
    const r = await api<{ data: Cliente[] }>(`/clientes?per_page=50&q=${encodeURIComponent(query)}`);
    setRows(r.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/clientes", { method: "POST", body: JSON.stringify({ ...form, rut_formateado: `${form.rut}-${form.dv}` }) });
    setOpen(false);
    setForm({ razon_social: "", rut: "", dv: "", giro: "", email: "", direccion: "", comuna: "", ciudad: "" });
    await load();
  }

  return (
    <AppShell
      title="Clientes"
      subtitle="Directorio de empresas a las que facturas"
      actions={
        <button onClick={() => setOpen(true)} className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
          Nuevo cliente
        </button>
      }
    >
      <input
        className="card mb-4 w-full px-3 py-2.5 text-sm"
        placeholder="Buscar por razón social o RUT…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          load(e.target.value);
        }}
      />
      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-500">No hay clientes todavía</div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Razón social</th>
                <th className="px-4 py-3">RUT</th>
                <th className="px-4 py-3">Giro</th>
                <th className="px-4 py-3">Comuna</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{c.razon_social}</td>
                  <td className="px-4 py-3">{c.rut_formateado}</td>
                  <td className="px-4 py-3">{c.giro}</td>
                  <td className="px-4 py-3">{c.comuna}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <form onSubmit={onCreate} className="card w-full max-w-lg space-y-3 p-5">
            <h2 className="font-display text-lg font-semibold">Nuevo cliente</h2>
            {Object.entries(form).map(([k, v]) => (
              <input
                key={k}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder={k.replaceAll("_", " ")}
                value={v}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                required={["razon_social", "rut", "dv"].includes(k)}
              />
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rounded-xl px-3 py-2 text-sm" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Guardar</button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
