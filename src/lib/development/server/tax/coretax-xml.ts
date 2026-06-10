import "server-only";

import type { EfakturExportData, EfakturLine } from "./efaktur-export";

/**
 * ID-TAX — official-format Coretax e-Faktur XML builder (faktur pajak
 * keluaran / output tax invoices).
 *
 * Shape verified against DJP's own artifacts (downloaded from pajak.go.id,
 * 2026-06-10 — see docs/CORETAX-EFAKTUR-FORMAT.md for sources, confidence
 * and the full field-mapping table):
 *   * official sample XML "Sample Faktur PK Template v.1.4.xml"
 *     (root TaxInvoiceBulk, element order reproduced exactly);
 *   * official Excel template v1.6.1 (Keterangan sheet = per-field
 *     mandatory/validation rules, REF sheets = enumerations);
 *   * "Mekanisme Upload Faktur via XML" (2025-01) — upload flow.
 *
 * Honesty rules implemented here:
 *   * nomor faktur: the template has NO invoice-number field — numbers are
 *     DJP-issued after upload. Nothing is invented.
 *   * seller NPWP (TIN / SellerIDTKU): not stored in our schema — emitted
 *     EMPTY with a review note; the operator fills it before upload.
 *   * IDR only: Coretax amounts are rupiah. Non-IDR lines are EXCLUDED and
 *     counted (header comment + UI); they remain in the draft CSV.
 *   * input (Masukan) lines are NOT exported — the Coretax import menu is
 *     Faktur Keluaran; input credits are prepopulated inside Coretax.
 *   * VAT arithmetic: TrxCode 04 per PMK 131/2024 — OtherTaxBase =
 *     round2(DPP × 11/12), VAT = round2(OtherTaxBase × 12%). The template
 *     REQUIRES PPN = Tarif × DPP Nilai Lain for code 04, so this is
 *     statutory arithmetic on the recorded DPP, not fabricated data. The
 *     recorded tax_amount_minor is USD-normalised (declaration convention)
 *     and is exported only in the draft CSV.
 */

export interface CoretaxXmlResult {
  xml: string;
  /** TaxInvoice elements emitted (IDR output lines). */
  includedLineCount: number;
  /** Output lines excluded because they are not IDR-denominated. */
  excludedNonIdrCount: number;
  /** Review notes embedded in the file header comment (English). */
  reviewNotes: string[];
}

/** Current statutory regime (PMK 131/2024): kode 04, 12% × (11/12 DPP). */
const TRX_CODE_DEFAULT = "04";
const VAT_RATE_PERCENT = 12n;
const BUYER_TIN_NON_TIN = "0000000000000000";
const HEAD_OFFICE_SUFFIX = "000000";
/** REF-General UM.0033 = "Lainnya" (other) — unit is not in our data. */
const UNIT_DEFAULT = "UM.0033";
/** REF-KodeNegara: Indonesia = IDN (NOT "IND", which is India). */
const COUNTRY_IDN = "IDN";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** XML comments may not contain "--"; defang without losing the note. */
function commentSafe(value: string): string {
  return value.replace(/--/g, "- -");
}

/**
 * round(value × num / den) in bigint, half away from zero — the template's
 * "pembulatan komersial" (commercial rounding) on minor units.
 */
function mulDivRound(value: bigint, num: bigint, den: bigint): bigint {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rounded = (abs * num + den / 2n) / den;
  return negative ? -rounded : rounded;
}

/**
 * IDR minor units (stored ×100 per repo convention — see
 * formatCurrencyMinor in investor-constants.ts) → decimal string with at
 * most 2 decimals (template rule), trailing zeros trimmed.
 */
export function idrMinorToDecimal(minor: bigint): string {
  const sign = minor < 0n ? "-" : "";
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  if (frac === 0n) return `${sign}${whole}`;
  const fracStr = frac.toString().padStart(2, "0").replace(/0$/, "");
  return `${sign}${whole}.${fracStr}`;
}

interface BuyerIdentity {
  buyerTin: string;
  buyerDocument: "TIN" | "Other ID";
  /** "-" when TIN (template rule); empty when we hold no document number. */
  buyerDocumentNumber: string;
  buyerIdtku: string;
  /** Per-line review note when the stored tax_id was unusable. */
  note: string | null;
}

