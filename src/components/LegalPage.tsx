import Link from "next/link";
import type { ReactNode } from "react";

import { VERSION_LEGAL, VIGENCIA_LEGAL } from "@/lib/legal";

export function LegalPage({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[var(--line)] bg-white p-6 text-[15px] leading-relaxed text-slate-700 sm:p-10 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
        <p className="text-sm">
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            ← Volver
          </Link>
        </p>
        <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">{titulo}</h1>
        <p className="text-sm text-slate-500">
          Versión {VERSION_LEGAL} · vigente desde el {VIGENCIA_LEGAL} · GDT DevSur SpA, RUT 78.533.567-8
        </p>
        {children}
        <h2>Contacto</h2>
        <p>
          Para consultas sobre este documento o para ejercer tus derechos escribe a{" "}
          <a href="mailto:nfigueroa@gdtdevsur.cl" className="font-semibold text-brand-600 hover:underline">
            nfigueroa@gdtdevsur.cl
          </a>
          .
        </p>
      </article>
    </main>
  );
}
