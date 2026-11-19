"use client";

import { useEffect, useState } from "react";
import { getAuth } from "@/lib/api";
import { formatCLP } from "@/lib/utils";

type Plan = {
  slug: string;
  nombre: string;
  precio: number;
  dte_mes: number;
  descripcion: string;
  features: string[];
};

export default function AdminPlanesPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [msg, setMsg] = useState("");

  function headers() {
    const a = getAuth();
    return { Authorization: `Bearer ${a?.token || ""}`, "Content-Type": "application/json" };
  }

  useEffect(() => {
    fetch("/api/v1/admin/planes", { headers: headers() })
      .then((r) => r.json())
      .then((j) => setPlans(j.data || []));
  }, []);

  async function save(plan: Plan) {
    setMsg("");
    const r = await fetch("/api/v1/admin/planes", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(plan),
    });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.message || "Error");
      return;
    }
    setPlans((prev) => prev.map((p) => (p.slug === j.data.slug ? j.data : p)));
    setMsg(`Plan ${j.data.nombre} guardado.`);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-fiscal">Planes</h1>
        <p className="text-sm text-[var(--ink-muted)]">Precio, límites DTE y módulos por defecto.</p>
      </div>
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <form
            key={p.slug}
            className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-pf-1"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void save({
                ...p,
                nombre: String(fd.get("nombre") || p.nombre),
                precio: Number(fd.get("precio") || 0),
                dte_mes: Number(fd.get("dte_mes") || 0),
                descripcion: String(fd.get("descripcion") || ""),
                features: String(fd.get("features") || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
            }}
          >
            <p className="text-xs font-semibold uppercase text-slate-500">{p.slug}</p>
            <label className="block text-sm">
              Nombre
              <input name="nombre" defaultValue={p.nombre} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="block text-sm">
              Precio CLP / mes
              <input name="precio" type="number" defaultValue={p.precio} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="block text-sm">
              DTE / mes (0 = ilimitado)
              <input name="dte_mes" type="number" defaultValue={p.dte_mes} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="block text-sm">
              Descripción
              <textarea name="descripcion" defaultValue={p.descripcion} className="mt-1 w-full rounded-lg border px-3 py-2" rows={2} />
            </label>
            <label className="block text-sm">
              Features (coma)
              <input
                name="features"
                defaultValue={p.features.join(",")}
                className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs"
              />
            </label>
            <p className="text-xs text-slate-500">
              Actual: {p.precio === 0 ? "Gratis" : formatCLP(p.precio)}
            </p>
            <button type="submit" className="w-full rounded-[10px] bg-[var(--pulso)] py-2 text-sm font-semibold text-white">
              Guardar
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
