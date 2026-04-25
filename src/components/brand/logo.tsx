import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function ArconiqueMark({
  className,
  size = 22,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("text-ink", className)}
    >
      <path
        d="M16 3.5 L27.5 28.5 L22.8 28.5 L20.2 22.6 L11.8 22.6 L9.2 28.5 L4.5 28.5 Z M13.3 18.8 L18.7 18.8 L16 12.5 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Logo({
  href = "/",
  variant = "full",
  className,
}: {
  href?: string;
  variant?: "full" | "mark";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 text-ink hover:opacity-80 transition-opacity",
        className
      )}
      aria-label="Arconique Management OS"
    >
      <ArconiqueMark />
      {variant === "full" && (
        <span className="flex flex-col leading-none">
          <span className="text-display text-[15px] tracking-[0.02em] font-medium">
            Arconique
          </span>
          <span className="text-[9px] tracking-[0.22em] uppercase text-ink-tertiary mt-0.5">
            Management OS
          </span>
        </span>
      )}
    </Link>
  );
}
