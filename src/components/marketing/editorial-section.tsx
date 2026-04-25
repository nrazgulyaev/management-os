"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function EditorialSection({
  eyebrow,
  title,
  description,
  columns,
  children,
  invert = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  columns?: { title: string; body: string; meta?: string }[];
  children?: React.ReactNode;
  invert?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative border-b border-line-soft",
        invert && "bg-muted/50",
        className
      )}
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-28">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-5 md:sticky md:top-24 self-start"
          >
            {eyebrow && <span className="text-label">{eyebrow}</span>}
            <h2 className="text-display text-[30px] md:text-[44px] leading-[1.05] mt-4 font-medium text-ink">
              {title}
            </h2>
            {description && (
              <p className="mt-5 text-ink-secondary text-base md:text-lg leading-relaxed max-w-lg">
                {description}
              </p>
            )}
          </motion.div>
          <div className="md:col-span-7">
            {columns && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line-soft rounded-md overflow-hidden border border-line-soft">
                {columns.map((c, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    className="bg-surface p-6 md:p-7"
                  >
                    {c.meta && <span className="text-label">{c.meta}</span>}
                    <h3 className="text-base font-medium mt-1 mb-2 text-ink">
                      {c.title}
                    </h3>
                    <p className="text-sm text-ink-secondary leading-relaxed">
                      {c.body}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
