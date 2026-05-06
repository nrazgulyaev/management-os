/**
 * Stage 5.A.2 — Pure CSV import/export helpers for BOQ.
 *
 * No I/O, no DB, no `import "server-only"`. Runtime testable.
 *
 * **Why CSV not XLSX**: spec asks for "Excel import/export" with zero new
 * dependencies as a goal. CSV satisfies the round-trip requirement
 * (Excel/Sheets/Numbers all read it natively) without bundling
 * a 1 MB+ XLSX library for v1. Swap to `xlsx` (SheetJS) in a later stage
 * if true binary-format support is needed — the parse/serialize functions
 * have a narrow surface and only two callers.
 *
 * Format:
 *   section_code, section_name, item_code, description, quantity, uom, unit_rate_minor, currency
 *   "1",           "Earthworks",  "",        "",          "",       "",  "",              ""
 *   "1.1",         "Excavation",  "",        "",          "",       "",  "",              ""
 *   "1.1",         "",            "001",     "Site clear", 1500,    "m²", 8500,          "IDR"
 *
 * Section rows have empty item_code; item rows have empty section_name.
 */

export interface CsvBoqRow {
  sectionCode: string;
  sectionName: string;
  itemCode: string;
  description: string;
  quantity: string;
  uom: string;
  unitRateMinor: string;
  currency: string;
}

export interface CsvBoqSection {
  sectionCode: string;
  sectionName: string;
}

export interface CsvBoqItem {
  sectionCode: string;
  itemCode: string;
  description: string;
  quantity: number;
  uom: string;
  unitRateMinor: bigint;
  currency: string;
}

export interface ParsedCsvBoq {
  sections: CsvBoqSection[];
  items: CsvBoqItem[];
}

const HEADER = [
  "section_code",
  "section_name",
  "item_code",
  "description",
  "quantity",
  "uom",
  "unit_rate_minor",
  "currency",
] as const;

/** Split a CSV line respecting quoted fields with commas inside. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"') {
      inQuote = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function parseBoqCsv(csv: string): ParsedCsvBoq {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { sections: [], items: [] };
  const headerLine = lines[0];
  const headerCells = splitCsvLine(headerLine).map((c) => c.trim());
  for (let i = 0; i < HEADER.length; i++) {
    if (headerCells[i] !== HEADER[i]) {
      throw new Error(
        `parseBoqCsv: header column ${i} expected '${HEADER[i]}', got '${headerCells[i]}'`,
      );
    }
  }
  const sections: CsvBoqSection[] = [];
  const sectionCodesSeen = new Set<string>();
  const items: CsvBoqItem[] = [];
  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cells = splitCsvLine(lines[lineIdx]).map((c) => c.trim());
    const [sc, sn, ic, desc, qty, uom, rate, cur] = cells;
    if (!sc) {
      throw new Error(`parseBoqCsv line ${lineIdx + 1}: section_code required`);
    }
    if (!ic) {
      // Section row.
      if (!sn) {
        throw new Error(
          `parseBoqCsv line ${lineIdx + 1}: section row needs section_name`,
        );
      }
      if (!sectionCodesSeen.has(sc)) {
        sections.push({ sectionCode: sc, sectionName: sn });
        sectionCodesSeen.add(sc);
      }
    } else {
      // Item row.
      const qtyNum = Number(qty);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        throw new Error(
          `parseBoqCsv line ${lineIdx + 1}: quantity must be > 0, got '${qty}'`,
        );
      }
      let rateBig: bigint;
      try {
        rateBig = BigInt(rate);
      } catch {
        throw new Error(
          `parseBoqCsv line ${lineIdx + 1}: unit_rate_minor must be integer, got '${rate}'`,
        );
      }
      if (rateBig < 0n) {
        throw new Error(
          `parseBoqCsv line ${lineIdx + 1}: unit_rate_minor must be >= 0`,
        );
      }
      // Auto-create the section if it wasn't declared explicitly.
      if (!sectionCodesSeen.has(sc)) {
        sections.push({ sectionCode: sc, sectionName: sc });
        sectionCodesSeen.add(sc);
      }
      items.push({
        sectionCode: sc,
        itemCode: ic,
        description: desc ?? "",
        quantity: qtyNum,
        uom: uom ?? "",
        unitRateMinor: rateBig,
        currency: cur || "IDR",
      });
    }
  }
  return { sections, items };
}

export function serializeBoqCsv(input: {
  sections: CsvBoqSection[];
  items: Array<{
    sectionCode: string;
    itemCode: string;
    description: string;
    quantity: number;
    uom: string;
    unitRateMinor: bigint;
    currency: string;
  }>;
}): string {
  const lines: string[] = [HEADER.join(",")];
  for (const s of input.sections) {
    lines.push(
      [
        escapeCsv(s.sectionCode),
        escapeCsv(s.sectionName),
        "",
        "",
        "",
        "",
        "",
        "",
      ].join(","),
    );
  }
  for (const it of input.items) {
    lines.push(
      [
        escapeCsv(it.sectionCode),
        "",
        escapeCsv(it.itemCode),
        escapeCsv(it.description),
        String(it.quantity),
        escapeCsv(it.uom),
        it.unitRateMinor.toString(),
        escapeCsv(it.currency),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}
