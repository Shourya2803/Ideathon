"use client";

import { ArrowUpRight } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import ShinyText from "@/components/reactbits/ShinyText";
import { useSceneSection } from "@/components/scene/store";
import { Magnetic } from "./Magnetic";
import { MaskWords } from "./motion";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  useSceneSection(ref, { shape: "sheet", x: 0.5, y: 0.02, s: 1.45, portrait: { x: 0, y: -0.52, s: 0.72 } });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "-25%"]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section id="top" ref={ref} className="relative flex min-h-svh items-start pt-28 sm:items-center sm:pt-20">
      <motion.div style={{ y, opacity: fade }} className="mx-auto w-full max-w-7xl px-5 pb-[46svh] sm:px-8 sm:pb-0">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 1 }}
          className="eyebrow mb-6"
        >
          <ShinyText text="Decoded · the fine print, made plain" speed={3} color="rgba(255,255,255,0.55)" shineColor="#ffffff" />
        </motion.p>

        <h1 className="display max-w-4xl">
          <MaskWords text="Read the fine print" className="block" delay={0.35} />
          <span className="block">
            <MaskWords text="before it" delay={0.6} /> <MaskWords text="costs you." wordClassName="text-blend" delay={0.72} />
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: 1.1, duration: 1 }}
          className="mt-8 max-w-lg text-lg text-white/65 sm:text-xl"
        >
          Bills, lab reports, loan agreements, scheme rules, insurance policies, syllabi. Drop in the PDF and get what
          matters, in plain words.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.9 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <Magnetic>
            <a
              href="#decode"
              className="liquid-glass-strong flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-medium text-white transition-all hover:bg-white/10"
            >
              Decode a document <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
            </a>
          </Magnetic>
          <Magnetic>
            <a
              href="#documents"
              className="flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-black transition-colors hover:bg-white/90"
            >
              See what it reads <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </Magnetic>
        </motion.div>
      </motion.div>

      <div aria-hidden="true" className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 sm:flex">
        <span className="eyebrow">Scroll</span>
        <span className="relative h-12 w-px overflow-hidden bg-white/10">
          <span className="absolute inset-0 bg-white/70" style={{ animation: "drip 2.2s cubic-bezier(.7,0,.3,1) infinite" }} />
        </span>
      </div>
    </section>
  );
}
