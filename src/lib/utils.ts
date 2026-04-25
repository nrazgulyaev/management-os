import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatIDR(minor: number, opts?: { compact?: boolean }) {
  const major = minor / 100;
  if (opts?.compact && Math.abs(major) >= 1_000_000) {
    return `Rp ${(major / 1_000_000).toFixed(1)}M`;
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(major);
}

export function formatUSD(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(v: number, digits = 1) {
  return `${v.toFixed(digits)}%`;
}

export function formatDelta(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export function formatDate(input: string | Date, variant: "long" | "short" = "short") {
  const d = typeof input === "string" ? new Date(input) : input;
  const opts: Intl.DateTimeFormatOptions =
    variant === "long"
      ? { day: "numeric", month: "long", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-GB", opts).format(d);
}
