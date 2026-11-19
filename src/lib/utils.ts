import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCLP(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function monthRange(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return {
    desde: `${y}-${m}-01`,
    hasta: `${y}-${m}-${String(last).padStart(2, "0")}`,
  };
}

/** Unidades de medida ofrecidas en catálogo y emisión (texto libre en el XML, máx. 4 caracteres). */
export const UNIDADES = ["UN", "HR", "DIA", "MES", "KG", "LT", "M", "M2", "M3", "CF"] as const;

/** "2026-11" → "Noviembre 2026" */
export function periodoLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const mes = new Date(y, (m || 1) - 1, 1).toLocaleDateString("es-CL", { month: "long" });
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${y}`;
}

export function buildPeriodos(count = 18) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}
