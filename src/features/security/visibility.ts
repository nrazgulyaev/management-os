/**
 * Pure visibility helpers. No `server-only` import.
 *
 * Camera visibility: owners + guests must NEVER see camera surfaces.
 * RLS already enforces this at the DB layer; this helper exists so any
 * server-side render that branches on visibility has a single, obvious
 * call site to consult.
 */

export function isOwnerSafeCameraSurface(): false {
  return false;
}
