/**
 * Phase 2.2 dev-04 — quote-parser agent (stub).
 *
 * Reads a vendor quote PDF and extracts line totals, lead time,
 * warranty, payment terms. Wired against the existing Claude
 * infra (Vault-backed model router) in 2.2 data.
 */

export interface QuoteParserInput {
  organizationId: string;
  pdfUrl: string;
  rfqId: string;
}

export interface QuoteParsedLine {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
}

export interface QuoteParsedOutput {
  vendorName: string | null;
  totalUsdMinor: bigint;
  leadTimeDays: number;
  warrantyMonths: number;
  paymentTerms: string | null;
  lines: QuoteParsedLine[];
  /** 0..100. */
  confidence: number;
}

export async function parse(_input: QuoteParserInput): Promise<QuoteParsedOutput> {
  return {
    vendorName: null,
    totalUsdMinor: 0n,
    leadTimeDays: 0,
    warrantyMonths: 0,
    paymentTerms: null,
    lines: [],
    confidence: 0,
  };
}

export const QUOTE_PARSER_AGENT = {
  agentCode: "quote-parser",
  description: "LLM-extracts line totals + lead time + warranty from vendor PDF quotes.",
} as const;
