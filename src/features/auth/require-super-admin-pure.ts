/**
 * PLATFORM-ADMIN-ALLOWLIST — pure, dependency-free core of the platform-admin
 * gate (SIGNUP-ESCALATION-FIX, PRs #302/#303). Extracted so the fail-closed
 * behaviour can be unit-tested without pulling in the `server-only` /
 * `getCurrentUserContext` (DB) graph. Mirrors the codebase's *-pure convention
 * (statement-net-pure, login-throttle-pure, products-access-pure).
 *
 * `super_admin` (global `user_roles`) is minted for EVERY org admin by both
 * provisioning paths, so it conflates "org admin" with "platform operator". The
 * platform operator is instead identified by an explicit env allowlist —
 * `PLATFORM_ADMIN_EMAILS` (comma-separated, case-insensitive, whitespace
 * trimmed). FAIL-CLOSED by construction: an unset/empty allowlist yields an
 * empty set, so `isPlatformAdminEmail` returns false for every address. The
 * server wrapper (require-super-admin.ts) supplies `process.env.PLATFORM_ADMIN_EMAILS`.
 */

/** Parse the raw comma-separated env value into a normalized email set. */
export function parsePlatformAdminEmails(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

/**
 * Is `email` on the platform-admin allowlist parsed from `raw`? Case-insensitive
 * and whitespace-insensitive. Returns false for a null/empty email OR an
 * unset/empty allowlist (fail-closed).
 */
export function isPlatformAdminEmailIn(
  email: string | null | undefined,
  raw: string | null | undefined,
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return parsePlatformAdminEmails(raw).has(normalized);
}
