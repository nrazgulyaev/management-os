/**
 * Sprint LD-1 — PhotographicHero primitive.
 *
 * Reference 1 (VaultX/Mineral) silhouette: full-width hero band with a
 * photographic background (image or muted video), a gradient overlay,
 * a massive centered headline, two CTAs, and 4–6 floating preview
 * cards arranged around the photograph (absolute on desktop, stacked
 * below text on mobile). Optional 5-star rating chip.
 *
 * Server component (no client state). The optional video fallback
 * autoplays muted + looped; image bg is rendered via next/image for
 * proper LCP behaviour.
 */

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type FloatingCardTone =
  | "emerald"
  | "gold"
  | "coral"
  | "sage"
  | "ink-deep";

const TONE_DOT: Record<FloatingCardTone, string> = {
  emerald: "bg-success",
  gold: "bg-gold",
  coral: "bg-warning",
  sage: "bg-info",
  "ink-deep": "bg-ink",
};

export interface PhotographicFloatingCard {
  title: string;
  /** Pre-formatted value (e.g. "23 / 28 villas"). */
  value: string;
  /** Optional secondary line. */
  subtitle?: string;
  tone?: FloatingCardTone;
}

export interface PhotographicHeroProps {
  /** Path to the hero background image (web-served — under /public). */
  bgImageSrc: string;
  /** Optional muted/looped background video src, used as a fallback. */
  bgVideoSrc?: string;
  /** Headline copy (string or rich node). */
  headline: React.ReactNode;
  /** Subhead copy, 1–3 sentences. */
  subhead: React.ReactNode;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  /** 4–6 floating preview cards. */
  floatingCards?: PhotographicFloatingCard[];
  /** Optional rating chip (e.g. 5★, 200, "Bali portfolios trust us"). */
  rating?: { stars: number; count: number; label: string };
  className?: string;
}

export function PhotographicHero({
  bgImageSrc,
  bgVideoSrc,
  headline,
  subhead,
  primaryCta,
  secondaryCta,
  floatingCards = [],
  rating,
  className,
}: PhotographicHeroProps) {
  const cards = floatingCards.slice(0, 6);
  return (
    <section
      className={cn(
        "relative w-full overflow-hidden",
        "min-h-[640px] md:min-h-[760px] lg:min-h-[840px]",
        className,
      )}
      data-stage10="photographic-hero"
    >
      <div className="absolute inset-0 -z-10" aria-hidden>
        {bgVideoSrc ? (
          <video
            autoPlay
            muted
            playsInline
            loop
            className="absolute inset-0 w-full h-full object-cover"
            poster={bgImageSrc}
          >
            <source src={bgVideoSrc} type="video/mp4" />
          </video>
        ) : (
          <Image
            src={bgImageSrc}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/20 to-black/60" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
      </div>

      <div className="relative max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-28 lg:py-32 flex flex-col items-center text-center">
        {rating && (
          <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-4 h-10 text-white">
            <span className="inline-flex items-center gap-0.5">
              {Array.from({ length: rating.stars }).map((_, i) => (
                <Star
                  key={i}
                  className="w-3.5 h-3.5 fill-current text-gold"
                  strokeWidth={0}
                />
              ))}
            </span>
            <span className="text-xs font-medium">
              {rating.count}+ {rating.label}
            </span>
          </div>
        )}

        <h1 className="font-display text-[40px] md:text-[64px] lg:text-[80px] leading-[1.02] tracking-[-0.02em] text-white max-w-4xl">
          {headline}
        </h1>
        <p className="mt-6 md:mt-8 text-base md:text-xl text-white/85 leading-relaxed max-w-2xl">
          {subhead}
        </p>

        <div className="mt-8 md:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <Link
            href={primaryCta.href}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-white text-ink px-6 h-12 text-sm font-medium hover:bg-white/90 transition-colors"
          >
            {primaryCta.label}
            <ArrowRight
              className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
            />
          </Link>
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/25 text-white px-6 h-12 text-sm font-medium hover:bg-white/20 transition-colors"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>

        {cards.length > 0 && (
          <div className="lg:hidden mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
            {cards.map((c, i) => (
              <FloatingCard key={`${c.title}-${i}`} card={c} />
            ))}
          </div>
        )}
      </div>

      {cards.length > 0 && (
        <div className="hidden lg:block">
          {cards.map((c, i) => (
            <div
              key={`abs-${c.title}-${i}`}
              className={cn("absolute z-10", FLOATING_POSITIONS[i])}
            >
              <FloatingCard card={c} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const FLOATING_POSITIONS = [
  "top-[18%] left-[5%] xl:left-[8%]",
  "top-[14%] right-[6%] xl:right-[10%]",
  "bottom-[14%] left-[7%] xl:left-[11%]",
  "bottom-[16%] right-[5%] xl:right-[8%]",
  "top-[50%] left-[2%] xl:left-[4%] -translate-y-1/2",
  "top-[48%] right-[2%] xl:right-[4%] -translate-y-1/2",
];

function FloatingCard({ card }: { card: PhotographicFloatingCard }) {
  const tone = card.tone ?? "emerald";
  return (
    <div className="w-[200px] xl:w-[220px] rounded-2xl bg-white/85 backdrop-blur-md border border-white/40 shadow-elevated-card p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className={cn("w-2 h-2 rounded-full shrink-0", TONE_DOT[tone])}
          aria-hidden
        />
        <span className="text-[10px] uppercase tracking-[0.16em] text-ink-tertiary font-medium truncate">
          {card.title}
        </span>
      </div>
      <p className="text-base font-mono tabular-nums text-ink leading-tight">
        {card.value}
      </p>
      {card.subtitle && (
        <p className="text-[11px] text-ink-tertiary leading-snug">
          {card.subtitle}
        </p>
      )}
    </div>
  );
}
