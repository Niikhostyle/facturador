"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Settings2,
  Shield,
  Upload,
  Users,
  X,
  CalendarClock,
  Inbox,
  BadgeCheck,
  BookOpen,
  CreditCard,
  Blocks,
} from "lucide-react";
import { clearAuth, getAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuthState } from "@/lib/types";

const NAV = [
  {
    section: "Operación",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dte", label: "Documentos", icon: FileText },
      { href: "/dte/carga-masiva", label: "Carga masiva", icon: Upload },
      { href: "/dte/programadas", label: "Programadas", icon: CalendarClock },
      { href: "/recibidos", label: "Recibidos", icon: Inbox },
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/productos", label: "Productos", icon: Package },
    ],
  },
  {
    section: "Cumplimiento SII",
    items: [
      { href: "/sii", label: "Conexión SII", icon: Shield },
      { href: "/caf", label: "CAF / Folios", icon: Receipt },
      { href: "/documentos-autorizados", label: "Documentos autorizados", icon: BadgeCheck },
      { href: "/contable", label: "Contable", icon: BookOpen },
      { href: "/certificado", label: "Certificado", icon: Shield },
    ],
  },
  {
    section: "Integraciones",
    items: [{ href: "/api-keys", label: "API Keys", icon: KeyRound }],
  },
  {
    section: "Cuenta",
    items: [
      { href: "/empresa", label: "Mi empresa", icon: Building2 },
      { href: "/cuenta", label: "Mi cuenta", icon: Settings2 },
      { href: "/suscripcion", label: "Planes", icon: CreditCard },
      { href: "/modulos", label: "Módulos", icon: Blocks },
    ],
  },
];

const DTE_TYPES = [
  { tipo: 33, label: "Factura Electrónica" },
  { tipo: 39, label: "Boleta Electrónica" },
  { tipo: 61, label: "Nota de Crédito" },
  { tipo: 56, label: "Nota de Débito" },
  { tipo: 52, label: "Guía de Despacho" },
  { tipo: 46, label: "Factura de Compra" },
];

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [auth, setAuthState] = useState<AuthState | null>(null);
  const [open, setOpen] = useState(false);
  const [menuDte, setMenuDte] = useState(false);

  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login");
      return;
    }
    setAuthState(a);
  }, [router]);

  const initials = useMemo(() => {
    const n = auth?.user?.name || "G";
    return n
      .split(" ")
      .slice(0, 1)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }, [auth]);

  function logout() {
    clearAuth();
    router.replace("/login");
  }

  if (!auth) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f3f5f8] text-slate-500">
        Cargando sesión…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f5f8] bg-app-grid text-ink-800">
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/40 transition lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[288px] flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-amber-500 text-sm font-bold text-white shadow-sm">
              GDT
            </span>
            <span className="leading-tight">
              <span className="block font-display text-sm font-semibold tracking-tight text-ink-900">
                Facturador
              </span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
                GDT DevSur
              </span>
            </span>
          </Link>
          <button className="rounded-lg p-2 text-slate-500 lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <p className="truncate text-sm font-semibold text-ink-900">{auth.tenant.razon_social}</p>
          <p className="text-xs text-slate-500">{auth.tenant.rut_formateado}</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV.map((group) => (
            <div key={group.section} className="mb-4">
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group.section}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition",
                          active
                            ? "bg-brand-50 font-semibold text-brand-700"
                            : "text-slate-600 hover:bg-slate-50 hover:text-ink-900",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 rounded-xl bg-slate-50 px-3 py-2">
            <p className="truncate text-sm font-medium text-ink-900">{auth.user.name}</p>
            <p className="truncate text-xs text-slate-500">
              {auth.user.role} · {auth.user.email}
            </p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg font-semibold text-ink-900 sm:text-xl">
                {title}
              </h1>
              {subtitle ? <p className="truncate text-sm text-slate-500">{subtitle}</p> : null}
            </div>
            <span className="hidden items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              Certificación
            </span>
            {actions}
            <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-sm font-semibold text-white">
              {initials}
            </div>
            <div className="relative">
              <button
                onClick={() => setMenuDte((v) => !v)}
                className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                aria-label="Nuevo DTE"
              >
                <Plus className="h-5 w-5" />
              </button>
              {menuDte ? (
                <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    ¿Qué vas a emitir?
                  </p>
                  {DTE_TYPES.map((t) => (
                    <Link
                      key={t.tipo}
                      href={`/dte/nuevo?tipo=${t.tipo}`}
                      onClick={() => setMenuDte(false)}
                      className="block px-3 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {t.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
