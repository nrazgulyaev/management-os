import "server-only";

/**
 * W3 RFI loop — rfi-router (real).
 *
 * Called by the `composeRfi` server action on submit. Routes an RFI to the
 * project-team contact that owns the discipline by reading project-scoped
 * `contact_roles` (joined to `contacts` for the display name):
 *
 *   structural   → engineer → architect
 *   architectural→ architect
 *   mep          → engineer
 *   finishes     → designer → architect
 *   landscape    → designer → architect
 *   civil        → engineer
 *   other / none → pm → site_supervisor (fallback)
 *
 * The discipline→role priority and the de-duplicated fallback live in the
 * pure module `@/features/development/rfi/rfi-routing` so they stay unit-
 * testable. When no active team contact matches any candidate role the RFI
 * is left unrouted (routedToContactId === null) for the PM to claim by hand
 * — an RFI is never dropped.
 */

import { and, eq, isNull } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { contactRoles, contacts } from "@/lib/db/schema/contacts";
import type { RfiDiscipline } from "@/lib/db/schema/rfis";
import { routingRolesFor } from "@/features/development/rfi/rfi-routing";

export interface RouteRfiInput {
  /** Caller's org, derived server-side. Scopes the contact_roles read so a
   *  client-supplied projectId can't pull another tenant's roster. */
  organizationId: string;
  projectId: string;
  discipline: RfiDiscipline;
}

export interface RouteRfiOutput {
  routedToContactId: string | null;
  /** Display name surfaced to the operator. */
  routedTo: string;
  /** The contact_roles.role that matched (null when unrouted). */
  matchedRole: string | null;
}

/**
 * Resolves the on-roster contact for a discipline. Returns the first active
 * project-scoped contact whose role matches the discipline's priority list,
 * honouring that priority (e.g. an `engineer` is preferred over a fall-back
 * `pm` for a structural RFI).
 */
export async function route(input: RouteRfiInput): Promise<RouteRfiOutput> {
  const db = requireDb();
  const candidateRoles = routingRolesFor(input.discipline);

  // One query: pull every active project-scoped team contact + their role,
  // then pick the best match in JS by candidate-role priority. Cheaper than
  // N round-trips and keeps the priority logic in the pure module's order.
  const rosters = await db
    .select({
      contactId: contacts.id,
      role: contactRoles.role,
      fullName: contacts.fullName,
      displayName: contacts.displayName,
    })
    .from(contactRoles)
    .innerJoin(contacts, eq(contactRoles.contactId, contacts.id))
    .where(
      and(
        // TENANCY: composeRfi passes a CLIENT-supplied projectId without first
        // validating it against the caller's org. Scope the roster read by the
        // caller's org (contact_roles carries organization_id) so a foreign
        // projectId can't read another tenant's contacts/roles.
        eq(contactRoles.organizationId, input.organizationId),
        eq(contactRoles.scopeProjectId, input.projectId),
        eq(contactRoles.scope, "project"),
        isNull(contactRoles.endedAt),
        eq(contacts.isArchived, false),
      ),
    );

  for (const role of candidateRoles) {
    const hit = rosters.find((r) => r.role === role);
    if (hit) {
      return {
        routedToContactId: hit.contactId,
        routedTo: hit.displayName ?? hit.fullName,
        matchedRole: role,
      };
    }
  }

  return { routedToContactId: null, routedTo: "Unrouted · PM to assign", matchedRole: null };
}

export const RFI_ROUTER_AGENT = {
  agentCode: "rfi-router",
  description:
    "Routes an RFI to the project-team contact that owns the discipline by reading project-scoped contact_roles (architect / engineer / designer / pm).",
} as const;
