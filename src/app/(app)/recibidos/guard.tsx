"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { btnPrimary, btnSecondary, card } from "@/lib/ui";

type Gate = "cargando" | "ok" | "sin-plan" | "error";

/** Bloquea la UI de Recibidos si el plan no incluye el módulo. */
export function RecibidosFeatureGate({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<Gate>("cargando");

  const check = useCallback(() => {
    setGate("cargando");
    api<{ data: string[] }>("/features")
      .then((r) => setGate((r.data || []).includes("recibidos") ? "ok" : "sin-plan"))
      .catch(() => setGate("error"));
  }, []);

  useEffect(check, [check]);

  if (gate === "cargando") {
    return (
      <div role="status" className="py-16 text-center text-sm text-[var(--ink-muted)]">
        Verificando módulo…
      </div>
    );
  }
  if (gate === "error") {
    return (
      <div role="alert" className={`${card} mx-auto max-w-lg p-8 text-center`}>
        <h2 className="font-display text-lg font-semibold text-fiscal">No pudimos revisar tu plan</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Falló la conexión con el servidor. Revisa tu internet e inténtalo de nuevo.
        </p>
        <button type="button" onClick={check} className={`${btnSecondary} mt-5`}>
          Reintentar
        </button>
      </div>
    );
  }
  if (gate === "sin-plan") {
    return (
      <div className={`${card} mx-auto max-w-lg p-8 text-center`}>
        <h2 className="font-display text-lg font-semibold text-fiscal">Recibidos no está en tu plan</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Activa el plan Profesional o Empresa, o pide a soporte que habilite el módulo Recibidos en tu cuenta.
        </p>
        <Link href="/suscripcion" className={`${btnPrimary} mt-5`}>
          Ver planes
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
