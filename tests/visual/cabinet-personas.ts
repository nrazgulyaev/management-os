import path from "node:path";

/**
 * Cabinet visual-regression personas.
 *
 * Each authenticated cabinet surface needs a differently-privileged
 * account (the layouts gate server-side — see src/app/(owner)/owner/
 * layout.tsx, src/app/(platform-app)/layout.tsx,
 * src/lib/investor-portal/session.ts):
 *
 *   admin    — super_admin. Covers Mgmt OS (/dashboard/*), Dev OS
 *              (/development-os/*) and Platform OS (/platform/*):
 *              super_admin bypasses the per-product access check
 *              (decideProductAccess) and passes the platform layout's
 *              isSuperAdmin gate.
 *   owner    — an app user with an owner-portal grant (appUsers row
 *              linked to an owner; see `npm run seed:auth-owner-grants`).
 *              Required for /owner — a super_admin WITHOUT the
 *              impersonation cookie gets bounced to /dashboard.
 *   investor — an app user with the `investor_viewer` role AND a
 *              non-null investor_id (see `npm run
 *              seed:auth-investor-grants`). Required for
 *              /investor-portal/* — anything else bounces to
 *              /investor-portal/login.
 *
 * Credentials come from env vars (same convention as the multi-tenant
 * e2e suite). Missing credentials → the persona's tests SKIP with a
 * clear message; we never fabricate a session.
 */

export interface VisualPersona {
  key: "admin" | "owner" | "investor";
  /** Env var names, surfaced in skip messages. */
  emailVar: string;
  passwordVar: string;
  email: string;
  password: string;
  /** Where cabinets.setup.ts saves the signed-in storage state. */
  stateFile: string;
  /** True when both env vars are present. */
  ready: boolean;
  description: string;
}

export const AUTH_DIR = path.join(__dirname, ".auth");

function persona(
  key: VisualPersona["key"],
  envKey: string,
  description: string,
): VisualPersona {
  const emailVar = `PLAYWRIGHT_VISUAL_${envKey}_EMAIL`;
  const passwordVar = `PLAYWRIGHT_VISUAL_${envKey}_PASSWORD`;
  const email = process.env[emailVar] ?? "";
  const password = process.env[passwordVar] ?? "";
  return {
    key,
    emailVar,
    passwordVar,
    email,
    password,
    stateFile: path.join(AUTH_DIR, `${key}.json`),
    ready: Boolean(email && password),
    description,
  };
}

export const PERSONAS: Record<VisualPersona["key"], VisualPersona> = {
  admin: persona(
    "admin",
    "ADMIN",
    "super_admin — Mgmt OS + Dev OS + Platform OS",
  ),
  owner: persona("owner", "OWNER", "owner-portal grant — /owner"),
  investor: persona(
    "investor",
    "INVESTOR",
    "investor_viewer + linked investor — /investor-portal",
  ),
};
