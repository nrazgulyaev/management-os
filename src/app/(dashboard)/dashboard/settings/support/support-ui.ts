/**
 * Shared presentational helpers for the support inbox (org + platform side).
 * Pure — safe to import from server and client components.
 */

export const STATUS_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral" | "accent"
> = {
  open: "info",
  pending: "warning",
  closed: "neutral",
};

export const PRIORITY_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral" | "accent"
> = {
  normal: "neutral",
  high: "warning",
  urgent: "danger",
};

export function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Compact relative time: "3m ago", "5h ago", "2d ago". */
export function relTime(d: Date | null): string {
  if (!d) return "—";
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Age of a thread (now − createdAt) as "3h" / "2.5d". */
export function fmtAge(createdAt: Date): string {
  const hours = (Date.now() - createdAt.getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
}
