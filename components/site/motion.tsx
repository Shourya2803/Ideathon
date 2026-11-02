"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Words rise out of a mask, one after another. Text stays real text for screen readers. */
export function MaskWords({
  text,
  className = "",
  wordClassName = "",
  delay = 0,
  stagger = 0.06,
  onView = false,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  onView?: boolean;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  const trigger = onView ? { whileInView: "show", viewport: { once: true, margin: "-10% 0px" } } : { animate: "show" };
  return (
    <motion.span className={className} initial={reduce ? false : "hide"} {...trigger}>
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <motion.span
            className={`inline-block ${wordClassName}`}
            variants={{ hide: { y: "110%", rotate: 4 }, show: { y: "0%", rotate: 0 } }}
            transition={{ duration: 0.9, ease: EASE, delay: delay + i * stagger }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** Fade + lift + un-blur when scrolled into view. */
export function Reveal({ children, delay = 0, className, ...rest }: { children: ReactNode; delay?: number } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export { EASE };
