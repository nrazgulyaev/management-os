"use server";

/**
 * Sprint 4.5 — Import template save / list / delete server actions.
 *
 * Backs the import wizard's "Save as template" affordance + the
 * dropdown of saved templates. Templates are per-org (RLS isolation
 * via the org_isolation policy on `import_templates`); the
 * destination kind is fixed to `transactions` for the wizard.
 *
 * Versioning: saving with an existing name auto-increments
 * `version`. Older versions remain queryable for audit but
 * `listImportTemplates` only returns the highest version per name.
 */

import { and, desc, eq, max, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb, rowsOf } from "@/lib/db/client";
import {
  importTemplates,
  type ImportTemplate,
} from "@/lib/db/schema/import-templates";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  columnMappingSchema,
  type ColumnMapping,
} from "./transaction-import";

const SOURCE_KIND_VALUES = [
  "csv",
  "xlsx",
  "sheets_paste",
  "sheets_live",
] as const;

const saveSchema = z.object({
  name: z.string().min(1).max(80),
  sourceKind: z.enum(SOURCE_KIND_VALUES),
  columnMapping: columnMappingSchema,
  notes: z.string().max(500).optional().nullable(),
});

export interface SavedImportTemplate {
  id: string;
  name: string;
  version: number;
  sourceKind: string;
  columnMapping: ColumnMapping;
  notes: string | null;
  lastUsedAt: string | null;
  useCount: number;
  updatedAt: string;
}

function toSaved(row: ImportTemplate): SavedImportTemplate {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    sourceKind: row.sourceKind,
    columnMapping: row.columnMapping as ColumnMapping,
    notes: row.notes,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    useCount: row.useCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Persist a new template version. Returns the saved row.
 *   - First save under a name → version 1.
 *   - Subsequent saves → max(version)+1.
 *   - Old versions stay (audit + rollback).
 */
export async function saveImportTemplate(
  input: z.input<typeof saveSchema>,
): Promise<SavedImportTemplate> {
  const parsed = saveSchema.parse(input);
  const db = requireDb();
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();

  const [highest] = await db
    .select({ v: max(importTemplates.version) })
    .from(importTemplates)
    .where(
      and(
        eq(importTemplates.organizationId, orgId),
        eq(importTemplates.name, parsed.name),
      ),
    );
  const nextVersion = (highest?.v ?? 0) + 1;

  const [row] = await db
    .insert(importTemplates)
    .values({
      organizationId: orgId,
      name: parsed.name,
      version: nextVersion,
      sourceKind: parsed.sourceKind,
      destinationKind: "transactions",
      columnMapping: parsed.columnMapping,
      notes: parsed.notes ?? null,
      createdByUserId: me?.id ?? null,
      lastUsedAt: new Date(),
      useCount: 0,
    })
    .returning();
  return toSaved(row);
}

/**
 * List highest-version-per-name templates for the current org.
 * Ordered by most-recently-used (then name).
 */
export async function listImportTemplates(): Promise<
  SavedImportTemplate[]
> {
  const db = requireDb();
  const orgId = await requireOrgId();

  // SQL window function to pick the highest version per name without
  // a sub-select join — Postgres-native, faster than two round-trips.
  const rows = await db.execute<{
    id: string;
    name: string;
    version: number;
    source_kind: string;
    destination_kind: string;
    column_mapping: unknown;
    notes: string | null;
    last_used_at: string | null;
    use_count: number;
    updated_at: string;
    created_at: string;
  }>(sql`
    WITH ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY name ORDER BY version DESC) AS rn
        FROM import_templates
       WHERE organization_id = ${orgId}
         AND is_active = true
    )
    SELECT id, name, version, source_kind, destination_kind,
           column_mapping, notes,
           last_used_at::text, use_count,
           updated_at::text, created_at::text
      FROM ranked
     WHERE rn = 1
     ORDER BY last_used_at DESC NULLS LAST, name ASC
  `);
  const list = rowsOf<{
    id: string;
    name: string;
    version: number;
    source_kind: string;
    destination_kind: string;
    column_mapping: unknown;
    notes: string | null;
    last_used_at: string | null;
    use_count: number;
    updated_at: string;
    created_at: string;
  }>(rows);
  return list.map((r) => ({
    id: r.id,
    name: r.name,
    version: r.version,
    sourceKind: r.source_kind,
    columnMapping: r.column_mapping as ColumnMapping,
    notes: r.notes,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
    updatedAt: r.updated_at,
  }));
}

const useSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Increment `use_count` and update `last_used_at` when an operator
 * applies a template. Fire-and-forget — the caller should not block
 * on this.
 */
export async function recordImportTemplateUse(
  input: z.input<typeof useSchema>,
): Promise<void> {
  const parsed = useSchema.parse(input);
  const db = requireDb();
  // TENANCY — scope the use-count bump to the caller's org so a forged
  // template id can't touch another tenant's row.
  const orgId = await requireOrgId();
  await db
    .update(importTemplates)
    .set({
      lastUsedAt: new Date(),
      useCount: sql`${importTemplates.useCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(importTemplates.id, parsed.id),
        eq(importTemplates.organizationId, orgId),
      ),
    );
}

/**
 * Soft-delete (is_active=false). The row stays for audit; the
 * listImportTemplates query filters it out.
 */
export async function deactivateImportTemplate(
  input: z.input<typeof useSchema>,
): Promise<void> {
  const parsed = useSchema.parse(input);
  const db = requireDb();
  // TENANCY — scope the soft-delete to the caller's org so a forged template
  // id can't deactivate another tenant's template.
  const orgId = await requireOrgId();
  await db
    .update(importTemplates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(importTemplates.id, parsed.id),
        eq(importTemplates.organizationId, orgId),
      ),
    );
}

// Re-export for the wizard client component (importing from a
// "use server" module is fine; the imports get tree-shaken to the
// client-safe shapes).
export type { ColumnMapping };
// Silence the unused-import warning when only types are consumed.
void desc;
