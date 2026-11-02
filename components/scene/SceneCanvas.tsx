"use client";

import { useEffect, useRef, useState } from "react";
import { createScene } from "./engine";

/**
 * Fixed, full-viewport particle world shared by every section. Purely decorative (aria-hidden);
 * if WebGL2 isn't available a soft static gradient is shown and the site works the same.
 */
export default function SceneCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const w = window.innerWidth;
    const side = w < 640 ? 128 : w < 1024 ? 192 : 256; // 16k / 37k / 65k particles
    try {
      const engine = createScene(canvas, { side, still });
      return () => engine.dispose();
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off capability fallback
      setFailed(true);
    }
  }, []);

  if (failed) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_50%_at_70%_40%,rgb(37_99_235/0.18),transparent),radial-gradient(40%_40%_at_80%_70%,rgb(255_48_79/0.12),transparent)]"
      />
    );
  }
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
