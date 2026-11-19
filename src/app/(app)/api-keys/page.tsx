"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, getAuth } from "@/lib/api";
import type { ApiKey } from "@/lib/types";
import { btnDanger, btnPrimary, btnSecondary, card, dialogCls, input } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Clave = Omit<ApiKey, "key" | "key_hash">;

const ERR = "rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]";
const OK = "rounded-[var(--radius-md)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]";
const PERMISOS = [
  { value: "dte:create", label: "Emitir DTE", hint: "POST /dte" },
  { value: "dte:read", label: "Consultar DTE", hint: "GET /dte y /dte/{id}" },
];
const AMB_TXT: Record<string, string> = { certificacion: "Certificación", produccion: "Producción" };
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : null;

function CopiarBtn({ texto, label }: { texto: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={btnSecondary}
      onClick={() => {
        void navigator.clipboard.writeText(texto).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        });
      }}
    >
      {ok ? <Check aria-hidden className="h-4 w-4 text-[var(--ok)]" /> : <Copy aria-hidden className="h-4 w-4 text-[var(--ink-muted)]" />}
      <span aria-live="polite">{ok ? "Copiada" : label}</span>
    </button>
  );
}

export default function ApiKeysPage() {
  const [rows, setRows] = useState<Clave[]>([]);
  const [cargando, setCargando] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ambiente, setAmbiente] = useState("certificacion");
  const [permisos, setPermisos] = useState<string[]>(["dte:create", "dte:read"]);
  const [vence, setVence] = useState("");
  const [nueva, setNueva] = useState<string | null>(null);
  const [revocar, setRevocar] = useState<Clave | null>(null);
  const crearRef = useRef<HTMLDialogElement>(null);
  const nuevaRef = useRef<HTMLDialogElement>(null);
  const revocarRef = useRef<HTMLDialogElement>(null);
  const [base, setBase] = useState("https://<tu-dominio>/api/v1");
  // El servidor igual lo exige; aquí solo evita mostrar botones que darían 403.
  const [gestiona, setGestiona] = useState(false);

  async function load() {
    setCargando(true);
    setLoadError("");
    try {
      setRows((await api<{ data: Clave[] }>("/api-keys")).data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No pudimos cargar las claves.");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    setBase(`${window.location.origin}/api/v1`);
    const a = getAuth();
    setGestiona(Boolean(a?.is_platform) || ["owner", "admin", "platform"].includes(a?.user?.role ?? ""));
    void load();
  }, []);

  function abrirCrear() {
    setError("");
    setOk("");
    setNombre("");
    setVence("");
    crearRef.current?.showModal();
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      const r = await api<{ data: Clave; clave: string }>("/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: nombre, ambiente, permissions: permisos, expires_at: vence ? `${vence}T23:59:59` : null }),
      });
      crearRef.current?.close();
      setNueva(r.clave);
      nuevaRef.current?.showModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la clave.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarRevocar() {
    if (!revocar) return;
    setGuardando(true);
    setError("");
    try {
      await api(`/api-keys/${revocar.id}`, { method: "PATCH", body: JSON.stringify({ activo: false }) });
      setOk(`Clave "${revocar.name}" revocada. Las integraciones que la usaban ya no pueden emitir.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar la clave.");
    } finally {
      setGuardando(false);
      revocarRef.current?.close();
    }
  }

  const curl = `curl -X POST ${base}/dte \\
  -H "Authorization: Bearer sk_test_…" \\
  -H "Content-Type: application/json" \\
  -d '{"tipo_dte":33,"receptor":{"rut":"76123456","dv":"7","razon_social":"Cliente SpA"},"items":[{"nombre":"Servicio","cantidad":1,"precio":10000}]}'`;

  return (
    <AppShell
      title="Claves API"
      subtitle="Para que tu ERP o sistema emita y consulte DTE automáticamente"
      actions={
        gestiona ? (
          <button type="button" className={btnPrimary} onClick={abrirCrear}>
            <Plus aria-hidden className="h-4 w-4" /> Nueva clave
          </button>
        ) : undefined
      }
    >
      {loadError && (
        <p role="alert" className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", ERR)}>
          {loadError}
          <button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-2">Reintentar</button>
        </p>
      )}
      {error && !crearRef.current?.open && <p role="alert" className={cn("mb-3", ERR)}>{error}</p>}
      <div role="status" aria-live="polite">{ok && <p className={cn("mb-3", OK)}>{ok}</p>}</div>

      <section className={card} aria-labelledby="claves">
        <h2 id="claves" className="px-4 pt-4 font-display text-base font-semibold">Tus claves</h2>
        {cargando && !rows.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-[var(--ink-muted)]" role="status">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Cargando claves…
          </p>
        ) : !rows.length && !loadError ? (
          <div className="p-4 text-sm text-[var(--ink-muted)]">
            <p className="max-w-prose">
              Aún no tienes claves.{" "}
              {gestiona
                ? "Crea una por cada sistema que se conecte (ERP, tienda online, etc.) para poder revocarlas por separado."
                : "Pide al dueño o a un administrador de la empresa que cree una."}
            </p>
          </div>
        ) : (
          <ul className={cn("mt-2 divide-y divide-[var(--line)] transition-opacity", cargando && "opacity-60")} aria-busy={cargando}>
            {rows.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {k.name}
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", k.activo ? "bg-[var(--ok-soft)] text-[var(--ok)]" : "bg-[var(--surface-sunken)] text-[var(--ink)]")}>
                      {k.activo ? "Activa" : "Revocada"}
                    </span>
                    <span className="text-xs font-normal text-[var(--ink-muted)]">{AMB_TXT[k.ambiente] ?? k.ambiente}</span>
                  </p>
                  <p className="font-mono text-xs text-[var(--ink-muted)]">{k.key_hint}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {PERMISOS.filter((p) => k.permissions.includes(p.value)).map((p) => p.label).join(" · ")}
                    {" · "}Creada {fecha(k.created_at)}
                    {" · "}{k.last_used_at ? `Último uso ${fecha(k.last_used_at)}` : "Nunca usada"}
                    {k.expires_at ? ` · Vence ${fecha(k.expires_at)}` : ""}
                  </p>
                </div>
                {k.activo && gestiona && (
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={guardando}
                    onClick={() => {
                      setRevocar(k);
                      revocarRef.current?.showModal();
                    }}
                  >
                    Revocar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(card, "mt-4 p-5")} aria-labelledby="uso">
        <h2 id="uso" className="font-display text-base font-semibold">Cómo usarla</h2>
        <ul className="mt-2 max-w-prose list-disc space-y-1 pl-5 text-sm text-[var(--ink-muted)]">
          <li>Envía la clave en el header <code className="font-mono text-[var(--ink)]">Authorization: Bearer sk_…</code>. No hace falta iniciar sesión.</li>
          <li>Solo sirve para <strong className="text-[var(--ink)]">emitir</strong> (<code className="font-mono">POST /dte</code>) y <strong className="text-[var(--ink)]">consultar</strong> (<code className="font-mono">GET /dte</code>, <code className="font-mono">GET /dte/{"{id}"}</code>) DTE de esta empresa.</li>
          <li>Una clave de certificación no puede emitir mientras la empresa esté en producción, y al revés.</li>
        </ul>
        <pre className="mt-3 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 font-mono text-xs leading-relaxed text-[var(--ink)]">{curl}</pre>
        <div className="mt-2"><CopiarBtn texto={curl} label="Copiar ejemplo" /></div>
      </section>

      <dialog ref={crearRef} aria-labelledby="dlg-crear" className={dialogCls}>
        <form onSubmit={crear} className="space-y-4 p-6">
          <h2 id="dlg-crear" className="font-display text-lg font-semibold">Nueva clave API</h2>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Nombre</span>
            <input className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={60} placeholder="Ej: ERP Defontana" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Ambiente</span>
            <select className={input} value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
              <option value="certificacion">Certificación (pruebas, sin valor tributario)</option>
              <option value="produccion">Producción (documentos reales)</option>
            </select>
          </label>
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Permisos</legend>
            {PERMISOS.map((p) => (
              <label key={p.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permisos.includes(p.value)}
                  onChange={(e) => setPermisos((xs) => (e.target.checked ? [...xs, p.value] : xs.filter((x) => x !== p.value)))}
                />
                {p.label} <span className="font-mono text-xs text-[var(--ink-muted)]">{p.hint}</span>
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Vence el (opcional)</span>
            <input type="date" className={input} value={vence} onChange={(e) => setVence(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
          </label>
          {error && <p role="alert" className={ERR}>{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btnSecondary} onClick={() => crearRef.current?.close()}>Cancelar</button>
            <button type="submit" className={btnPrimary} disabled={guardando || !nombre.trim() || !permisos.length}>
              {guardando ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <KeyRound aria-hidden className="h-4 w-4" />}
              Crear clave
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={nuevaRef} aria-labelledby="dlg-nueva" className={dialogCls} onClose={() => setNueva(null)}>
        {nueva && (
          <div className="space-y-4 p-6">
            <h2 id="dlg-nueva" className="font-display text-lg font-semibold">Copia tu clave ahora</h2>
            <p className="text-sm">No volverás a verla: solo guardamos una huella para reconocerla. Si la pierdes, revócala y crea otra.</p>
            <p className="break-all rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 font-mono text-sm">{nueva}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={btnSecondary} onClick={() => nuevaRef.current?.close()}>Ya la guardé</button>
              <CopiarBtn texto={nueva} label="Copiar clave" />
            </div>
          </div>
        )}
      </dialog>

      <dialog ref={revocarRef} aria-labelledby="dlg-revocar" className={dialogCls} onClose={() => setRevocar(null)}>
        {revocar && (
          <div className="space-y-4 p-6">
            <h2 id="dlg-revocar" className="font-display text-lg font-semibold">¿Revocar &quot;{revocar.name}&quot;?</h2>
            <p className="text-sm">Las integraciones que usen esta clave dejarán de emitir y consultar de inmediato. No se puede reactivar.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={btnSecondary} onClick={() => revocarRef.current?.close()}>Cancelar</button>
              <button type="button" className={btnDanger} disabled={guardando} onClick={() => void confirmarRevocar()}>
                {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                Sí, revocar
              </button>
            </div>
          </div>
        )}
      </dialog>
    </AppShell>
  );
}
