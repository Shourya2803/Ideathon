"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "#problem", label: "Why" },
  { href: "#documents", label: "Documents" },
  { href: "#how", label: "How it works" },
  { href: "#privacy", label: "Privacy" },
];

export function Navigation() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <motion.nav
        aria-label="Main"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        className="liquid-glass flex h-14 w-full max-w-3xl items-center justify-between rounded-full pl-5 pr-2"
      >
        <a href="#top" className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--blend)" }} />
          <span className="font-heading text-2xl italic leading-none">Decoded</span>
        </a>

        <ul className="hidden items-center gap-7 text-sm text-white/65 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors hover:text-white">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="#decode"
          className="hidden items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 md:flex"
        >
          Decode a document <ArrowUpRight size={15} aria-hidden="true" />
        </a>

        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 -z-10 flex flex-col justify-center bg-obsidian/90 px-8 backdrop-blur-xl md:hidden"
          >
            <ul className="space-y-2">
              {[...LINKS, { href: "#decode", label: "Decode a document" }].map((l, i) => (
                <motion.li
                  key={l.href}
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.05 * i, ease: [0.22, 1, 0.36, 1], duration: 0.6 }}
                >
                  <a href={l.href} onClick={() => setOpen(false)} className="font-heading text-5xl italic">
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