/**
 * Vendor-register tax_id → 16-digit Coretax NPWP:
 *   * 16 digits → verbatim;
 *   * 15 digits (legacy NPWP) → "0" + digits (official PMK 112/2022
 *     conversion — a format rule, not invented data);
 *   * anything else → non-TIN path (0000000000000000 / Other ID) with a
 *     review note carrying the verbatim stored value.
 */
function buyerIdentity(line: EfakturLine): BuyerIdentity {
  const raw = line.counterpartyNpwp?.trim() ?? "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 16 && raw !== "") {
    return {
      buyerTin: digits,
      buyerDocument: "TIN",
      buyerDocumentNumber: "-",
      buyerIdtku: digits + HEAD_OFFICE_SUFFIX,
      note: null,
    };
  }
  if (digits.length === 15 && raw !== "") {
    const tin = `0${digits}`;
    return {
      buyerTin: tin,
      buyerDocument: "TIN",
      buyerDocumentNumber: "-",
      buyerIdtku: tin + HEAD_OFFICE_SUFFIX,
      note: `txn ${line.transactionCode}: legacy 15-digit NPWP "${raw}" zero-prefixed to 16 digits per PMK 112/2022.`,
    };
  }
  return {
    buyerTin: BUYER_TIN_NON_TIN,
    buyerDocument: "Other ID",
    buyerDocumentNumber: "",
    buyerIdtku: HEAD_OFFICE_SUFFIX,
    note:
      raw === ""
        ? `txn ${line.transactionCode}: no buyer NPWP in the vendor register — exported as non-TIN (${BUYER_TIN_NON_TIN} / Other ID); fill the buyer document number before upload.`
        : `txn ${line.transactionCode}: stored tax_id "${raw}" is not a 15/16-digit NPWP — exported as non-TIN; fix the vendor register or fill manually.`,
  };
}

function el(name: string, value: string, indent: string): string {
  if (value === "") return `${indent}<${name}/>`;
  return `${indent}<${name}>${xmlEscape(value)}</${name}>`;
}

