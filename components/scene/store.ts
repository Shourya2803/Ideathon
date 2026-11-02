"use client";

import { useEffect, type RefObject } from "react";

/** Shapes the particle world can form. Indices must match the GLSL `shapeSDF` switch. */
export const SHAPES = {
  sheet: 0,
  bolt: 1, // electricity bills
  flask: 2, // lab reports
  coins: 3, // loan agreements
  pillars: 4, // government schemes
  shield: 5, // insurance policies
  book: 6, // exam syllabi
  lock: 7, // privacy
} as const;
export type ShapeName = keyof typeof SHAPES;

interface Placement {
  /** Centre, as a fraction of the half-width / half-height of the view (-1..1). */
  x: number;
  y: number;
  /** Size relative to the view's half-height. */
  s: number;
  /** Optional brightness override for this placement. */
  glow?: number;
}

export interface SceneTarget extends Placement {
  shape: ShapeName;
  /** 0 = formed shape, 1 = shapeless cloud of "complexity". */
  chaos: number;
  /** 0 = idle scan line, 1 = fast scanning while a document is processed. */
  scan: number;
  /** Overall brightness, 0..1. */
  glow: number;
  /** Placement override for portrait screens. */
  portrait?: Placement;
}

const DEFAULT: SceneTarget = { shape: "sheet", x: 0.5, y: 0, s: 1.5, chaos: 0, scan: 0, glow: 1, portrait: { x: 0, y: -0.5, s: 0.8 } };

/** Mutable on purpose: the render loop reads it every frame without React re-renders. */
export const scene: { target: SceneTarget; version: number } = { target: { ...DEFAULT }, version: 0 };

let lastKey = "";
export function setScene(next: Partial<SceneTarget>) {
  const key = JSON.stringify(next);
  if (key === lastKey) return;
  lastKey = key;
  scene.target = { ...DEFAULT, ...next };
  scene.version++;
}

/** Set the scene while this element crosses the middle of the viewport. */
export function useSceneSection(ref: RefObject<Element | null>, target: Partial<SceneTarget>, enabled = true) {
  const key = JSON.stringify(target);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setScene(JSON.parse(key));
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, key, enabled]);
}
