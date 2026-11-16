"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Key = { id: number; name: string; key: string; ambiente: string; activo: boolean; created_at: string; permissions: string[] };

export default function ApiKeysPage() {
  const [rows, setRows] = useState<Key[]>([]);
  async function load() {
    const r = await api<{ data: Key[] }>("/api-keys");
    setRows(r.data);
  }
  useEffect(() => {
    load();
  }, []);

  async function createKey() {
    await api("/api-keys", { method: "POST", body: JSON.stringify({ name: `Clave ${rows.length + 1}` }) });
    await load();
  }

  return (
    <AppShell
      title="API Keys"
      subtitle="Integración programática con el facturador"
      actions={
        <button onClick={createKey} className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
          Nueva clave
        </button>
      }
    >
      <div className="space-y-3">
        {rows.map((k) => (
          <div key={k.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900">{k.name}</p>
                <p className="font-mono text-xs text-slate-500">{k.key}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{k.ambiente}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">{k.permissions.join(" · ")}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
