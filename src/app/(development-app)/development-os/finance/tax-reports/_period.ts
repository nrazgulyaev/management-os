/**
 * ID-TAX — period helpers shared by the tax-reports page and the bukti
 * potong register sub-route (extracted from page.tsx so both surfaces
 * resolve + label periods identically). Pure; no server deps.
 */

export interface PeriodKey {
  start: string;
  end: string;
}

export function periodParam(p: PeriodKey): string {
  return `${p.start}_${p.end}`;
}

/** Parse a "<start>_<end>" search param; null when malformed. */
export function parsePeriodParam(raw: string | undefined): PeriodKey | null {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (!m) return null;
  return { start: m[1], end: m[2] };
}

/** Calendar month → "May 2026"; anything else → raw bounds. */
export function monthLabel(p: PeriodKey): string {
  const d = new Date(`${p.start}T00:00:00Z`);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  if (p.start.endsWith("-01") && p.end === lastDay) {
    return d.toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return `${p.start} → ${p.end}`;
}

export function calendarMonth(offset: number): PeriodKey {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0),
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