export function buildCoretaxFakturKeluaranXml(
  data: EfakturExportData,
): CoretaxXmlResult {
  const output = data.blocks.find((b) => b.direction === "output");
  const allLines = output?.lines ?? [];
  const idrLines = allLines.filter((l) => l.currency === "IDR");
  const excludedNonIdrCount = allLines.length - idrLines.length;

  const globalNotes: string[] = [
    "Seller NPWP is not stored in this system: TIN and SellerIDTKU are EMPTY — fill the 16-digit NPWP (TIN) and NPWP+000000 (SellerIDTKU, head office) before upload.",
    `TrxCode defaults to ${TRX_CODE_DEFAULT} (DPP Nilai Lain, PMK 131/2024 non-luxury regime) — re-code luxury/PPnBM supplies to 01 and fill STLG manually.`,
    "Goods/services flag (Opt) defaults to A (goods) and unit to UM.0033 (other) — not recorded in our data; review per line.",
    "Buyer IDTKU uses the head-office suffix 000000 — review if a buyer transacts via a branch.",
    "OtherTaxBase = round2(DPP x 11/12) and VAT = round2(OtherTaxBase x 12%) per the template rule for TrxCode 04 (PPN must equal Tarif x DPP Nilai Lain). DPP is the recorded IDR amount.",
    "Nomor faktur: not part of the import template — issued by DJP/Coretax after upload and signature. Nothing here is a tax invoice number.",
    `Non-IDR output lines excluded from this file (Coretax is IDR-only): ${excludedNonIdrCount}. They remain in the draft CSV export.`,
  ];
  const lineNotes: string[] = [];

  const invoiceXml: string[] = [];
  for (const line of idrLines) {
    const buyer = buyerIdentity(line);
    if (buyer.note) lineNotes.push(buyer.note);
    if (line.isTaxIncluded === true) {
      lineNotes.push(
        `txn ${line.transactionCode}: recorded amount is tax-INCLUSIVE (gross) — DPP exported as recorded, same caveat as the declaration aggregates; review before upload.`,
      );
    }
    if (line.amountOriginalMinor < 0n) {
      lineNotes.push(
        `txn ${line.transactionCode}: negative amount — credit notes/returns belong in the separate Retur template; Coretax may reject this row.`,
      );
    }

    const dppMinor = line.amountOriginalMinor;
    const otherTaxBaseMinor = mulDivRound(dppMinor, 11n, 12n);
    const vatMinor = mulDivRound(otherTaxBaseMinor, VAT_RATE_PERCENT, 100n);

    const name =
      line.description.trim() ||
      line.taxTypeName ||
      `Transaction ${line.transactionCode}`;

    invoiceXml.push(
      [
        "\t\t<TaxInvoice>",
        el("TaxInvoiceDate", line.transactionDate, "\t\t\t"),
        el("TaxInvoiceOpt", "Normal", "\t\t\t"),
        el("TrxCode", TRX_CODE_DEFAULT, "\t\t\t"),
        el("AddInfo", "", "\t\t\t"),
        el("CustomDoc", "", "\t\t\t"),
        el("CustomDocMonthYear", "", "\t\t\t"),
        el("RefDesc", line.transactionCode, "\t\t\t"),
        el("FacilityStamp", "", "\t\t\t"),
        el("SellerIDTKU", "", "\t\t\t"),
        el("BuyerTin", buyer.buyerTin, "\t\t\t"),
        el("BuyerDocument", buyer.buyerDocument, "\t\t\t"),
        el("BuyerCountry", COUNTRY_IDN, "\t\t\t"),
        el("BuyerDocumentNumber", buyer.buyerDocumentNumber, "\t\t\t"),
        el("BuyerName", line.counterpartyName, "\t\t\t"),
        // "BuyerAdress" [sic] — misspelled in the official schema.
        el("BuyerAdress", line.counterpartyAddress ?? "", "\t\t\t"),
        el("BuyerEmail", "", "\t\t\t"),
        el("BuyerIDTKU", buyer.buyerIdtku, "\t\t\t"),
        "\t\t\t<ListOfGoodService>",
        "\t\t\t\t<GoodService>",
        el("Opt", "A", "\t\t\t\t\t"),
        el("Code", "000000", "\t\t\t\t\t"),
        el("Name", name, "\t\t\t\t\t"),
        el("Unit", UNIT_DEFAULT, "\t\t\t\t\t"),
        // We record totals, not line items: Qty 1 x Price = DPP, discount 0,
        // so the template identity DPP = Price*Qty - Discount holds.
        el("Price", idrMinorToDecimal(dppMinor), "\t\t\t\t\t"),
        el("Qty", "1", "\t\t\t\t\t"),
        el("TotalDiscount", "0", "\t\t\t\t\t"),
        el("TaxBase", idrMinorToDecimal(dppMinor), "\t\t\t\t\t"),
        el("OtherTaxBase", idrMinorToDecimal(otherTaxBaseMinor), "\t\t\t\t\t"),
        el("VATRate", VAT_RATE_PERCENT.toString(), "\t\t\t\t\t"),
        el("VAT", idrMinorToDecimal(vatMinor), "\t\t\t\t\t"),
        el("STLGRate", "0", "\t\t\t\t\t"),
        el("STLG", "0", "\t\t\t\t\t"),
        "\t\t\t\t</GoodService>",
        "\t\t\t</ListOfGoodService>",
        "\t\t</TaxInvoice>",
      ].join("\n"),
    );
  }

  const reviewNotes = [...globalNotes, ...lineNotes];
  const comment = [
    "<!--",
    `  Coretax e-Faktur import - faktur pajak keluaran (output tax invoices).`,
    `  Period ${data.periodStart} -> ${data.periodEnd} | invoices: ${idrLines.length} (IDR only) | non-IDR output lines excluded: ${excludedNonIdrCount}.`,
    `  Built per DJP TaxInvoiceBulk template (official sample v1.4 + Excel template v1.6.1) - docs/CORETAX-EFAKTUR-FORMAT.md.`,
    "  REVIEW BEFORE UPLOAD:",
    ...reviewNotes.map((n) => `  * ${commentSafe(n)}`),
    "-->",
  ].join("\n");

  const xml = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    comment,
    `<TaxInvoiceBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="TaxInvoice.xsd">`,
    // Seller NPWP is not stored — operator fills before upload (see notes).
    `\t<TIN/>`,
    `\t<ListOfTaxInvoice>`,
    ...invoiceXml,
    `\t</ListOfTaxInvoice>`,
    `</TaxInvoiceBulk>`,
    "",
  ].join("\n");

  return {
    xml,
    includedLineCount: idrLines.length,
    excludedNonIdrCount,
    reviewNotes,
  };
}
