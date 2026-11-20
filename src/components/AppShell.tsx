"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ClipboardList,
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
  Headset,
  ChevronDown,
  ShieldCheck,
  FilePlus2,
} from "lucide-react";
import { clearAuth, getAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuthState } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  feature?: string;
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operación",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dte", label: "Documentos", icon: FileText, feature: "dte" },
      { href: "/cotizaciones", label: "Cotizaciones", icon: ClipboardList },
      { href: "/dte/carga-masiva", label: "Carga masiva", icon: Upload, feature: "carga_masiva" },
      { href: "/dte/programadas", label: "Programadas", icon: CalendarClock, feature: "programadas" },
      { href: "/recibidos", label: "Recibidos", icon: Inbox, feature: "recibidos" },
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/productos", label: "Productos", icon: Package },
    ],
  },
  {
    section: "Cumplimiento SII",
    items: [
      { href: "/sii", label: "Conexión SII", icon: Shield },
      { href: "/certificacion", label: "Certificación SII", icon: ShieldCheck },
      { href: "/caf", label: "CAF / Folios", icon: Receipt },
      { href: "/documentos-autorizados", label: "Documentos autorizados", icon: BadgeCheck },
      { href: "/contable", label: "Contable", icon: BookOpen, feature: "contable" },
      { href: "/certificado", label: "Certificado", icon: Shield },
    ],
  },
  {
    section: "Integraciones",
    items: [{ href: "/api-keys", label: "Claves API", icon: KeyRound, feature: "api" }],
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
  { tipo: 34, label: "Factura Exenta" },
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
  const [features, setFeatures] = useState<string[]>(["dte"]);
  const [open, setOpen] = useState(false);
  const [menuDte, setMenuDte] = useState(false);
  const [menuUser, setMenuUser] = useState(false);
  const [empresaLogo, setEmpresaLogo] = useState<string | null>(null);
  const [certOk, setCertOk] = useState<boolean | null>(null);
  const [puedeEmitir, setPuedeEmitir] = useState(true);
  const dteRef = useRef<HTMLDivElement>(null);
  const dteBtnRef = useRef<HTMLButtonElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [desktop, setDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Foco al abrir/cerrar el menú móvil; no al montar.
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
    else if (wasOpen.current) menuBtnRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login");
      return;
    }
    if (!a.tenantId && a.is_platform) {
      router.replace("/admin");
      return;
    }
    setAuthState(a);
    setFeatures(a.features || a.tenant?.features || ["dte"]);

    let revoked = false;
    (async () => {
      try {
        const headers = {
          ...(a.token ? { Authorization: `Bearer ${a.token}` } : {}),
          ...(a.tenantId ? { "X-Tenant-Id": String(a.tenantId) } : {}),
        };
        const [logoRes, certRes, featRes, onboardRes] = await Promise.all([
          fetch("/api/v1/empresa/logo", { headers }),
          fetch("/api/v1/certificado/estado", { headers }),
          fetch("/api/v1/features", { headers }),
          fetch("/api/v1/onboarding/estado", { headers }),
        ]);
        if (featRes.ok) {
          const fj = await featRes.json();
          if (!revoked && Array.isArray(fj.data)) setFeatures(fj.data);
        }
        if (logoRes.ok) {
          const blob = await logoRes.blob();
          if (!revoked) {
            const url = URL.createObjectURL(blob);
            setEmpresaLogo((prev) => {
              if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
              return url;
            });
          }
        }
        if (certRes.ok) {
          const body = await certRes.json();
          if (!revoked) setCertOk(Boolean(body?.tiene_certificado && body?.data?.vigente));
        }
        if (onboardRes.ok) {
          const body = await onboardRes.json();
          if (!revoked) setPuedeEmitir(body?.ambiente === "certificacion" || Number(body?.progreso_pct ?? 0) >= 100);
        }
      } catch {
        /* logo/cert/onboarding opcionales */
      }
    })();

    return () => {
      revoked = true;
    };
  }, [router]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (dteRef.current && !dteRef.current.contains(t)) setMenuDte(false);
      if (userRef.current && !userRef.current.contains(t)) setMenuUser(false);
    }
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        setMenuDte(false);
        setMenuUser(false);
        setOpen(false);
        return;
      }

      if (typing) return;
      if (e.key === "n" || e.key === "N") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        setMenuUser(false);
        setMenuDte((v) => {
          const next = !v;
          if (next) queueMicrotask(() => dteBtnRef.current?.focus());
          return next;
        });
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const initials = useMemo(() => {
    const n = auth?.user?.name || "G";
    return n
      .split(" ")
      .slice(0, 1)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }, [auth]);

  const tenantInitial = useMemo(() => {
    const n = auth?.tenant?.razon_social || "G";
    return n.trim().charAt(0).toUpperCase() || "G";
  }, [auth]);

  const ambiente = auth?.tenant?.ambiente === "produccion" ? "palena" : "maullin";

  function logout() {
    clearAuth();
    router.replace("/login");
  }

  if (!auth) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-[var(--ink-muted)]">
        Cargando sesión…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas bg-app-grid text-ink-800">
      <div
        className={cn(
          "fixed inset-0 z-40 bg-fiscal-deep/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{ transitionDuration: "var(--dur-3)", transitionTimingFunction: "var(--ease)" }}
        onClick={() => setOpen(false)}
      />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-fiscal focus:shadow-lift"
      >
        Saltar al contenido
      </a>
      <aside
        inert={!desktop && !open}
        aria-label="Navegación principal"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-white/10 bg-fiscal-deep text-fiscal-on transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ transitionDuration: "var(--dur-3)", transitionTimingFunction: "var(--ease)" }}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            {empresaLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={empresaLogo}
                alt=""
                className="h-9 w-9 rounded-[10px] border border-white/15 bg-white object-contain p-0.5"
              />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-fiscal to-brand-600 text-sm font-bold text-white">
                GDT
              </span>
            )}
            <span className="leading-none">
              <span className="block font-display text-[15px] font-bold tracking-tight text-white">Facturador</span>
              <span className="mt-[3px] block text-[11px] font-medium uppercase tracking-[0.18em] text-fiscal-muted">
                GDT DevSur
              </span>
            </span>
          </Link>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Cerrar menú"
            className="rounded-lg p-2 text-fiscal-muted lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mx-3 mt-1 flex items-center gap-3 rounded-[10px] border border-white/[.06] bg-white/[.03] px-2.5 py-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--pulso-glow)] font-display text-sm font-bold text-fiscal-deep"
          >
            {tenantInitial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-snug text-fiscal-on">
              {auth.tenant?.razon_social || "Sin empresa"}
            </p>
            <p className="text-[11px] text-fiscal-muted">{auth.tenant?.rut_formateado}</p>
          </div>
        </div>

        <nav className="nav-scroll mt-3 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {NAV.map((group) => {
            const items = group.items.filter((item) => !item.feature || features.includes(item.feature));
            if (!items.length) return null;
            return (
            <div key={group.section} className="mb-3">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-fiscal-muted">
                {group.section}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    item.href === "/dte"
                      ? pathname === "/dte" || /^\/dte\/\d+(\/|$)/.test(pathname)
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors duration-200",
                          active
                            ? "bg-white/[.07] font-semibold text-white"
                            : "text-fiscal-on/80 hover:bg-white/[.04] hover:text-white",
                        )}
                      >
                        {active ? (
                          <span
                            aria-hidden
                            className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[var(--pulso)]"
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-[var(--pulso-glow)]" : "text-fiscal-muted group-hover:text-fiscal-on",
                          )}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-[10px] px-2 py-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fiscal-raise text-xs font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">
                {auth.user.name}
                <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-fiscal-muted">
                  {auth.user.role}
                </span>
              </p>
              <p className="truncate text-[11px] text-fiscal-muted">{auth.user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] text-fiscal-muted transition-colors hover:bg-red-500/15 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--canvas-veil)] backdrop-blur-[14px] backdrop-saturate-[1.4]">
          <div className="flex min-h-16 flex-wrap items-center gap-x-2 gap-y-0 px-4 py-2 sm:gap-x-3 md:px-6 lg:px-8">
            <button
              className="order-1 -ml-2 shrink-0 rounded-[10px] p-2.5 text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--ink)] lg:hidden"
              ref={menuBtnRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menú"
              aria-expanded={open}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="order-2 min-w-0 flex-1 py-1">
              <h1 className="truncate font-display text-lg font-semibold leading-tight tracking-[-0.015em] text-fiscal sm:text-xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">{subtitle}</p>
              ) : null}
            </div>

            {actions ? <div className="order-3 flex shrink-0 items-center gap-2">{actions}</div> : null}

            <div className="order-4 shrink-0">
              <span
                title={`Certificación (${ambiente}): los documentos son de prueba y no tienen valor tributario.`}
                className="pill-cert"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                <span className="sm:hidden">Certificación</span>
                <span className="hidden sm:inline">Certificación · {ambiente}</span>
              </span>
            </div>

            <div className="order-5 hidden shrink-0 md:block">
              <Link
                href="/certificado"
                aria-label={
                  certOk == null
                    ? "Certificado digital"
                    : certOk
                      ? "Certificado digital: Vigente"
                      : "Certificado digital: Revisar"
                }
                className="relative grid h-9 w-9 place-items-center rounded-full transition-colors duration-200 hover:bg-[var(--surface-sunken)]"
              >
                <ShieldCheck
                  className={cn("h-[18px] w-[18px]", certOk === false ? "text-[var(--warn)]" : "text-[var(--ok)]")}
                />
              </Link>
            </div>

            <div className="relative order-6 shrink-0" ref={userRef}>
              <button
                type="button"
                aria-expanded={menuUser}
                aria-controls="menu-user"
                aria-label="Menú de la cuenta"
                onClick={() => {
                  setMenuUser((v) => !v);
                  setMenuDte(false);
                }}
                className="flex items-center gap-1 rounded-full py-1 pl-1 pr-1.5 transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--fiscal-soft)] font-display text-xs font-bold text-fiscal">
                  {initials}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-[var(--ink-muted)] transition-transform duration-200",
                    menuUser && "rotate-180",
                  )}
                />
              </button>
              {menuUser ? (
                <div id="menu-user" className="dte-swap absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-lift">
                  <div className="border-b border-[var(--line)] px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-ink-900">{auth.user.name}</p>
                    <p className="truncate text-xs text-[var(--ink-muted)]">{auth.user.email}</p>
                  </div>
                  <Link
                    href="/cuenta"
                    onClick={() => setMenuUser(false)}
                    className="block px-3 py-2.5 text-sm text-slate-700 hover:bg-brand-50"
                  >
                    Mi cuenta
                  </Link>
                  {auth.is_platform ? (
                    <Link
                      href="/admin"
                      className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => setMenuUser(false)}
                    >
                      Panel admin
                    </Link>
                  ) : null}
                  <Link
                    href="/empresa"
                    onClick={() => setMenuUser(false)}
                    className="block px-3 py-2.5 text-sm text-slate-700 hover:bg-brand-50"
                  >
                    Mi empresa
                  </Link>
                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </div>
              ) : null}
            </div>

            <div className="relative order-7 shrink-0" ref={dteRef}>
              <button
                ref={dteBtnRef}
                type="button"
                data-pf-magnet=""
                aria-haspopup="menu"
                aria-expanded={menuDte}
                aria-keyshortcuts="N"
                title="Nuevo DTE (tecla N)"
                onClick={() => {
                  setMenuDte((v) => !v);
                  setMenuUser(false);
                }}
                className="pf-magnet group inline-flex h-[38px] items-center justify-center gap-2 rounded-[10px] bg-[var(--pulso)] py-0 pl-2 pr-2 text-[13.5px] font-semibold text-white shadow-pf-2 transition-[background-color,box-shadow,transform] duration-200 hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 active:scale-[.97] sm:pr-3"
              >
                <span
                  aria-hidden
                  className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[6px] bg-white/[.18] transition-transform duration-300 group-hover:rotate-90"
                  style={{ transitionTimingFunction: "var(--ease-spring)" }}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                </span>
                <span className="sr-only sm:not-sr-only">Nuevo DTE</span>
                <kbd
                  aria-hidden
                  className="ml-0.5 hidden h-5 min-w-[20px] place-items-center rounded-[5px] border border-white/30 bg-white/10 px-1 font-mono text-[11px] font-semibold leading-none lg:inline-grid"
                >
                  N
                </kbd>
              </button>
              {menuDte ? (
                <div
                  role="menu"
                  aria-label="Nuevo documento"
                  className="dte-swap absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-lift"
                >
                  {!puedeEmitir ? (
                    <div className="space-y-2 p-3">
                      <p className="text-sm font-semibold text-ink-900">Cuenta aún no operativa</p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        Completa la habilitación antes de emitir DTE al SII.
                      </p>
                      <Link
                        role="menuitem"
                        href="/dashboard"
                        onClick={() => setMenuDte(false)}
                        className="inline-flex rounded-[10px] bg-[var(--pulso)] px-3 py-2 text-sm font-semibold text-white"
                      >
                        Ir a habilitación
                      </Link>
                      <Link
                        role="menuitem"
                        href="/cotizaciones/nueva"
                        onClick={() => setMenuDte(false)}
                        className="flex items-center gap-2 pt-1 text-sm font-medium text-brand-700"
                      >
                        <FilePlus2 className="h-4 w-4" />
                        Cotización (sin SII)
                      </Link>
                    </div>
                  ) : (
                    <>
                      <p className="border-b border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                        ¿Qué vas a emitir?
                      </p>
                      <Link
                        role="menuitem"
                        href="/cotizaciones/nueva"
                        onClick={() => setMenuDte(false)}
                        className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                      >
                        <FilePlus2 className="h-4 w-4" />
                        Cotización
                      </Link>
                      {DTE_TYPES.map((t) => (
                        <Link
                          role="menuitem"
                          key={t.tipo}
                          href={`/dte/nuevo?tipo=${t.tipo}`}
                          onClick={() => setMenuDte(false)}
                          className="block px-3 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                        >
                          {t.label}
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="outline-none px-4 py-4 pb-24 sm:px-6 lg:px-8 lg:py-5 lg:pb-10">{children}</main>
      </div>

      <a
        href="mailto:nfigueroa@gdtdevsur.cl?subject=Soporte%20Facturador"
        data-pf-magnet=""
        className="pf-magnet fixed bottom-5 right-5 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-fiscal-deep px-4 py-2.5 text-sm font-semibold text-white shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2"
      >
        <Headset className="h-4 w-4" aria-hidden />
        Soporte
      </a>
    </div>
  );
}
