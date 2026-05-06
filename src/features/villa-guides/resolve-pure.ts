/**
 * Pure villa-guide resolution helpers. NO `server-only` import — the
 * service layer queries both villa-scoped and project-scoped rows and
 * passes them in. The resolver merges with villa-first precedence.
 */

export interface ScopedRow {
  id: string;
  villaId: string | null;
  projectId: string | null;
  status: string;
  guestVisible?: boolean;
  sortOrder?: number;
}

/**
 * Pure: keep only `active` + `guestVisible !== false` rows; sort by
 * `sortOrder` ascending, then by id for determinism.
 */
export function filterGuestVisible<T extends ScopedRow>(rows: T[]): T[] {
  return rows
    .filter((r) => r.status === "active")
    .filter((r) => r.guestVisible !== false)
    .sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.id.localeCompare(b.id);
    });
}

/**
 * Pure: resolve villa-first → project-fallback for keyed sections (one
 * row per `sectionKey`). The villa row beats the project row at the
 * same key. Only active + guest-visible.
 */
export function resolveByKey<
  T extends ScopedRow & { sectionKey: string },
>(rows: T[]): T[] {
  const visible = filterGuestVisible(rows);
  const seen = new Map<string, T>();
  // Prefer villa-scoped first.
  for (const r of visible) {
    if (r.villaId) seen.set(r.sectionKey, r);
  }
  for (const r of visible) {
    if (!r.villaId && !seen.has(r.sectionKey)) seen.set(r.sectionKey, r);
  }
  return Array.from(seen.values());
}

/**
 * Pure: for non-keyed lists (Wi-Fi, contacts, neighborhood), the
 * villa-scoped rows REPLACE the project-scoped rows when any villa row
 * exists. This matches operator intent — if a villa has its own contacts
 * configured, the project defaults stop applying.
 *
 * If no villa rows are configured, project rows fall through.
 */
export function resolveListWithFallback<T extends ScopedRow>(
  rows: T[],
): T[] {
  const visible = filterGuestVisible(rows);
  const villa = visible.filter((r) => r.villaId !== null);
  if (villa.length > 0) return villa;
  return visible.filter((r) => r.villaId === null);
}
