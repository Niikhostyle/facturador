"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

export default function CuentaPage() {
  const [perfil, setPerfil] = useState<{ name: string; email: string; role: string } | null>(null);
  useEffect(() => {
    api<typeof perfil extends infer T ? NonNullable<T> : never>("/perfil").then(setPerfil);
  }, []);

  return (
    <AppShell title="Mi cuenta" subtitle="Usuario administrador">
      <section className="card space-y-2 p-5 text-sm">
        <p><span className="text-slate-500">Nombre:</span> {perfil?.name}</p>
        <p><span className="text-slate-500">Correo:</span> {perfil?.email}</p>
        <p><span className="text-slate-500">Rol:</span> {perfil?.role}</p>
      </section>
    </AppShell>
  );
}
