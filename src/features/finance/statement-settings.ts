import "server-only";

import { and, asc, eq, isNull, or, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  orgStatementSettings,
  orgStatementCustomDeductions,
  type OrgStatementSettings,
  type OrgStatementCustomDeduction,
} from "@/lib/db/schema/finance";

/**
 * STATEMENT-SETTINGS — per-SCOPE configuration for the canonical owner-statement
 * generator (statement-generator.ts). Rows in org_statement_settings are keyed by
 * (organization_id, project_id, owner_id) (migration 0183). The most-specific
 * matching row wins WHOLESALE — there is no field-level merge:
 *
 *   owner-match (owner_id = scope.ownerId)
 *     > project-match (project_id = scope.projectId, owner_id NULL)
 *       > org-default (project_id NULL, owner_id NULL)
 *         > STATEMENT_SETTINGS_DEFAULTS (no row at all)
 *
 * Callers NEVER get null: when no row exists getStatementSettings() returns
 * STATEMENT_SETTINGS_DEFAULTS, which exactly reproduces TODAY's generation
 * behavior (all includes true, tax/reserve/mgmt in 'ledger' mode reading the
 * posted lines, revenue from the ledger).
 *
 * The no-arg call (getStatementSettings()) resolves the ORG-DEFAULT row — so
 * #284's callers keep working unchanged.
 */

export type StatementMode = "off" | "ledger" | "formula";
export type CustomDeductionMode = "formula" | "fixed";

export interface StatementCustomDeduction {
  label: string;
  mode: CustomDeductionMode;
  /** % of gross revenue when mode === 'formula'. */
  pct: number | null;
  /** Flat minor-unit amount when mode === 'fixed'. */
  fixedAmountMinor: bigint | null;
  sortOrder: number;
}

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
  // MGMT (0183): how the management fee is computed.
  //   'off'     → suppress the fee.
  //   'ledger'  → read posted management-fee lines (today's behavior).
  //   'formula' → mgmtPct % of gross.
  mgmtMode: StatementMode;
  /** Percentage 0–100 used when mgmtMode === 'formula'. */
  mgmtPct: number;
  mgmtLabel: string;
  /** 'ledger' = posted revenue_lines (today); 'bookings' = derive from bookings. */
  revenueSource: string;
  /** 3-letter ISO currency the statement is denominated in. */
  statementCurrency: string;
  /**
   * Operator-defined extra deduction lines, resolved at the SAME scope
   * precedence as the settings row (owner's custom rows if any, else project's,
   * else org's). Each is a DEDUCTION (subtracts from net) per the #283 sign
   * convention.
   */
  customDeductions: StatementCustomDeduction[];
}

/**
 * The DEFAULTS — mirror the column defaults in migrations 0182/0183. Used both
 * as the form fallback and (critically) as the generator's behavior when an org
 * has NO settings row. tax/reserve/mgmt default to 'ledger' so the generator
 * reads posted tax_lines / reserve_movements / management-fee lines exactly as
 * it does today, and revenue comes from the ledger.
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
  mgmtMode: "ledger",
  mgmtPct: 20,
  mgmtLabel: "Management fee",
  revenueSource: "ledger",
  statementCurrency: "IDR",
  customDeductions: [],
};

export interface SettingsScope {
  ownerId?: string | null;
  projectId?: string | null;
}

function normalizeMode(value: string): StatementMode {
  return value === "off" || value === "formula" ? value : "ledger";
}

function normalizeRevenueSource(value: string): string {
  return value === "bookings" ? "bookings" : "ledger";
}

function normalizeDeductionMode(value: string): CustomDeductionMode {
  return value === "fixed" ? "fixed" : "formula";
}

/**
 * Map a raw settings ROW to the typed StatementSettings (without
 * customDeductions, which are resolved separately at the same scope). Each row
 * is a FULL settings object — the most-specific row wins wholesale.
 */
function rowToSettings(
  row: OrgStatementSettings,
): Omit<StatementSettings, "customDeductions"> {
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
    mgmtMode: normalizeMode(row.mgmtMode),
    mgmtPct: Number(row.mgmtPct),
    mgmtLabel: row.mgmtLabel,
    revenueSource: normalizeRevenueSource(row.revenueSource),
    statementCurrency: row.statementCurrency,
  };
}

/**
 * Pick the MOST-SPECIFIC matching row from the org's settings rows, given a
 * scope. owner-match > project-match > org-default > undefined (caller falls
 * back to STATEMENT_SETTINGS_DEFAULTS). A "project-match" requires owner_id NULL
 * so a per-owner override never doubles as the project row.
 */
function pickSettingsRow(
  rows: OrgStatementSettings[],
  scope: SettingsScope,
): OrgStatementSettings | undefined {
  if (scope.ownerId) {
    const ownerRow = rows.find((r) => r.ownerId === scope.ownerId);
    if (ownerRow) return ownerRow;
  }
  if (scope.projectId) {
    const projectRow = rows.find(
      (r) => r.projectId === scope.projectId && r.ownerId === null,
    );
    if (projectRow) return projectRow;
  }
  return rows.find((r) => r.projectId === null && r.ownerId === null);
}

/**
 * Pick the most-specific NON-EMPTY set of custom deductions, mirroring the
 * settings precedence: owner's custom rows if any, else project's, else org's.
 * Returns [] when none match.
 */
