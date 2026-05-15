/**
 * Sprint LD-2 — FeatureDeepDive primitive.
 *
 * Anchored two-column feature section used on /features/management-os
 * and /features/development-os. Text + bullets on one side, a
 * mockup image on the other. The `reverse` prop flips the layout so
 * consecutive sections alternate left/right for visual rhythm.
 *
 * Server component. Mockup image rendered via next/image with the
 * standard rounded-3xl + soft-card shadow chrome from the design
 * system. The "Tour the cabinet →" CTA reuses the same group-hover
 * arrow translate the rest of the landings use.
 */

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FeatureDeepDiveProps {
  /** Anchor id for the in-page TOC. */
  id: string;
  /** Eyebrow label (e.g. "Channel manager"). */
  eyebrow: string;
  /** Display headline. */
  title: React.ReactNode;
  /** 1–3 paragraphs of body copy. */
  description: React.ReactNode;
  /** 3 short feature bullets shown under the description. */
  bullets: string[];
  /** Cabinet apex this feature lives in (e.g. /dashboard/front-office). */
  cabinetHref: string;
  /** Label for the cabinet CTA — defaults to "Tour the cabinet". */
  cabinetLabel?: string;
  /** Path to the mockup image (under /public). */
  mockupSrc: string;
  /** Alt text for the mockup. */
  mockupAlt: string;
  /** When true, mockup renders on the left + text on the right. */
  reverse?: boolean;
  className?: string;
}

export function FeatureDeepDive({
  id,
  eyebrow,
  title,
  description,
  bullets,
  cabinetHref,
  cabinetLabel = "Tour the cabinet",
  mockupSrc,
  mockupAlt,
  reverse,
  className,
}: FeatureDeepDiveProps) {
  return (
    <section
      id={id}
      data-stage10="feature-deep-dive"
      className={cn(
        "scroll-mt-24 py-20 md:py-28 border-b border-line-soft",
        className,
      )}
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-8">
        <div
          className={cn(
            "grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-14 items-center",
            reverse && "lg:[&>*:first-child]:order-2",
          )}
        >
          <div className="flex flex-col gap-5">
            <span className="text-label">{eyebrow}</span>
            <h2 className="font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
              {title}
            </h2>
            <div className="text-base md:text-lg text-ink-secondary leading-relaxed max-w-xl flex flex-col gap-3">
              {typeof description === "string" ? (
                <p>{description}</p>
              ) : (
                description
              )}
            </div>
            <ul className="flex flex-col gap-2.5 mt-2">
              {bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 text-sm md:text-base text-ink-secondary"
                >
                  <span className="shrink-0 w-5 h-5 rounded-full bg-success-weak text-success inline-flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3" strokeWidth={2.5} />
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href={cabinetHref}
              className="group mt-3 inline-flex items-center gap-2 text-sm font-medium text-ink hover:underline underline-offset-4 self-start"
            >
              {cabinetLabel}
              <ArrowRight
                className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={1.75}
              />
            </Link>
          </div>
          <div className="relative aspect-[3/2] rounded-3xl border border-line-soft bg-surface shadow-elevated-card overflow-hidden">
            <Image
              src={mockupSrc}
              alt={mockupAlt}
              fill
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
