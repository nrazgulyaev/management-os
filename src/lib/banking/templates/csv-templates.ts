/**
 * Stage 6.P3.E — Predefined CSV column mappings for known bank
 * exports.
 *
 * The import wizard auto-applies a template when the operator picks
 * "Mandiri" / "BCA" / etc. from the bank picker; the operator can
 * still override any column on the review screen.
 *
 * Templates live in code (not DB) because they're tied to specific
 * export schema versions — when a bank changes their CSV columns we
 * ship a new template ID alongside the old one.
 */

import type { CSVColumnMapping, CSVParseOptions } from "../parsers/csv-parser";

export interface CsvTemplate {
  /** Stable identifier — referenced from the import wizard. */
  id: string;
  /** Bank provider this template applies to. */
  provider: "mandiri" | "bca" | "wise" | "revolut" | "manual" | "other";
  label: string;
  description?: string;
  defaultMapping: CSVColumnMapping;
  /** Format hints layered on top of dialect auto-detection. */
  defaultOptions?: CSVParseOptions;
}

export const CSV_TEMPLATES: readonly CsvTemplate[] = [
  {
    id: "mandiri_internet_banking_v1",
    provider: "mandiri",
    label: "Bank Mandiri — Internet Banking CSV export",
    description:
      "Default columns: Tanggal, Keterangan, Debit, Kredit, Saldo. Indonesian Rupiah, dd/mm/yyyy dates, European amount format.",
    defaultMapping: {
      date: "Tanggal",
      debit: "Debit",
      credit: "Kredit",
      description: "Keterangan",
      balance: "Saldo",
    },
    defaultOptions: {
      delimiter: ",",
      hasHeader: true,
      dateFormat: "dmy_slash",
      amountFormat: "european",
      amountSign: "separate_columns",
      defaultCurrency: "IDR",
      source: "mandiri",
    },
  },
  {
    id: "bca_klikbca_bisnis_v1",
    provider: "bca",
    label: "BCA — KlikBCA Bisnis CSV export",
    description:
      "Default columns: Tanggal, Keterangan, Cabang, Jumlah, Saldo. Optional separate D/C indicator.",
    defaultMapping: {
      date: "Tanggal",
      amount: "Jumlah",
      description: "Keterangan",
      balance: "Saldo",
    },
    defaultOptions: {
      delimiter: ",",
      hasHeader: true,
      dateFormat: "dmy_slash",
      amountFormat: "european",
      amountSign: "mixed",
      defaultCurrency: "IDR",
      source: "bca",
    },
  },
  {
    id: "generic_english_v1",
    provider: "other",
    label: "Generic English bank CSV (Date, Amount, Description)",
    defaultMapping: {
      date: "Date",
      amount: "Amount",
      description: "Description",
    },
    defaultOptions: {
      delimiter: ",",
      hasHeader: true,
      dateFormat: "iso",
      amountFormat: "standard",
      amountSign: "mixed",
      defaultCurrency: "USD",
      source: "generic",
    },
  },
];

export function getCsvTemplate(id: string): CsvTemplate | undefined {
  return CSV_TEMPLATES.find((t) => t.id === id);
}

export function listCsvTemplatesForProvider(
  provider: CsvTemplate["provider"],
): CsvTemplate[] {
  return CSV_TEMPLATES.filter((t) => t.provider === provider);
}
