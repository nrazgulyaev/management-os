/**
 * Phase 2.4 dev-02 — contract-redline-summariser agent (stub).
 *
 * Given two contract document versions, returns a structured diff
 * summary: which clauses moved, which numbers changed, severity of
 * each change. Renders in the contract Activity tab so staff can
 * approve a counter without reading the full doc.
 */

export interface ContractRedlineInput {
  organizationId: string;
  contractId: string;
  prevVersion: number;
  nextVersion: number;
}

export interface ContractRedlineDiff {
  clauseKey: string;
  kind: "added" | "removed" | "changed";
  severity: "info" | "warn" | "p1";
  summary: string;
}

export interface ContractRedlineOutput {
  diffs: ContractRedlineDiff[];
}

export async function summarise(_input: ContractRedlineInput): Promise<ContractRedlineOutput> {
  return { diffs: [] };
}

export const CONTRACT_REDLINE_SUMMARISER_AGENT = {
  agentCode: "contract-redline-summariser",
  description: "Structured diff between two contract versions; rendered in activity tab.",
} as const;
