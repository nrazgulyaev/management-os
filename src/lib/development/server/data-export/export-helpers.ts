/**
 * Stage 5.J.4 — Pure data export format helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 */

export type ExportFormat = "json" | "csv" | "sql";

export interface ExportTable {
  tableName: string;
  rows: Array<Record<string, unknown>>;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((acc, r) => {
      for (const k of Object.keys(r)) acc.add(k);
      return acc;
    }, new Set<string>()),
  );
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const headerLine = headers.join(",");
  const bodyLines = rows.map((r) => headers.map((h) => escape(r[h])).join(","));
  return [headerLine, ...bodyLines].join("\n");
}

export function tablesToJson(tables: ExportTable[]): string {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const t of tables) out[t.tableName] = t.rows;
  return JSON.stringify(out, null, 2);
}

export function tablesToSql(tables: ExportTable[]): string {
  const out: string[] = ["BEGIN;"];
  for (const t of tables) {
    if (t.rows.length === 0) continue;
    const headers = Array.from(
      t.rows.reduce((acc, r) => {
        for (const k of Object.keys(r)) acc.add(k);
        return acc;
      }, new Set<string>()),
    );
    for (const row of t.rows) {
      const values = headers.map((h) => {
        const v = row[h];
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "number") return String(v);
        if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
        const s = typeof v === "string" ? v : JSON.stringify(v);
        return `'${s.replace(/'/g, "''")}'`;
      });
      out.push(
        `INSERT INTO ${t.tableName} (${headers.join(", ")}) VALUES (${values.join(", ")});`,
      );
    }
  }
  out.push("COMMIT;");
  return out.join("\n");
}

export function formatExport(
  tables: ExportTable[],
  format: ExportFormat,
): { content: string; mimeType: string; extension: string } {
  if (format === "csv") {
    // For CSV with multiple tables, concatenate with a header row.
    const sections = tables.map(
      (t) => `# ${t.tableName}\n${rowsToCsv(t.rows)}`,
    );
    return {
      content: sections.join("\n\n"),
      mimeType: "text/csv",
      extension: "csv",
    };
  }
  if (format === "sql") {
    return {
      content: tablesToSql(tables),
      mimeType: "application/sql",
      extension: "sql",
    };
  }
  return {
    content: tablesToJson(tables),
    mimeType: "application/json",
    extension: "json",
  };
}
