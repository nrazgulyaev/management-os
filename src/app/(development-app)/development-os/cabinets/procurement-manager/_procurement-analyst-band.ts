import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * W2 — procurement_analyst agent-outputs band for the Procurement
 * Manager cabinet.
 *
 * Mirrors the live agent-outputs surfacing other cabinets do (the AI
 * agent page reads `agent_outputs WHERE agent_key = 'procurement_analyst'`)
 * but shaped for the inline cabinet band: the latest few outputs with
 * their review status, so the procurement manager sees the analyst's
 * findings without leaving the cabinet.
 *
 * Co-located (underscore prefix) so it stays page-private.
 */

export interface ProcurementAnalystOutput {
  outputCode: string;
  title: string;
  summary: string;
  status: string;
  confidenceLevel: string | null;
  createdAt: string;
}

export async function loadProcurementAnalystBand(): Promise<
  ProcurementAnalystOutput[]
> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db.execute<{
    output_code: string;
    title: string;
    summary: string;
    status: string;
    confidence_level: string | null;
    created_at: string;
  }>(sql`
    SELECT output_code,
           title,
           summary,
           status,
           confidence_level,
           created_at::text AS created_at
      FROM agent_outputs
     WHERE agent_key = 'procurement_analyst'
       AND (organization_id = ${organizationId} OR organization_id IS NULL)
     ORDER BY created_at DESC
     LIMIT 3
  `);
  return rowsOf<{
    output_code: string;
    title: string;
    summary: string;
    status: string;
    confidence_level: string | null;
    created_at: string;
  }>(rows).map((r) => ({
    outputCode: r.output_code,
    title: r.title,
    summary: r.summary,
    status: r.status,
    confidenceLevel: r.confidence_level,
    createdAt: r.created_at,
  }));
}
