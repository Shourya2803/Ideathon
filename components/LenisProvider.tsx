"use client";

import Lenis from "lenis";
import { useEffect } from "react";

let lenis: Lenis | null = null;

/** Scroll that cooperates with Lenis (a native scrollTo would be overridden mid-glide). */
export function scrollToY(y: number, smooth = true) {
  if (lenis) {
    lenis.resize(); // the page may have just grown (e.g. results mounted); refresh the scroll limit first
    lenis.scrollTo(y, { immediate: !smooth, duration: 1.4 });
  }
  else window.scrollTo({ top: y, behavior: smooth ? "smooth" : "auto" });
}

export function scrollToElement(el: HTMLElement, smooth = true) {
  scrollToY(el.getBoundingClientRect().top + window.scrollY, smooth);
}

/**
 * Smooth scrolling is an enhancement only: skipped for reduced-motion users and
 * coarse-pointer (touch) devices, which keep native scrolling.
 */
export function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || touch) return;
    lenis = new Lenis({ autoRaf: true, anchors: true, lerp: 0.12 });
    return () => {
      lenis?.destroy();
      lenis = null;
    };
  }, []);

  return <>{children}</>;
}
