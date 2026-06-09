"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { projects, villas } from "@/lib/db/schema/projects";
import { assetTypes } from "@/lib/db/schema/asset-types";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { canManageEntity } from "@/features/auth/permissions";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Create a villa complex in one shot: a project, then villa TYPES
 * (distinct asset_types), then N villas per type (hotel-style room-type
 * inventory). This is the setup side of the type-based booking model —
 * once a complex has multiple villas of a type, /dashboard/bookings can
 * book "a Garden 2BR" and auto-assign a free unit.
 */

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "complex"
  );
}
function codeAbbr(s: string): string {
  const letters = s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return (letters || s.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "V").slice(0, 3);
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const villaTypeSchema = z.object({
  name: z.string().min(1, "Type name required"),
  bedrooms: z.coerce.number().int().min(0).max(50).default(0),
  count: z.coerce.number().int().min(1, "At least 1 villa").max(100),
  nightlyRateUsd: z.coerce.number().min(0).optional(),
});

const complexSchema = z.object({
  name: z.string().min(2, "Complex name required"),
  location: z.string().min(2, "Location required"),
  types: z.array(villaTypeSchema).min(1, "Add at least one villa type"),
});

export async function createComplexAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("villa"))) {
    return { ok: false, error: "Not authorised to create villas." };
  }

  // Dynamic type rows don't serialise as flat FormData — the form posts a
  // single JSON `payload` field.
  const raw = formData.get("payload");
  let payloadObj: unknown;
  try {
    payloadObj = JSON.parse(typeof raw === "string" ? raw : "{}");
  } catch {
    return { ok: false, error: "Invalid form payload." };
  }
  const parsed = complexSchema.safeParse(payloadObj);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the complex name, location, and villa types.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const d = parsed.data;
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const stamp = Date.now().toString(36).slice(-5);
  const projectSlug = `${slugify(d.name)}-${stamp}`;
  const prefix = codeAbbr(d.name);

  let projectId: string;
  let totalVillas = 0;
  try {
    const [proj] = await db
      .insert(projects)
      .values({ organizationId, slug: projectSlug, name: d.name, location: d.location })
      .returning({ id: projects.id });
    projectId = proj.id;

    let typeIdx = 0;
    for (const t of d.types) {
      typeIdx++;
      const [at] = await db
        .insert(assetTypes)
        .values({
          typeKey: `${slugify(t.name)}-${stamp}-${typeIdx}`,
          displayName: t.name,
          assetCategory: "residential",
          isRentable: true,
          isSaleable: true,
        })
        .returning({ id: assetTypes.id });

      const typeLetter = String.fromCharCode(64 + typeIdx); // A, B, C…
      const villaRows = Array.from({ length: t.count }, (_, i) => {
        const n = i + 1;
        return {
          projectId,
          unitCode: `${prefix}-${typeLetter}${pad(n)}`,
          slug: `${projectSlug}-${slugify(t.name)}-${n}`,
          name: `${t.name} ${n}`,
          assetTypeId: at.id,
          status: "ready",
          bedrooms: t.bedrooms,
          managementModel: "individual",
          currentNightlyRateUsd:
            t.nightlyRateUsd !== undefined ? String(t.nightlyRateUsd) : null,
        };
      });
      await db.insert(villas).values(villaRows);
      totalVillas += t.count;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    return {
      ok: false,
      error: msg.includes("unique")
        ? "A code or slug collided — try a slightly different complex name."
        : msg,
    };
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "complex.create",
    entityType: "project",
    entityId: projectId,
    after: { name: d.name, location: d.location, types: d.types, totalVillas },
  });

  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/villas");
  redirect(`/dashboard/projects/${projectSlug}`);
}
