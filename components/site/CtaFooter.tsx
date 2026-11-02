"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSceneSection } from "@/components/scene/store";
import { MaskWords } from "./motion";

const SRC = "https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8";

/** Cinematic closing CTA over an HLS video, with the footer bar. The stream loads only when near view. */
export function CtaFooter() {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useSceneSection(ref, { shape: "sheet", chaos: 1, glow: 0.25, x: 0, y: 0, s: 1.6 });

  useEffect(() => {
    const video = videoRef.current;
    const section = ref.current;
    if (!video || !section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let destroy: (() => void) | undefined;
    let started = false;
    const io = new IntersectionObserver(
      async ([e]) => {
        if (!e.isIntersecting || started) return;
        started = true;
        io.disconnect();
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = SRC;
          return;
        }
        const { default: Hls } = await import("hls.js");
        if (!Hls.isSupported()) return;
        const hls = new Hls();
        hls.loadSource(SRC);
        hls.attachMedia(video);
        destroy = () => hls.destroy();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(section);
    return () => {
      io.disconnect();
      destroy?.();
    };
  }, []);

  return (
    <section ref={ref} className="relative overflow-hidden bg-black px-6 pt-40 text-center md:px-16 lg:px-24">
      <video ref={videoRef} autoPlay loop muted playsInline aria-hidden="true" className="absolute inset-0 z-0 h-full w-full object-cover opacity-80" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 top-0 z-[1]"
        style={{ height: "240px", background: "linear-gradient(to bottom, #050505, transparent)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1]"
        style={{ height: "240px", background: "linear-gradient(to top, #050505, transparent)" }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] mix-blend-color" style={{ background: "var(--blend)", opacity: 0.25 }} />

      <div className="relative z-10">
        <h2 className="mx-auto mb-5 max-w-3xl font-heading text-5xl italic leading-[0.85] tracking-tight text-white md:text-6xl lg:text-7xl">
          <MaskWords text="Read it before" onView /> <MaskWords text="you sign it." wordClassName="text-blend" delay={0.2} onView />
        </h2>
        <p className="mx-auto mb-9 max-w-xl text-sm font-light text-white/60 md:text-base">
          Upload a PDF and get the important parts in plain language. Personal details removed before AI analysis. No account,
          nothing stored.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <a
            href="#decode"
            className="liquid-glass-strong flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/10"
          >
            Decode a document <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
          </a>
          <a href="#documents" className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-white/90">
            What it reads <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <footer className="mt-40 flex flex-col items-center justify-between gap-4 border-t border-white/10 py-8 md:flex-row">
          <p className="text-xs font-light text-white/40">&copy; 2026 Decoded. Informational summaries, not legal, financial or medical advice.</p>
          <div className="flex items-center gap-6">
            {[
              ["Privacy", "#privacy"],
              ["How it works", "#how"],
              ["Back to top", "#top"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="text-xs font-light text-white/40 transition-colors hover:text-white/70">
                {label}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </section>
  );
}
