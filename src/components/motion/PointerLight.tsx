"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __pfPointer?: () => void;
  }
}

const SELECTOR = "[data-pf-glow],[data-pf-magnet]";

function resetEl(el: HTMLElement) {
  const style = el.style;
  style.setProperty("--hover", "0");
  style.setProperty("--near", "0");
  if (el.hasAttribute("data-pf-tilt")) {
    style.setProperty("--rx", "0deg");
    style.setProperty("--ry", "0deg");
  }
  if (el.hasAttribute("data-pf-magnet")) {
    style.setProperty("--tx", "0px");
    style.setProperty("--ty", "0px");
  }
}

function startPointerLight() {
  if (window.__pfPointer) return window.__pfPointer;
  if (!window.matchMedia?.("(hover: hover)").matches) return () => {};

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const tracked = new Set<HTMLElement>();
  let pointer: { x: number; y: number } | null = null;
  let raf = 0;

  const io =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const el = entry.target as HTMLElement;
              if (entry.isIntersecting) tracked.add(el);
              else {
                tracked.delete(el);
                resetEl(el);
              }
            }
          },
          { rootMargin: "140px" },
        );

  const observeTree = (root: ParentNode) => {
    const nodes: HTMLElement[] = [];
    if (root instanceof HTMLElement && root.matches(SELECTOR)) nodes.push(root);
    root.querySelectorAll?.(SELECTOR).forEach((el) => nodes.push(el as HTMLElement));
    for (const el of nodes) {
      if (io) io.observe(el);
      else tracked.add(el);
    }
  };

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n instanceof HTMLElement) observeTree(n);
      });
      m.removedNodes.forEach((n) => {
        if (n instanceof HTMLElement) {
          if (n.matches(SELECTOR)) tracked.delete(n);
          n.querySelectorAll?.(SELECTOR).forEach((el) => tracked.delete(el as HTMLElement));
        }
      });
    }
  });

  const tick = () => {
    raf = 0;
    if (!pointer) return;
    const { x, y } = pointer;
    const reduced = reduce.matches;
    const boxes: {
      el: HTMLElement;
      left: number;
      top: number;
      width: number;
      height: number;
    }[] = [];

    tracked.forEach((el) => {
      if (!el.isConnected) {
        tracked.delete(el);
        return;
      }
      const rect = el.getBoundingClientRect();
      const width = el.offsetWidth || rect.width;
      const height = el.offsetHeight || rect.height;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      boxes.push({ el, left: cx - width / 2, top: cy - height / 2, width, height });
    });

    for (const { el, left, top, width, height } of boxes) {
      const right = left + width;
      const bottom = top + height;
      const style = el.style;

      if (el.hasAttribute("data-pf-glow")) {
        const dist = Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom));
        const inside = dist === 0;
        const lx = x - left;
        const ly = y - top;
        style.setProperty("--mx", `${lx.toFixed(1)}px`);
        style.setProperty("--my", `${ly.toFixed(1)}px`);
        style.setProperty("--hover", inside ? "1" : "0");
        style.setProperty("--near", Math.max(0, 1 - dist / 140).toFixed(3));
        if (el.hasAttribute("data-pf-tilt")) {
          const nx = inside && !reduced ? lx / width - 0.5 : 0;
          const ny = inside && !reduced ? ly / height - 0.5 : 0;
          style.setProperty("--rx", `${(-(4 * ny)).toFixed(2)}deg`);
          style.setProperty("--ry", `${(5 * nx).toFixed(2)}deg`);
        }
      }

      if (el.hasAttribute("data-pf-magnet")) {
        const near =
          !reduced && x > left - 48 && x < right + 48 && y > top - 48 && y < bottom + 48;
        const mx = left + width / 2;
        const my = top + height / 2;
        style.setProperty(
          "--tx",
          `${near ? Math.max(-4, Math.min(4, (x - mx) * 0.12)).toFixed(2) : 0}px`,
        );
        style.setProperty(
          "--ty",
          `${near ? Math.max(-3, Math.min(3, (y - my) * 0.18)).toFixed(2) : 0}px`,
        );
      }
    }
  };

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    pointer = { x: e.clientX, y: e.clientY };
    schedule();
  };

  const onLeave = () => {
    pointer = null;
    tracked.forEach(resetEl);
  };

  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("scroll", schedule, { passive: true, capture: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  observeTree(document);
  mo.observe(document.body, { childList: true, subtree: true });

  const stop = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("scroll", schedule, { capture: true } as EventListenerOptions);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    mo.disconnect();
    io?.disconnect();
    if (raf) cancelAnimationFrame(raf);
    tracked.clear();
    delete window.__pfPointer;
  };

  window.__pfPointer = stop;
  return stop;
}

/** Replica el PointerLight de Pulsando: tilt, glow y magnet vía data-pf-*. */
export function PointerLight() {
  useEffect(() => startPointerLight(), []);
  return null;
}
