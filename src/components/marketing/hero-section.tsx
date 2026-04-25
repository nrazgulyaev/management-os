"use client";

import * as React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  kind = "home",
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  kind?: "home" | "pillar";
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line-soft">
      <div
        className={cn(
          "absolute inset-0 -z-10 opacity-[0.55]",
          "bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--accent-weak),transparent_70%)]"
        )}
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 pt-16 md:pt-24 pb-20 md:pb-28">
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-label"
        >
          {eyebrow}
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "text-display text-ink font-medium mt-5 leading-[0.98] tracking-tight max-w-[900px]",
            kind === "home"
              ? "text-[44px] md:text-[76px]"
              : "text-[40px] md:text-[60px]"
          )}
        >
          {title}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-ink-secondary text-base md:text-lg leading-relaxed max-w-2xl"
        >
          {description}
        </motion.p>
        {(primaryCta || secondaryCta) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-10 flex flex-wrap gap-3"
          >
            {primaryCta && (
              <Button asChild size="lg">
                <Link href={primaryCta.href}>
                  {primaryCta.label}
                  <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                </Link>
              </Button>
            )}
            {secondaryCta && (
              <Button asChild variant="secondary" size="lg">
                <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
              </Button>
            )}
          </motion.div>
        )}
        {children && <div className="mt-16 md:mt-20">{children}</div>}
      </div>
    </section>
  );
}
