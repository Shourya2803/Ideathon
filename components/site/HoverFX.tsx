"use client";

import { useEffect, useRef } from "react";

/**
 * Site-wide pointer effects, driven by ONE delegated listener (no per-element handlers):
 *  - a cursor halo that follows the mouse and swells into a lens over anything clickable
 *  - writes --mx/--my on the glass panel under the pointer so its CSS spotlight can follow
 * Mouse only: skipped entirely on touch devices. The native cursor is never hidden.
 */
export function HoverFX() {
  const halo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const el = halo.current;
    if (!fine || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let x = -100;
    let y = -100;
    let tx = -100;
    let ty = -100;
    let raf = 0;
    let shown = false;

    const draw = () => {
      x += (tx - x) * (reduce ? 1 : 0.2);
      y += (ty - y) * (reduce ? 1 : 0.2);
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(draw) : 0;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!shown) {
        shown = true;
        x = tx;
        y = ty;
        el.style.opacity = "1";
      }
      if (!raf) raf = requestAnimationFrame(draw);

      const target = e.target as Element | null;
      const glass = target?.closest?.<HTMLElement>(".liquid-glass, .liquid-glass-strong");
      if (glass) {
        const r = glass.getBoundingClientRect();
        glass.style.setProperty("--mx", `${e.clientX - r.left}px`);
        glass.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      const interactive = !!target?.closest?.("a, button, input, label, summary, [role='button']");
      const state = interactive ? "link" : "idle";
      if (el.dataset.state !== state) el.dataset.state = state;
    };
    const onLeave = () => {
      shown = false;
      el.style.opacity = "0";
    };
    const onDown = () => (el.dataset.press = "1");
    const onUp = () => delete el.dataset.press;

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <div ref={halo} className="cursor-halo" aria-hidden="true" />;
}
