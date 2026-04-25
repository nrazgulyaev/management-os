import * as React from "react";
import { cn } from "@/lib/utils";

export function Section({
  eyebrow,
  title,
  description,
  children,
  action,
  className,
  variant = "default",
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  variant?: "default" | "bleed" | "panel";
}) {
  return (
    <section
      className={cn(
        "w-full",
        variant === "panel" &&
          "rounded-lg bg-surface border border-line-soft p-6 md:p-8",
        className
      )}
    >
      {(title || eyebrow || action) && (
        <header className="flex items-end justify-between gap-6 mb-6 flex-wrap">
          <div className="flex flex-col gap-1.5 max-w-2xl">
            {eyebrow && <span className="text-label">{eyebrow}</span>}
            {title && (
              <h2 className="text-display text-[26px] md:text-[32px] leading-tight font-medium text-ink">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-ink-secondary text-sm md:text-base leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Container({
  className,
  size = "default",
  children,
}: {
  className?: string;
  size?: "narrow" | "default" | "wide" | "bleed";
  children: React.ReactNode;
}) {
  const sizes = {
    narrow: "max-w-3xl",
    default: "max-w-6xl",
    wide: "max-w-[1400px]",
    bleed: "max-w-none",
  };
  return (
    <div className={cn("w-full mx-auto px-6 md:px-8", sizes[size], className)}>
      {children}
    </div>
  );
}
