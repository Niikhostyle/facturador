"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, CreditCard, LayoutDashboard, LogOut, Puzzle } from "lucide-react";
import { clearAuth, getAuth } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/empresas", label: "Empresas", icon: Building2 },
  { href: "/admin/planes", label: "Planes", icon: CreditCard },
  { href: "/admin/modulos", label: "Módulos", icon: Puzzle },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = getAuth();
    if (!a?.token) {
      router.replace("/login");
      return;
    }
    if (!a.is_platform && a.user?.role !== "admin") {
      // Intentar: platform users tienen is_platform en login
      fetch("/api/v1/admin/stats", {
        headers: { Authorization: `Bearer ${a.token}` },
      }).then((r) => {
        if (!r.ok) router.replace("/dashboard");
        else setReady(true);
      });
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Cargando admin…</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--line)] bg-fiscal-deep text-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Plataforma</p>
          <p className="mt-1 font-display text-lg font-bold">Admin GDT</p>
        </div>
        <nav className="space-y-1 px-3 pb-4">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/10 px-3 py-4">
          <Link href="/dashboard" className="block rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10">
            Ir al facturador
          </Link>
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10"
            onClick={() => {
              clearAuth();
              router.replace("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="min-w-0 p-5 sm:p-8">{children}</main>
    </div>
  );
}
