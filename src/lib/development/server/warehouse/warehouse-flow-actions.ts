"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  devOsInventoryItems,
  devOsInventoryLocations,
} from "@/lib/db/schema/dev-os-inventory";
import { projects, villas } from "@/lib/db/schema/projects";
import { recordInventoryMovement } from "@/lib/development/server/inventory/inventory-actions";

/**
 * build-warehouse-flow — pick/dispatch write action for /warehouse/picks.
 *
 * A "pick" leaves the warehouse for a site destination (project / villa /
 * site location). We map the chosen destination to the right movement
 * fields and delegate to the existing org-scoped, atomic, audited
 * `recordInventoryMovement` (which requires an internal user, resolves
 * the org via requireOrgId, generates the INV-YYYY-#### code, writes the
 * immutable movement audit row, and decrements the source balance). No
 * new DB path is introduced — this is a thin, on-token façade over it.
 */

const PICK_DESTINATION = /^(project|villa|location):[0-9a-f-]{36}$/i;

const dispatchPickSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  fromLocationId: z.string().uuid(),
  /** "project:<id>" | "villa:<id>" | "location:<id>" */
  destination: z.string().regex(PICK_DESTINATION),
  reason: z.string().trim().max(500).optional(),
});

export interface DispatchPickResult {
  ok: boolean;
  movementCode?: string;
  error?: string;
}

/**
 * Dispatch (issue) stock from a warehouse source location to a site
 * destination. Writes one `issued_to_site` inventory_movement.
 */
export async function dispatchPick(
  input: z.input<typeof dispatchPickSchema>,
): Promise<DispatchPickResult> {
  let parsed: z.infer<typeof dispatchPickSchema>;
  try {
    parsed = dispatchPickSchema.parse(input);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof z.ZodError
          ? (err.issues[0]?.message ?? "Invalid pick input")
          : "Invalid pick input",
    };
  }

  const [kind, destId] = parsed.destination.split(":") as [
    "project" | "villa" | "location",
    string,
  ];

  try {
    // SECURITY: validate the source location, item, and destination all
    // belong to the caller's org before delegating the write. The
    // underlying recordInventoryMovement stamps the org on the new row
    // but does not verify the referenced FKs are in-tenant, so we gate
    // cross-tenant ids here.
    const organizationId = await requireOrgId();
    const db = requireDb();

    const [srcLoc] = await db
      .select({ id: devOsInventoryLocations.id })
      .from(devOsInventoryLocations)
      .where(
        and(
          eq(devOsInventoryLocations.id, parsed.fromLocationId),
          eq(devOsInventoryLocations.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!srcLoc) {
      return { ok: false, error: "Source location not found in your org" };
    }

    const [item] = await db
      .select({ id: devOsInventoryItems.id })
      .from(devOsInventoryItems)
      .where(
        and(
          eq(devOsInventoryItems.id, parsed.itemId),
          eq(devOsInventoryItems.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!item) {
      return { ok: false, error: "Item not found in your org" };
    }

    if (kind === "project") {
      const [p] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, destId),
            eq(projects.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!p) {
        return { ok: false, error: "Destination project not in your org" };
      }
    } else if (kind === "villa") {
      const [v] = await db
        .select({ id: villas.id })
        .from(villas)
        .innerJoin(projects, eq(projects.id, villas.projectId))
        .where(
          and(
            eq(villas.id, destId),
            eq(projects.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!v) {
        return { ok: false, error: "Destination villa not in your org" };
      }
    } else {
      const [l] = await db
        .select({ id: devOsInventoryLocations.id })
        .from(devOsInventoryLocations)
        .where(
          and(
            eq(devOsInventoryLocations.id, destId),
            eq(devOsInventoryLocations.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!l) {
        return { ok: false, error: "Destination location not in your org" };
      }
    }

    const movement = await recordInventoryMovement({
      itemId: parsed.itemId,
      movementType: "issued_to_site",
      quantity: parsed.quantity,
      fromLocationId: parsed.fromLocationId,
      toLocationId: kind === "location" ? destId : null,
      projectId: kind === "project" ? destId : null,
      villaId: kind === "villa" ? destId : null,
      reason: parsed.reason ?? "Warehouse pick / dispatch to site",
    });
    revalidatePath("/development-os/warehouse/picks");
    revalidatePath("/development-os/warehouse/movements");
    return { ok: true, movementCode: movement?.movementCode };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Dispatch failed",
    };
  }
}
