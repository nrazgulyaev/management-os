/**
 * Cron-endpoint auth. Pure-ish helper — reads env via @/lib/env and inspects
 * a NextRequest. Not marked `server-only` so that tests can import the pure
 * `verifyCronAuth` predicate against synthetic Request-like objects.
 */

import { env, isProduction } from "@/lib/env";

export interface CronAuthResult {
  ok: boolean;
  reason?: string;
  /** True if we accepted the request only because we're on localhost without
   *  a CRON_SECRET set. The route handlers should log a warning. */
  warnedLocalhostBypass?: boolean;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

interface AuthInput {
  authorizationHeader: string | null;
  hostHeader: string | null;
}

/**
 * Pure decision function. Returns ok=true when:
 *   - the bearer matches CRON_SECRET (in any environment), OR
 *   - we're not in production AND CRON_SECRET is unset AND the host is local.
 *
 * Production never accepts requests without a matching bearer — even if
 * someone deploys without setting CRON_SECRET, the cron endpoints stay
 * locked.
 */
export function verifyCronAuth(input: AuthInput): CronAuthResult {
  const expected = env.server.CRON_SECRET ?? "";
  const auth = input.authorizationHeader ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";

  if (expected.length > 0 && bearer === expected) {
    return { ok: true };
  }

  if (isProduction()) {
    return { ok: false, reason: "missing or invalid bearer token" };
  }

  // Dev: allow only when both CRON_SECRET is unset AND the host header
  // resolves to a local address. Deny otherwise so a misconfigured
  // staging deployment still requires the secret.
  if (expected.length === 0) {
    const host = (input.hostHeader ?? "").split(":")[0].toLowerCase();
    if (LOCAL_HOSTS.has(host)) {
      return { ok: true, warnedLocalhostBypass: true };
    }
    return { ok: false, reason: "CRON_SECRET unset and request not from localhost" };
  }

  return { ok: false, reason: "missing or invalid bearer token" };
}

export function verifyCronAuthFromRequest(request: Request): CronAuthResult {
  return verifyCronAuth({
    authorizationHeader: request.headers.get("authorization"),
    hostHeader: request.headers.get("host"),
  });
}
