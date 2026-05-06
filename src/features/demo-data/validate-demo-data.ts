/**
 * Prompt 112 — Demo-data validator.  Reads against the live DB (when
 * configured) to verify the row-count floors + scans owner / public
 * projections for banned tokens.
 *
 * Pure shape — the actual DB reads are wired up by the CLI script
 * `scripts/validate-demo-data.ts`, which imports `runValidation`.
 */

import {
  BANNED_PROJECTION_TOKENS,
  DEMO_OPTIONAL_TABLES,
  PII_PATTERNS,
} from "./constants";
import { expectedMinCounts } from "./seed-summary";

export type CheckSeverity = "PASS" | "WARN" | "FAIL";

export interface ValidationCheck {
  module: string;
  table: string;
  expected: number;
  actual: number;
  ok: boolean;
  /** P116A — tri-state severity ("WARN" for optional tables that fall short). */
  severity: CheckSeverity;
  note?: string;
}

export interface ProjectionScanFinding {
  source: string;
  field: string;
  banned: string;
  sample: string;
}

export interface ValidationReport {
  checks: ValidationCheck[];
  projectionFindings: ProjectionScanFinding[];
  ok: boolean;
  /** 0–100 readiness score derived from per-check pass/warn/fail. */
  score: number;
}

export type CountFn = (table: string) => Promise<number>;
export type ListFn<T> = (table: string) => Promise<T[]>;

export interface RunValidationOpts {
  countRows: CountFn;
  /** Fetch the rows the validator should scan for banned tokens.
   *  Each entry is a (label, columns, rows) triple — the validator
   *  walks each column and reports any banned-token occurrence. */
  fetchProjections: () => Promise<
    Array<{
      label: string;
      rows: Array<Record<string, unknown>>;
      columns: string[];
    }>
  >;
}

export async function runValidation(
  opts: RunValidationOpts,
): Promise<ValidationReport> {
  const expected = expectedMinCounts();
  const checks: ValidationCheck[] = [];
  for (const [table, min] of Object.entries(expected)) {
    let actual = 0;
    let note: string | undefined;
    try {
      actual = await opts.countRows(table);
    } catch (err) {
      note = err instanceof Error ? err.message : String(err);
    }
    const passes = actual >= min;
    const optional = DEMO_OPTIONAL_TABLES.has(table);
    const severity: CheckSeverity = passes
      ? "PASS"
      : optional
        ? "WARN"
        : "FAIL";
    checks.push({
      module: table,
      table,
      expected: min,
      actual,
      ok: severity !== "FAIL",
      severity,
      note,
    });
  }

  const projectionFindings: ProjectionScanFinding[] = [];
  const projections = await opts.fetchProjections();
  for (const p of projections) {
    for (const row of p.rows) {
      for (const col of p.columns) {
        const v = row[col];
        if (v === null || v === undefined) continue;
        if (typeof v !== "string") continue;
        for (const banned of BANNED_PROJECTION_TOKENS) {
          if (v.includes(banned)) {
            projectionFindings.push({
              source: p.label,
              field: col,
              banned,
              sample: v.slice(0, 120),
            });
          }
        }
        if (PII_PATTERNS.realLookingEmail.test(v)) {
          projectionFindings.push({
            source: p.label,
            field: col,
            banned: "real-looking email",
            sample: v.slice(0, 120),
          });
        }
        if (PII_PATTERNS.realLookingPhone.test(v)) {
          projectionFindings.push({
            source: p.label,
            field: col,
            banned: "real-looking phone",
            sample: v.slice(0, 120),
          });
        }
      }
    }
  }

  const allChecksOk = checks.every((c) => c.ok);
  const noFindings = projectionFindings.length === 0;
  // P116A — score: PASS = 1.0, WARN = 0.5, FAIL = 0.0; minus a 5-point
  // penalty per projection finding.  Clamp to [0, 100].
  const passWeight =
    checks.length === 0
      ? 0
      : checks.reduce((sum, c) => {
          if (c.severity === "PASS") return sum + 1;
          if (c.severity === "WARN") return sum + 0.5;
          return sum;
        }, 0) / checks.length;
  const rawScore = Math.round(passWeight * 100 - projectionFindings.length * 5);
  const score = Math.max(0, Math.min(100, rawScore));
  return {
    checks,
    projectionFindings,
    ok: allChecksOk && noFindings,
    score,
  };
}

export function formatValidationReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push("Demo-data validation report");
  lines.push("===========================");
  lines.push("");
  lines.push("Row count checks:");
  for (const c of report.checks) {
    const tick =
      c.severity === "PASS" ? "✓" : c.severity === "WARN" ? "!" : "✗";
    const note = c.note ? `  (${c.note})` : "";
    lines.push(
      `  ${tick} ${c.table.padEnd(38)} expected ≥ ${String(c.expected).padStart(3)}, got ${String(c.actual).padStart(3)}  [${c.severity}]${note}`,
    );
  }
  lines.push("");
  if (report.projectionFindings.length === 0) {
    lines.push("Projection scan: no banned tokens or real-looking PII found.");
  } else {
    lines.push("Projection scan findings:");
    for (const f of report.projectionFindings) {
      lines.push(
        `  ✗ ${f.source} · ${f.field} contains "${f.banned}" — sample: ${f.sample}`,
      );
    }
  }
  lines.push("");
  lines.push(`Demo readiness score: ${report.score} / 100`);
  lines.push(`Overall: ${report.ok ? "OK" : "FAILED"}`);
  return lines.join("\n");
}
