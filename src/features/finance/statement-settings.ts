import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { orgStatementSettings } from "@/lib/db/schema/finance";

/**
 * STATEMENT-SETTINGS — per-org configuration for the canonical owner-statement
 * generator (statement-generator.ts). One row per organization
 * (org_statement_settings, migration 0182). Callers NEVER get null: when no row
 * exists getStatementSettings() returns STATEMENT_SETTINGS_DEFAULTS, which
 * exactly reproduces TODAY's generation behavior (all includes true, tax/reserve
 * in 'ledger' mode reading the posted lines).
 */

export type StatementMode = "off" | "ledger" | "formula";

export interface StatementSettings {
  includeFees: boolean;
  includeExpenses: boolean;
  includeManagementFee: boolean;
  taxMode: StatementMode;
  /** Percentage 0–100 used when taxMode === 'formula'. */
  taxPct: number;
  taxLabel: string;
  reserveMode: StatementMode;
  /** Percentage 0–100 used when reserveMode === 'formula'. */
  reservePct: number;
  reserveLabel: string;
  mgmtLabel: string;
  /** 3-letter ISO currency the statement is denominated in. */
  statementCurrency: string;
}

/**
 * The DEFAULTS — mirror the column defaults in migration 0182. Used both as the
 * form fallback and (critically) as the generator's behavior when an org has NO
 * settings row. tax/reserve default to 'ledger' so the generator reads posted
 * tax_lines / reserve_movements exactly as it does today.
 */
export const STATEMENT_SETTINGS_DEFAULTS: StatementSettings = {
  includeFees: true,
  includeExpenses: true,
  includeManagementFee: true,
  taxMode: "ledger",
  taxPct: 11,
  taxLabel: "Tax",
  reserveMode: "ledger",
  reservePct: 3,
  reserveLabel: "Reserve",
  mgmtLabel: "Management fee",
  statementCurrency: "IDR",
};

function normalizeMode(value: string): StatementMode {
  return value === "off" || value === "formula" ? value : "ledger";
}

/**
 * Org-scoped read (via requireOrgId). Returns the org's settings mapped to a
 * typed object, or STATEMENT_SETTINGS_DEFAULTS when no row exists / no DB — so
 * callers never have to handle null.
 */
export async function getStatementSettings(): Promise<StatementSettings> {
  const db = getDb();
  if (!db) return { ...STATEMENT_SETTINGS_DEFAULTS };

  const orgId = await requireOrgId();
  const [row] = await db
    .select()
    .from(orgStatementSettings)
    .where(eq(orgStatementSettings.organizationId, orgId))
    .limit(1);

  if (!row) return { ...STATEMENT_SETTINGS_DEFAULTS };

  return {
    includeFees: row.includeFees,
    includeExpenses: row.includeExpenses,
    includeManagementFee: row.includeManagementFee,
    taxMode: normalizeMode(row.taxMode),
    taxPct: Number(row.taxPct),
    taxLabel: row.taxLabel,
    reserveMode: normalizeMode(row.reserveMode),
    reservePct: Number(row.reservePct),
    reserveLabel: row.reserveLabel,
    mgmtLabel: row.mgmtLabel,
    statementCurrency: row.statementCurrency,
  };
}