function pickCustomDeductions(
  rows: OrgStatementCustomDeduction[],
  scope: SettingsScope,
): StatementCustomDeduction[] {
  const map = (subset: OrgStatementCustomDeduction[]): StatementCustomDeduction[] =>
    subset.map((r) => ({
      label: r.label,
      mode: normalizeDeductionMode(r.mode),
      pct: r.pct === null ? null : Number(r.pct),
      fixedAmountMinor:
        r.fixedAmountMinor === null ? null : BigInt(r.fixedAmountMinor),
      sortOrder: r.sortOrder,
    }));

  if (scope.ownerId) {
    const ownerRows = rows.filter((r) => r.ownerId === scope.ownerId);
    if (ownerRows.length > 0) return map(ownerRows);
  }
  if (scope.projectId) {
    const projectRows = rows.filter(
      (r) => r.projectId === scope.projectId && r.ownerId === null,
    );
    if (projectRows.length > 0) return map(projectRows);
  }
  const orgRows = rows.filter((r) => r.projectId === null && r.ownerId === null);
  return map(orgRows);
}

/**
 * Org-scoped read (via requireOrgId). Resolves the effective settings for an
 * optional scope using the precedence above. Returns STATEMENT_SETTINGS_DEFAULTS
 * when no row matches / no DB — so callers never have to handle null. The no-arg
 * call resolves the ORG-DEFAULT row.
 */
export async function getStatementSettings(
  scope: SettingsScope = {},
): Promise<StatementSettings> {
  const db = getDb();
  if (!db) return { ...STATEMENT_SETTINGS_DEFAULTS };

  const orgId = await requireOrgId();

  // Load ALL of the org's settings + custom-deduction rows in one round-trip
  // each, then resolve precedence in memory. The row counts per org are tiny
  // (one org-default + a handful of project/owner overrides), so this is far
  // cheaper than three conditional queries.
  const [settingsRows, deductionRows] = await Promise.all([
    db
      .select()
      .from(orgStatementSettings)
      .where(eq(orgStatementSettings.organizationId, orgId)),
    db
      .select()
      .from(orgStatementCustomDeductions)
      .where(
        and(
          eq(orgStatementCustomDeductions.organizationId, orgId),
          eq(orgStatementCustomDeductions.active, true),
        ),
      )
      .orderBy(asc(orgStatementCustomDeductions.sortOrder)),
  ]);

  const customDeductions = pickCustomDeductions(deductionRows, scope);

  const row = pickSettingsRow(settingsRows, scope);
  if (!row) {
    return { ...STATEMENT_SETTINGS_DEFAULTS, customDeductions };
  }

  return { ...rowToSettings(row), customDeductions };
}

/**
 * Org-scoped read of the per-scope OVERRIDE rows (project- or owner-scoped) for
 * the mgmt editor — i.e. every settings row EXCEPT the org-default (both scope
 * cols NULL). Returns the raw rows so the editor can show + mutate exactly what
 * exists. The org-default is read separately via getStatementSettings().
 */
export async function listStatementSettingsOverrides(): Promise<
  OrgStatementSettings[]
> {
  const db = getDb();
  if (!db) return [];

  const orgId = await requireOrgId();
  return db
    .select()
    .from(orgStatementSettings)
    .where(
      and(
        eq(orgStatementSettings.organizationId, orgId),
        or(
          isNotNull(orgStatementSettings.projectId),
          isNotNull(orgStatementSettings.ownerId),
        ),
      ),
    )
    .orderBy(asc(orgStatementSettings.updatedAt));
}

/**
 * Org-scoped read of ALL custom-deduction rows (every scope), for the mgmt
 * editor's list/manage section. Includes inactive rows. Unlike
 * listStatementCustomDeductions(scope) (which lists rows at one exact scope),
 * this returns the whole org set so the editor can render + mutate each row.
 */
export async function listAllStatementCustomDeductions(): Promise<
  OrgStatementCustomDeduction[]
> {
  const db = getDb();
  if (!db) return [];

  const orgId = await requireOrgId();
  return db
    .select()
    .from(orgStatementCustomDeductions)
    .where(eq(orgStatementCustomDeductions.organizationId, orgId))
    .orderBy(
      asc(orgStatementCustomDeductions.sortOrder),
      asc(orgStatementCustomDeductions.createdAt),
    );
}

/**
 * Org-scoped read of the raw custom-deduction rows for a scope (mgmt UI). Unlike
 * getStatementSettings (which resolves the most-specific NON-EMPTY set), this
 * lists the rows authored AT EXACTLY the given scope so the editor shows what it
 * will mutate. No scope → the org-default rows. Includes inactive rows.
 */
export async function listStatementCustomDeductions(
  scope: SettingsScope = {},
): Promise<OrgStatementCustomDeduction[]> {
  const db = getDb();
  if (!db) return [];

  const orgId = await requireOrgId();
  const projectId = scope.projectId ?? null;
  const ownerId = scope.ownerId ?? null;

  return db
    .select()
    .from(orgStatementCustomDeductions)
    .where(
      and(
        eq(orgStatementCustomDeductions.organizationId, orgId),
        ownerId === null
          ? isNull(orgStatementCustomDeductions.ownerId)
          : eq(orgStatementCustomDeductions.ownerId, ownerId),
        projectId === null
          ? isNull(orgStatementCustomDeductions.projectId)
          : eq(orgStatementCustomDeductions.projectId, projectId),
      ),
    )
    .orderBy(asc(orgStatementCustomDeductions.sortOrder));
}
