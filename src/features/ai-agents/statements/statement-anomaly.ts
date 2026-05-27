/**
 * Phase 2.2 mgmt-02 — statement-anomaly agent (stub).
 *
 * Runs after each prepare. Walks the new statement's lines and
 * flags anomalies that surface to the Director on approval. Kinds:
 *
 *   spike            line >2× the trailing-12 baseline
 *   missing          expected line for the period is absent
 *   sign_flip        revenue line came out negative (or vice-versa)
 *   share_mismatch   line allocation pct ≠ ownership shares
 *
 * Output rows land in `statement_anomalies` (new schema). The
 * approve modal blocks until each anomaly is acknowledged.
 */

export interface StatementAnomalyInput {
  organizationId: string;
  statementId: string;
}

export type AnomalyKind = "spike" | "missing" | "sign_flip" | "share_mismatch";

export interface StatementAnomalyRow {
  statementId: string;
  kind: AnomalyKind;
  severity: "info" | "warn" | "danger";
  /** Free-form payload describing the anomaly (e.g. the line ref). */
  payload: Record<string, unknown>;
}

export interface StatementAnomalyOutput {
  flags: StatementAnomalyRow[];
}

export async function run(_input: StatementAnomalyInput): Promise<StatementAnomalyOutput> {
  return { flags: [] };
}

export const STATEMENT_ANOMALY_AGENT = {
  agentCode: "statement-anomaly",
  description: "Runs after statement-preparer; emits anomaly flags for Director review.",
} as const;
