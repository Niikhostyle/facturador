"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuth } from "@/lib/api";

type Detail = {
  id: number;
  razon_social: string;
  rut_formateado: string;
  plan: string;
  estado: string;
  features: string[];
  feature_overrides?: Record<string, boolean>;
  max_dte_mes: number;
  users: { id: number; name: string; email: string; role: string; activo: boolean }[];
};

const ALL_FEATURES = ["dte", "recibidos", "programadas", "carga_masiva", "api", "contable"];

export default function AdminEmpresaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [plans, setPlans] = useState<{ slug: string; nombre: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function headers() {
    const a = getAuth();
    return { Authorization: `Bearer ${a?.token || ""}`, "Content-Type": "application/json" };
  }

  function load() {
    Promise.all([
      fetch(`/api/v1/admin/empresas/${id}`, { headers: headers() }).then((r) => r.json()),
      fetch("/api/v1/admin/planes", { headers: headers() }).then((r) => r.json()),
    ])
      .then(([emp, pl]) => {
        if (emp.message && !emp.data) throw new Error(emp.message);
        setData(emp.data);
        setPlans(pl.data || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const r = await fetch(`/api/v1/admin/empresas/${id}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "No se pudo guardar");
      setData((d) => (d ? { ...d, ...j.data, features: j.data.features } : j.data));
      setMsg("Guardado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  if (!data && !error) return <p className="text-sm text-slate-500">Cargando…</p>;
  if (!data) return <p className="text-sm text-red-700">{error}</p>;

  const featSet = new Set(data.features || []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/admin/empresas" className="text-sm text-brand-700 hover:underline">
          ← Empresas
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-fiscal">{data.razon_social}</h1>
        <p className="text-sm text-slate-500">{data.rut_formateado}</p>
      </div>
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-pf-1">
        <h2 className="font-semibold text-ink-900">Plan y estado</h2>
        <label className="block text-sm">
          Plan
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={data.plan}
            disabled={saving}
            onChange={(e) => void save({ plan: e.target.value })}
          >
            {plans.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Estado
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={data.estado}
            disabled={saving}
            onChange={(e) => void save({ estado: e.target.value })}
          >
            <option value="activa">Activa</option>
            <option value="suspendida">Suspendida</option>
          </select>
        </label>
        <label className="block text-sm">
          Límite DTE / mes (0 = ilimitado)
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            defaultValue={data.max_dte_mes}
            onBlur={(e) => void save({ max_dte_mes: Number(e.target.value) })}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-pf-1">
        <h2 className="font-semibold text-ink-900">Módulos (override por empresa)</h2>
        <p className="text-xs text-slate-500">Incluye Recibidos y el resto. Marca para forzar on/off respecto al plan.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ALL_FEATURES.map((f) => (
            <label key={f} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={featSet.has(f)}
                disabled={saving}
                onChange={(e) => void save({ features: { [f]: e.target.checked } })}
              />
              <span className="capitalize">{f.replace("_", " ")}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-pf-1">
        <h2 className="font-semibold text-ink-900">Usuarios</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {data.users?.map((u) => (
            <li key={u.id} className="flex justify-between py-2 text-sm">
              <span>
                {u.name} · {u.email}
              </span>
              <span className="text-slate-500">{u.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <button type="button" className="text-sm text-slate-500 hover:underline" onClick={() => router.push("/admin/empresas")}>
        Volver
      </button>
    </div>
  );
}
