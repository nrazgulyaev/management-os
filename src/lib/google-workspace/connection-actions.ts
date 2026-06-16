"use server";

/**
 * Stage 7.F.B.2 — Google Workspace connection actions (UI surface).
 *
 * Thin `"use server"` wrappers over the server-only google-workspace
 * service. The service module is now `import "server-only"` (NOT a
 * `"use server"` RPC surface), so these actions are the ONLY
 * browser-invokable entry points into Google connection management.
 *
 * TENANCY: every action derives the org server-side via `requireOrgId()`
 * and gates on a permission — a client NEVER supplies an organizationId.
 * Mirrors `src/lib/marketing/connection-actions.ts`.
 */

import { disconnectGoogleConnection } from "./service";

/**
 * Soft-disconnect the caller's Google Workspace grant. Only the
 * connectionId is accepted from the client; the org + permission gate
 * are enforced inside `disconnectGoogleConnection` (requireOrgId() +
 * integrations.write), so a foreign connectionId is a scoped no-op
 * rather than a cross-tenant write.
 */
export async function disconnectGoogleConnectionAction(input: {
  connectionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await disconnectGoogleConnection({ connectionId: input.connectionId });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
