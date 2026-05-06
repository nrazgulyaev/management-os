"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

export function DevelopmentHero({
  className,
}: {
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-b border-line-soft -mt-12 pt-16 md:pt-24 pb-20 md:pb-28 px-6 md:px-8",
        className
      )}
    >
      <div
        className="absolute inset-0 -z-10 opacity-[0.6] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--accent-weak),transparent_70%)]"
        aria-hidden
      />
      <div className="absolute inset-x-0 bottom-0 h-px bg-line-soft" aria-hidden />

      <div className="max-w-[1400px] mx-auto">
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="text-label inline-flex items-center gap-2"
        >
          <Sparkles className="w-3 h-3 text-gold" strokeWidth={2} />
          Arconique Development OS
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05, ease }}
          className="text-display text-ink font-medium mt-5 leading-[0.98] tracking-tight max-w-[920px] text-[44px] md:text-[68px]"
        >
          The operating system for{" "}
          <em className="not-italic text-accent italic">full-cycle</em>{" "}
          real estate development.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease }}
          className="mt-6 text-ink-secondary text-base md:text-lg leading-relaxed max-w-2xl"
        >
          We develop, sell, hand over, manage, and report ROI — on one
          AI-powered platform built specifically for premium villa portfolios in
          Bali. Every plot, drawing, payment, and snag tied to a single
          investor-grade project record.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease }}
          className="mt-9 flex items-center gap-3 flex-wrap"
        >
          <Button asChild size="lg" variant="primary">
            <Link href="/development-os">
              Open command center
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/contact">Request access</Link>
          </Button>
          <span className="text-xs text-ink-tertiary inline-flex items-center gap-1.5 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            3 active projects · 29 units in flight
          </span>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.32, ease }}
          className="text-display italic text-ink-secondary mt-12 text-base md:text-lg max-w-xl"
        >
          We develop → sell → hand over → manage → report ROI.
        </motion.p>
      </div>
    </section>
  );
}
