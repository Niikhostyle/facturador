"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";

type Ready = {
  ready: boolean;
  missing_count: number;
  enabled: boolean;
  ambiente: string;
  can_request_token: boolean;
  endpoints: { seed: string; token: string; upload: string };
  requirements: { key: string; label: string; ok: boolean; detail: string; how: string }[];
};

type Probe = {
  readiness: Ready;
  seed?: { ok: boolean; value?: string; error?: string };
  token?: { ok: boolean; value?: string; error?: string };
};

type Pending = { item: string; why: string; where: string }[];

export default function SiiPage() {
  const [ready, setReady] = useState<Ready | null>(null);
  const [pending, setPending] = useState<Pending>([]);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const [r, p] = await Promise.all([
      api<Ready>("/sii/estado"),
      api<{ data: Pending }>("/sii/pendiente"),
    ]);
    setReady(r);
    setPending(p.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function runProbe() {
    setLoading(true);
    setProbe(null);
    try {
      const r = await api<Probe>("/sii/probe", { method: "POST", body: "{}" });
      setProbe(r);
      await load();
    } catch (e) {
      setProbe({
        readiness: ready!,
        seed: { ok: false, error: e instanceof Error ? e.message : "Error" },
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Conexión SII" subtitle="Checklist y prueba hacia maullin / palena">
      <div className="space-y-4">
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-semibold text-ink-900">Estado de integración</p>
              <p className="text-sm text-slate-500">
                Ambiente: <strong>{ready?.ambiente ?? "…"}</strong>
                {ready?.enabled ? " · SII_ENABLED=true" : " · simulación local (SII_ENABLED=false)"}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                ready?.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              {ready?.ready ? "Listo para SII" : `${ready?.missing_count ?? "…"} pendiente(s)`}
            </span>
          </div>

          <ul className="mt-4 space-y-2">
            {ready?.requirements.map((r) => (
              <li key={r.key} className="flex items-start gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{r.label}</p>
                  <p className="text-xs text-slate-500">{r.detail}</p>
                  {!r.ok ? <p className="mt-0.5 text-xs text-brand-700">{r.how}</p> : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={runProbe}
              disabled={loading}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Probando…" : "Probar semilla / token SII"}
            </button>
            <button
              onClick={load}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium"
            >
              Actualizar checklist
            </button>
          </div>

          {probe ? (
            <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <p>
                <strong>Semilla:</strong>{" "}
                {probe.seed?.ok ? `OK (${probe.seed.value})` : probe.seed?.error || "—"}
              </p>
              <p>
                <strong>Token:</strong>{" "}
                {probe.token?.ok ? `OK (${probe.token.value})` : probe.token?.error || "—"}
              </p>
            </div>
          ) : null}
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-brand-600" />
            <h2 className="font-display text-base font-semibold">Qué necesito que me entregues</h2>
          </div>
          <ol className="space-y-3">
            {pending.map((p, i) => (
              <li key={p.item} className="rounded-xl border border-slate-100 px-3 py-3 text-sm">
                <p className="font-medium text-ink-900">
                  {i + 1}. {p.item}
                </p>
                <p className="text-slate-600">{p.why}</p>
                <p className="text-xs text-slate-500">Dónde: {p.where}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-slate-600">
            Cuando los tengas: coloca el <code className="rounded bg-slate-100 px-1">.p12</code> en{" "}
            <code className="rounded bg-slate-100 px-1">data/certs/empresa.p12</code>, los CAF en{" "}
            <code className="rounded bg-slate-100 px-1">data/caf/</code>, crea{" "}
            <code className="rounded bg-slate-100 px-1">.env.local</code> desde{" "}
            <code className="rounded bg-slate-100 px-1">.env.example</code> y avísame.
          </p>
        </section>

        <section className="card p-5 text-sm text-slate-600">
          <p className="font-medium text-ink-900">Endpoints configurados</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li>seed: {ready?.endpoints.seed}</li>
            <li>token: {ready?.endpoints.token}</li>
            <li>upload: {ready?.endpoints.upload}</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
