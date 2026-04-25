"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "none";

export function ScrollReveal({
  children,
  delay = 0,
  y = 14,
  direction = "up",
  as = "div",
  className,
  once = true,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  direction?: Direction;
  as?: "div" | "section" | "article" | "header" | "aside" | "footer";
  className?: string;
  once?: boolean;
}) {
  const reduced = useReducedMotion();
  const offset =
    direction === "none" ? 0 : direction === "down" ? -y : y;
  const initial = reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: offset };

  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      initial={initial}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-60px" }}
      transition={{
        duration: reduced ? 0 : 0.6,
        delay: reduced ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(className)}
    >
      {children}
    </MotionTag>
  );
}

export function ScrollStagger({
  children,
  className,
  gap = 0.05,
}: {
  children: React.ReactNode;
  className?: string;
  gap?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reduced ? 0 : gap } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ScrollStaggerItem({
  children,
  className,
  y = 12,
}: {
  children: React.ReactNode;
  className?: string;
  y?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: reduced ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
