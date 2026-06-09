import "server-only";

/**
 * DONE-DEAD-BUTTONS — shared CSV serialisation for the management cabinet
 * export routes (bookings, daily brief, operations brief).
 *
 * One implementation of the escaping rules so each route stops hand-rolling
 * its own `csvCell`. Mirrors the marketing-leads export route conventions:
 *   - quote when the value contains a delimiter / quote / newline
 *   - double embedded quotes
 *   - defang spreadsheet formula injection by prefixing risky leading chars
 */

export function csvCell(value: string | number | bigint | null | undefined): string {
  let v = value == null ? "" : String(value);
  // Defang formula injection (=, +, -, @ as a leading char).
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Build a CSV body (CRLF line endings) from a header row + data rows. */
export function toCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | bigint | null | undefined>>,
): string {
  const lines: string[] = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(r.map(csvCell).join(","));
  }
  return lines.join("\r\n");
}
