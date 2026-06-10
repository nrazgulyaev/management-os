/**
 * Pure presentation helpers for the unified direct-booking detail +
 * operator-create flows. No I/O — safe to import from both server and
 * client modules.
 */

/** Format minor units (bigint) → "CUR 1,234.56". Manual money only. */
export function formatMinor(minor: bigint, currency: string | null): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const grouped = whole
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = neg ? "-" : "";
  return `${currency ? currency + " " : ""}${sign}${grouped}.${String(
    frac,
  ).padStart(2, "0")}`.trim();
}

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "2026-06-09" → { dow: "mon", dn: "09" } for the coverage strip header. */
export function dayHeader(iso: string): { dow: string; dn: string } {
  const [, m, d] = iso.split("-");
  const date = new Date(`${iso}T00:00:00.000Z`);
  return {
    dow: Number.isNaN(date.getTime()) ? "" : DOW[date.getUTCDay()],
    dn: d ?? m ?? "",
  };
}

/** Initials for the avatar primitive ("Marco Park" → "MP"). */
export function guestInitials(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const a = (first ?? "").trim().charAt(0).toUpperCase();
  const b = (last ?? "").trim().charAt(0).toUpperCase();
  const out = `${a}${b}`.trim();
  return out || "—";
}
