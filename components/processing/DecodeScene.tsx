"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DocumentVortex } from "@/components/DocumentVortex";

/** One glowing ring per processing stage. */
const N = 5;
const SPACING = 4.5;
const CAM_DIST = 8;
const RING_R = 2.1;

const C = {
  done: new THREE.Color("#7ea3ff"),
  dim: new THREE.Color("#2b3a66"),
  violet: new THREE.Color("#9b6bff"),
  red: new THREE.Color("#ff304f"),
  blue: new THREE.Color("#2563eb"),
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

function paperTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 180;
  const g = c.getContext("2d")!;
  g.fillStyle = "#eef2ff";
  g.fillRect(0, 0, 128, 180);
  g.fillStyle = "#475569";
  g.fillRect(12, 14, 56, 7);
  const rows = [100, 84, 96, 70, 90, 60, 94, 78];
  rows.forEach((w, i) => {
    g.fillStyle = i === 3 ? "#2563eb" : i === 6 ? "#ff304f" : "#94a3b8";
    g.fillRect(12, 34 + i * 15, w, i === 3 || i === 6 ? 6 : 4);
  });
  g.fillStyle = "#cbd5e1";
  g.fillRect(12, 160, 40, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.25)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

interface Ring {
  group: THREE.Group;
  mats: THREE.MeshBasicMaterial[];
  disc: THREE.MeshBasicMaterial;
  orbiter: THREE.Mesh;
  o: number;
}

/**
 * A tunnel of rings (one per stage) that the camera flies through as the server reports progress,
 * with document pages spiralling down the tunnel. Decorative only; the stage list carries the meaning.
 * Falls back to the CSS vortex without WebGL, and to a still frame with reduced motion.
 */
export default function DecodeScene({ stageIndex, className }: { stageIndex: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef(stageIndex);
  const onStage = useRef<() => void>(() => undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    stageRef.current = stageIndex;
    onStage.current();
  }, [stageIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off capability fallback
      setFailed(true);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
    const disposables: Array<{ dispose(): void }> = [];
    const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
    const add = THREE.AdditiveBlending;

    // ---- rings
    const ringGeo = keep(new THREE.TorusGeometry(RING_R, 0.032, 12, 140));
    const outerGeo = keep(new THREE.TorusGeometry(RING_R + 0.42, 0.011, 8, 140));
    const discGeo = keep(new THREE.CircleGeometry(RING_R, 48));
    const dotGeo = keep(new THREE.SphereGeometry(0.075, 12, 12));
    const glow = keep(glowTexture());
    const rings: Ring[] = Array.from({ length: N }, (_, i) => {
      const group = new THREE.Group();
      group.position.z = -i * SPACING;
      const mk = (opacity: number) => keep(new THREE.MeshBasicMaterial({ color: C.dim, transparent: true, opacity, blending: add, depthWrite: false }));
      const main = mk(0.4);
      const outer = mk(0.2);
      const disc = keep(new THREE.MeshBasicMaterial({ map: glow, color: C.violet, transparent: true, opacity: 0, blending: add, depthWrite: false, side: THREE.DoubleSide }));
      const orbMat = mk(1);
      group.add(new THREE.Mesh(ringGeo, main), new THREE.Mesh(outerGeo, outer), new THREE.Mesh(discGeo, disc));
      const orbiter = new THREE.Mesh(dotGeo, orbMat);
      group.add(orbiter);
      scene.add(group);
      return { group, mats: [main, outer, orbMat], disc, orbiter, o: 0.3 };
    });

    // ---- core at the end of the tunnel
    const coreGeo = keep(new THREE.IcosahedronGeometry(0.85, 1));
    const coreMat = keep(new THREE.MeshBasicMaterial({ color: C.violet, wireframe: true, transparent: true, opacity: 0, blending: add, depthWrite: false }));
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.z = -N * SPACING;
    scene.add(core);

    // ---- pages spiralling down the tunnel
    const paper = keep(paperTexture());
    const pageGeo = keep(new THREE.PlaneGeometry(0.9, 1.27));
    const PAGES = 8;
    const pages = Array.from({ length: PAGES }, (_, i) => {
      const mat = keep(new THREE.MeshBasicMaterial({ map: paper, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      const mesh = new THREE.Mesh(pageGeo, mat);
      scene.add(mesh);
      return { mesh, mat, phase: i / PAGES, spin: i % 2 ? 1 : -1 };
    });

    // ---- dust
    const COUNT = 520;
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 3.4;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r * 0.75;
      pos[i * 3 + 2] = 6 - Math.random() * (N * SPACING + 14);
      const pick = Math.random();
      const c = pick < 0.6 ? C.blue : pick < 0.9 ? C.violet : C.red;
      col.set([c.r, c.g, c.b], i * 3);
    }
    const dustGeo = keep(new THREE.BufferGeometry());
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const dustMat = keep(new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.85, blending: add, depthWrite: false }));
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // ---- animation state
    const st = { camZ: -0 * SPACING + CAM_DIST, nx: 0, ny: 0, sx: 0, sy: 0, time: 0 };
    const tmpColor = new THREE.Color();
    const target = new THREE.Color();

    const resize = () => {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const step = (dt: number) => {
      st.time += dt;
      const t = st.time;
      const active = Math.max(0, stageRef.current);
      st.camZ = damp(st.camZ, -active * SPACING + CAM_DIST, still ? 80 : 2.1, dt);
      st.sx = damp(st.sx, st.nx, 3, dt);
      st.sy = damp(st.sy, st.ny, 3, dt);
      camera.position.set(st.sx * 0.55 + Math.sin(t * 0.4) * 0.14, -st.sy * 0.35 + Math.cos(t * 0.33) * 0.1, st.camZ);
      camera.lookAt(st.sx * 0.25, -st.sy * 0.15, st.camZ - 10);

      rings.forEach((r, i) => {
        const done = i < active;
        const on = i === active;
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        const targetO = done ? 0.9 : on ? 1 : 0.34;
        r.o = damp(r.o, targetO, 5, dt);
        target.copy(done ? C.done : on ? tmpColor.copy(C.violet).lerp(C.red, pulse) : C.dim);
        const dist = st.camZ - r.group.position.z;
        const fade = smooth(1.6, 4.6, dist) * (1 - smooth(34, 44, dist));
        r.mats.forEach((m, k) => {
          m.color.lerp(target, 1 - Math.exp(-6 * dt));
          m.opacity = r.o * fade * (k === 1 ? 0.55 : 1);
        });
        const s = on ? 1 + 0.035 * Math.sin(t * 3) : 1;
        r.group.scale.setScalar(damp(r.group.scale.x, s, 8, dt));
        r.group.rotation.z += dt * (on ? 0.7 : 0.14) * (i % 2 ? 1 : -1);
        r.disc.color.lerp(target, 1 - Math.exp(-5 * dt));
        r.disc.opacity = damp(r.disc.opacity, (on ? 0.2 + 0.07 * pulse : done ? 0.07 : 0.025) * fade, 5, dt);
        const a = t * (on ? 2.6 : 0.9) + i * 1.7;
        r.orbiter.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0);
        r.orbiter.scale.setScalar(on ? 1.5 + 0.4 * pulse : 0.9);
      });

      // core fades in as the last stages run
      core.rotation.x += dt * 0.5;
      core.rotation.y += dt * 0.7;
      const prog = smooth(1.5, N - 1, active);
      coreMat.opacity = damp(coreMat.opacity, 0.1 + 0.7 * prog, 3, dt);
      core.scale.setScalar(1 + 0.08 * Math.sin(t * 2.4) + 0.25 * prog);

      pages.forEach((pg) => {
        const p = (t * 0.1 + pg.phase) % 1;
        const d = 3.2 + p * 24;
        const ang = pg.phase * 6.283 + p * 7 * pg.spin;
        const rad = 2.05 * Math.pow(1 - p, 1.25) + 0.12;
        pg.mesh.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.72, st.camZ - d);
        // tilt gently (never edge-on, which would make the page vanish into a line) while spinning about the axis
        pg.mesh.rotation.set(0.55 * Math.sin(p * 6 + pg.phase * 6) * pg.spin, 0.65 * Math.sin(p * 4 + pg.phase * 3), ang * 0.6 + p * 4);
        pg.mesh.scale.setScalar(1.15 - p * 0.95);
        pg.mat.opacity = smooth(0.02, 0.14, p) * (1 - smooth(0.72, 0.98, p));
      });

      dust.rotation.z += dt * 0.025;
    };

    const draw = () => renderer.render(scene, camera);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      st.nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      st.ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw();
    });
    ro.observe(canvas);

    let raf = 0;
    let visible = true;
    let io: IntersectionObserver | undefined;

    if (still) {
      // Reduced motion: no loop. Settle on the current stage and draw one calm frame whenever it changes.
      onStage.current = () => {
        for (let i = 0; i < 8; i++) step(1 / 30);
        draw();
      };
      onStage.current();
    } else {
      window.addEventListener("pointermove", onMove, { passive: true });
      io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
      io.observe(canvas);
      let last = performance.now();
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        if (!visible || document.hidden) return;
        step(dt);
        draw();
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      window.removeEventListener("pointermove", onMove);
      onStage.current = () => undefined;
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, []);

  if (failed) return <DocumentVortex />;
  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
