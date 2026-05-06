/**
 * Prompt 113 — Pretty-printers for the env readiness report.  Used by
 * the CLI scripts and the deployment dashboard.
 */

import type { EnvReadinessReport, EnvReportItem } from "./validation";

const STATUS_GLYPHS: Record<EnvReportItem["status"], string> = {
  ok: "✓",
  missing: "?",
  warning: "!",
  fatal: "✗",
  not_required: "·",
};

export function formatEnvReport(report: EnvReadinessReport): string {
  const lines: string[] = [];
  lines.push(`Environment readiness — mode: ${report.mode}`);
  lines.push(
    `${report.okCount} ok · ${report.warningCount} warning · ${report.fatalCount} fatal`,
  );
  lines.push("");
  // Group by category for readability.
  const byCat = new Map<string, EnvReportItem[]>();
  for (const item of report.items) {
    const arr = byCat.get(item.category) ?? [];
    arr.push(item);
    byCat.set(item.category, arr);
  }
  for (const [cat, items] of byCat) {
    lines.push(`[${cat}]`);
    for (const i of items) {
      const glyph = STATUS_GLYPHS[i.status];
      const value = i.redactedValue ? ` (${i.redactedValue})` : "";
      lines.push(`  ${glyph} ${i.key.padEnd(36)} ${i.status.padEnd(12)} ${i.message}${value}`);
    }
    lines.push("");
  }
  lines.push(`Overall: ${report.ok ? "OK" : "FAILED"}`);
  return lines.join("\n");
}

export function summariseEnvReport(report: EnvReadinessReport): {
  total: number;
  byStatus: Record<EnvReportItem["status"], number>;
} {
  const byStatus: Record<EnvReportItem["status"], number> = {
    ok: 0,
    missing: 0,
    warning: 0,
    fatal: 0,
    not_required: 0,
  };
  for (const i of report.items) byStatus[i.status] += 1;
  return { total: report.items.length, byStatus };
}
