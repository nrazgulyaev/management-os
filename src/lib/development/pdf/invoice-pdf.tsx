import * as React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  getInvoiceStrings,
  type InvoiceLanguage,
} from "./invoice-translations";

/**
 * Invoice PDF — React-PDF template.
 *
 * Mirrors the existing Owner Statement PDF pattern at
 * `features/finance/pdf/owner-statement-pdf.tsx`:
 *   - Pure tokens (no `cn`, no Tailwind).
 *   - All strings keyed off `getInvoiceStrings(language)`.
 *   - Multi-currency: primary currency on every monetary line, IDR
 *     equivalent rendered once under the grand total.
 *   - Tax breakdown computed from the `lineItems` rows; the template
 *     shows it explicitly so a buyer's tax advisor can check it.
 *
 * Caller responsibility: the render module loads all data from the DB,
 * shapes it into `InvoicePdfData`, and hands it to this template.
 */

const colors = {
  ink: "#0F1110",
  inkSecondary: "#4A4A46",
  inkTertiary: "#7A7670",
  line: "#E4DCCE",
  surface: "#FFFFFF",
  canvas: "#F8F5F0",
  accent: "#0E3B2E",
  accentWeak: "#DCE6DF",
  gold: "#B08A3E",
  goldWeak: "#F1E7D1",
  danger: "#A43E2F",
  warning: "#A06A1A",
  success: "#2E7D64",
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  // Top brand band
  brandBand: {
    backgroundColor: colors.accent,
    height: 6,
    marginBottom: 24,
  },
  // Header row: brand left, document type + invoice number right
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  brandLockup: {
    flexDirection: "column",
  },
  brandText: {
    fontSize: 22,
    letterSpacing: 4,
    color: colors.ink,
    fontFamily: "Times-Roman",
  },
  brandSubtext: {
    fontSize: 8,
    color: colors.inkTertiary,
    marginTop: 4,
    letterSpacing: 1.6,
  },
  documentTypeBlock: {
    alignItems: "flex-end",
  },
  documentTypeLabel: {
    fontSize: 18,
    fontFamily: "Times-Roman",
    color: colors.accent,
    letterSpacing: 2,
  },
  invoiceNumber: {
    fontSize: 11,
    color: colors.ink,
    marginTop: 6,
  },
  invoiceNumberLabel: {
    fontSize: 8,
    color: colors.inkTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },

  // Two-column issuer + recipient
  partyRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 24,
  },
  partyColumn: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.canvas,
    borderRadius: 4,
  },
  partyLabel: {
    fontSize: 8,
    color: colors.inkTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  partyName: {
    fontSize: 13,
    color: colors.ink,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  partyLine: {
    fontSize: 9,
    color: colors.inkSecondary,
    lineHeight: 1.4,
  },

  // Metadata strip
  metaRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
  },
  metaCell: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 7,
    color: colors.inkTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  metaValue: {
    fontSize: 11,
    color: colors.ink,
    marginTop: 4,
  },
  statusBadge: {
    fontSize: 9,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 3,
    alignSelf: "flex-start",
    marginTop: 4,
  },

  // Property block
  sectionHeader: {
    fontSize: 9,
    color: colors.inkTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
    marginTop: 4,
  },
  propertyBlock: {
    backgroundColor: colors.canvas,
    padding: 12,
    borderRadius: 4,
    marginBottom: 20,
  },
  propertyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  propertyLabel: {
    fontSize: 9,
    color: colors.inkTertiary,
    width: 110,
  },
  propertyValue: {
    fontSize: 10,
    color: colors.ink,
    flex: 1,
    textAlign: "right",
  },

  // Line items table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.accentWeak,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 3,
    marginBottom: 4,
  },
  th: {
    fontSize: 8,
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
  },
  thDescription: { flex: 3 },
  thRight: { flex: 1, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
  },
  td: {
    fontSize: 9,
    color: colors.ink,
  },
  tdDescription: { flex: 3 },
  tdRight: { flex: 1, textAlign: "right" },
  lineSubtitle: {
    fontSize: 8,
    color: colors.inkTertiary,
    marginTop: 2,
  },

  // Totals
  totalsBlock: {
    marginTop: 16,
    alignSelf: "flex-end",
    width: 280,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 10,
    color: colors.inkSecondary,
  },
  totalValue: {
    fontSize: 10,
    color: colors.ink,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.ink,
    borderTopStyle: "solid",
    marginTop: 6,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.ink,
  },
  grandTotalValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.accent,
  },
  fxLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  fxLabel: {
    fontSize: 9,
    color: colors.inkTertiary,
    fontStyle: "italic",
  },
  fxValue: {
    fontSize: 10,
    color: colors.inkSecondary,
    fontStyle: "italic",
  },
  fxNote: {
    fontSize: 7,
    color: colors.inkTertiary,
    fontStyle: "italic",
    marginTop: 6,
    textAlign: "right",
  },

  // Payment instructions
  paymentBlock: {
    marginTop: 32,
    padding: 12,
    backgroundColor: colors.goldWeak,
    borderRadius: 4,
  },
  paymentLine: {
    flexDirection: "row",
    paddingVertical: 2,
  },
  paymentLabel: {
    fontSize: 9,
    color: colors.inkTertiary,
    width: 110,
  },
  paymentValue: {
    fontSize: 10,
    color: colors.ink,
    flex: 1,
    fontFamily: "Helvetica",
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderTopStyle: "solid",
  },
  footerLeft: {
    fontSize: 7,
    color: colors.inkTertiary,
    flex: 3,
    lineHeight: 1.4,
  },
  footerRight: {
    fontSize: 7,
    color: colors.inkTertiary,
    flex: 1,
    textAlign: "right",
  },
});

const STATUS_TONE: Record<
  string,
  { backgroundColor: string; color: string; labelKey: keyof ReturnType<typeof getInvoiceStrings> }
> = {
  draft: { backgroundColor: colors.canvas, color: colors.inkSecondary, labelKey: "statusDraft" },
  sent: { backgroundColor: colors.accentWeak, color: colors.accent, labelKey: "statusSent" },
  viewed: { backgroundColor: colors.accentWeak, color: colors.accent, labelKey: "statusViewed" },
  paid: { backgroundColor: "#dce9e2", color: colors.success, labelKey: "statusPaid" },
  overdue: { backgroundColor: "#f0d9d2", color: colors.danger, labelKey: "statusOverdue" },
  void: { backgroundColor: colors.canvas, color: colors.inkTertiary, labelKey: "statusVoid" },
};

export type InvoicePdfType =
  | "pre_invoice"
  | "standard_invoice"
  | "final_invoice"
  | "late_fee_invoice"
  | "credit_note";

export interface InvoicePdfLineItem {
  description: string;
  /** Optional second line under the description. */
  detail?: string;
  /** Pre-tax line amount in primary currency, BIGINT minor units as string. */
  amountMinor: string;
  /** Tax rate as a percent number (e.g. 10 for 10%). */
  taxRate: number;
  /** Tax amount in primary currency, BIGINT minor units as string. */
  taxAmountMinor: string;
}

export interface InvoicePdfBankAccount {
  bankName: string;
  accountName: string;
  accountNumber: string;
  swiftBic?: string;
  cryptoWallet?: string;
}

export interface InvoicePdfIssuer {
  legalName: string;
  addressLines: string[];
  taxId?: string;
  email?: string;
  phone?: string;
}

export interface InvoicePdfRecipient {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  countryOfResidence?: string | null;
  taxResidency?: string | null;
}

export interface InvoicePdfProperty {
  projectName: string;
  projectLocation: string;
  unitCode: string;
  unitName?: string | null;
  unitTypeName?: string | null;
  buildingAreaSqm?: number | null;
  plotAreaSqm?: number | null;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceType: InvoicePdfType;
  status: string;
  language: InvoiceLanguage | string | null | undefined;
  /** Primary currency (e.g., "USD"). */
  currency: string;
  /** FX rate USD → IDR snapshot. */
  fxRate: number;
  /** Issued date in `YYYY-MM-DD` (the template formats per language). */
  issuedAt: string;
  dueDate: string;
  /** Already-formatted date strings — render module decides locale. */
  issuedAtFormatted: string;
  dueDateFormatted: string;
  generatedAtFormatted: string;
  issuer: InvoicePdfIssuer;
  recipient: InvoicePdfRecipient;
  property: InvoicePdfProperty;
  lineItems: InvoicePdfLineItem[];
  /** Equivalent of grand total in IDR, BIGINT minor as string. */
  grandTotalIdrMinor: string;
  bankAccount: InvoicePdfBankAccount | null;
  reference: string;
  /** Optional override of the default terms text. */
  termsBody?: string | null;
}

function fmtMoneyMinor(minorString: string, currency: string): string {
  const major = Number(minorString) / 100;
  if (currency === "USD" || currency === "EUR") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(major);
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(major);
}

function fmtIdrMinor(idrMinor: string): string {
  const major = Number(idrMinor) / 100;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(major);
}

function sumMinor(items: { amountMinor: string }[]): bigint {
  return items.reduce((acc, i) => acc + BigInt(i.amountMinor), 0n);
}

function sumTaxMinor(items: { taxAmountMinor: string }[]): bigint {
  return items.reduce((acc, i) => acc + BigInt(i.taxAmountMinor), 0n);
}

function documentTypeLabel(
  type: InvoicePdfType,
  s: ReturnType<typeof getInvoiceStrings>,
): string {
  switch (type) {
    case "pre_invoice":
      return s.documentTypePre;
    case "final_invoice":
      return s.documentTypeFinal;
    case "late_fee_invoice":
      return s.documentTypeLateFee;
    case "credit_note":
      return s.documentTypeCreditNote;
    default:
      return s.documentTypeStandard;
  }
}

export function InvoicePdf({ data }: { data: InvoicePdfData }): React.ReactElement {
  const s = getInvoiceStrings(data.language);
  const subtotal = sumMinor(data.lineItems);
  const totalTax = sumTaxMinor(data.lineItems);
  const grandTotal = subtotal + totalTax;
  const statusInfo =
    STATUS_TONE[data.status] ?? STATUS_TONE.draft;

  // Group taxes by rate for the breakdown.
  const taxByRate = new Map<number, bigint>();
  for (const li of data.lineItems) {
    const prev = taxByRate.get(li.taxRate) ?? 0n;
    taxByRate.set(li.taxRate, prev + BigInt(li.taxAmountMinor));
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBand} />

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.brandLockup}>
            <Text style={styles.brandText}>ARCONIQUE</Text>
            <Text style={styles.brandSubtext}>DEVELOPMENT · STRUCTURING · OPERATIONS</Text>
          </View>
          <View style={styles.documentTypeBlock}>
            <Text style={styles.documentTypeLabel}>
              {documentTypeLabel(data.invoiceType, s)}
            </Text>
            <Text style={styles.invoiceNumberLabel}>{s.invoiceNumberLabel}</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
          </View>
        </View>

        {/* Issuer + Recipient */}
        <View style={styles.partyRow}>
          <View style={styles.partyColumn}>
            <Text style={styles.partyLabel}>{s.issuedBy}</Text>
            <Text style={styles.partyName}>{data.issuer.legalName}</Text>
            {data.issuer.addressLines.map((line, i) => (
              <Text key={i} style={styles.partyLine}>
                {line}
              </Text>
            ))}
            {data.issuer.taxId && (
              <Text style={styles.partyLine}>Tax ID: {data.issuer.taxId}</Text>
            )}
            {data.issuer.email && (
              <Text style={styles.partyLine}>{data.issuer.email}</Text>
            )}
            {data.issuer.phone && (
              <Text style={styles.partyLine}>{data.issuer.phone}</Text>
            )}
          </View>
          <View style={styles.partyColumn}>
            <Text style={styles.partyLabel}>{s.issuedTo}</Text>
            <Text style={styles.partyName}>{data.recipient.fullName}</Text>
            {data.recipient.email && (
              <Text style={styles.partyLine}>{data.recipient.email}</Text>
            )}
            {data.recipient.phone && (
              <Text style={styles.partyLine}>{data.recipient.phone}</Text>
            )}
            {data.recipient.countryOfResidence && (
              <Text style={styles.partyLine}>
                {data.recipient.countryOfResidence}
              </Text>
            )}
            {data.recipient.taxResidency && (
              <Text style={styles.partyLine}>
                Tax: {data.recipient.taxResidency}
              </Text>
            )}
          </View>
        </View>

        {/* Metadata */}
        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>{s.issuedDate}</Text>
            <Text style={styles.metaValue}>{data.issuedAtFormatted}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>{s.dueDate}</Text>
            <Text style={styles.metaValue}>{data.dueDateFormatted}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>{s.status}</Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: statusInfo.backgroundColor,
                  color: statusInfo.color,
                },
              ]}
            >
              <Text>{s[statusInfo.labelKey]}</Text>
            </View>
          </View>
        </View>

        {/* Property */}
        <Text style={styles.sectionHeader}>{s.property}</Text>
        <View style={styles.propertyBlock}>
          <View style={styles.propertyRow}>
            <Text style={styles.propertyLabel}>{s.project}</Text>
            <Text style={styles.propertyValue}>
              {data.property.projectName} · {data.property.projectLocation}
            </Text>
          </View>
          <View style={styles.propertyRow}>
            <Text style={styles.propertyLabel}>{s.unit}</Text>
            <Text style={styles.propertyValue}>
              {data.property.unitCode}
              {data.property.unitName ? ` · ${data.property.unitName}` : ""}
            </Text>
          </View>
          {data.property.unitTypeName && (
            <View style={styles.propertyRow}>
              <Text style={styles.propertyLabel}>{s.unitType}</Text>
              <Text style={styles.propertyValue}>
                {data.property.unitTypeName}
              </Text>
            </View>
          )}
          {data.property.buildingAreaSqm != null && (
            <View style={styles.propertyRow}>
              <Text style={styles.propertyLabel}>{s.buildingArea}</Text>
              <Text style={styles.propertyValue}>
                {data.property.buildingAreaSqm.toLocaleString()} m²
              </Text>
            </View>
          )}
          {data.property.plotAreaSqm != null && (
            <View style={styles.propertyRow}>
              <Text style={styles.propertyLabel}>{s.plotArea}</Text>
              <Text style={styles.propertyValue}>
                {data.property.plotAreaSqm.toLocaleString()} m²
              </Text>
            </View>
          )}
        </View>

        {/* Line items */}
        <Text style={styles.sectionHeader}>{s.lineItems}</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.thDescription]}>{s.description}</Text>
          <Text style={[styles.th, styles.thRight]}>{s.amount}</Text>
          <Text style={[styles.th, styles.thRight]}>{s.taxRate}</Text>
          <Text style={[styles.th, styles.thRight]}>{s.taxAmount}</Text>
          <Text style={[styles.th, styles.thRight]}>{s.lineTotal}</Text>
        </View>
        {data.lineItems.map((li, i) => {
          const lineTotal =
            BigInt(li.amountMinor) + BigInt(li.taxAmountMinor);
          return (
            <View key={i} style={styles.tableRow}>
              <View style={[styles.tdDescription]}>
                <Text style={styles.td}>{li.description}</Text>
                {li.detail && (
                  <Text style={styles.lineSubtitle}>{li.detail}</Text>
                )}
              </View>
              <Text style={[styles.td, styles.tdRight]}>
                {fmtMoneyMinor(li.amountMinor, data.currency)}
              </Text>
              <Text style={[styles.td, styles.tdRight]}>
                {li.taxRate.toFixed(1)}%
              </Text>
              <Text style={[styles.td, styles.tdRight]}>
                {fmtMoneyMinor(li.taxAmountMinor, data.currency)}
              </Text>
              <Text style={[styles.td, styles.tdRight]}>
                {fmtMoneyMinor(lineTotal.toString(), data.currency)}
              </Text>
            </View>
          );
        })}

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{s.subtotal}</Text>
            <Text style={styles.totalValue}>
              {fmtMoneyMinor(subtotal.toString(), data.currency)}
            </Text>
          </View>
          {Array.from(taxByRate.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([rate, amount]) => (
              <View key={rate} style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  {s.taxesBreakdown} · {rate.toFixed(1)}%
                </Text>
                <Text style={styles.totalValue}>
                  {fmtMoneyMinor(amount.toString(), data.currency)}
                </Text>
              </View>
            ))}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>{s.grandTotal}</Text>
            <Text style={styles.grandTotalValue}>
              {fmtMoneyMinor(grandTotal.toString(), data.currency)}
            </Text>
          </View>
          <View style={styles.fxLine}>
            <Text style={styles.fxLabel}>{s.equivalentIdr}</Text>
            <Text style={styles.fxValue}>
              {fmtIdrMinor(data.grandTotalIdrMinor)}
            </Text>
          </View>
          <View style={styles.fxLine}>
            <Text style={styles.fxLabel}>{s.fxRateAt}</Text>
            <Text style={styles.fxValue}>
              {data.fxRate.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </Text>
          </View>
          <Text style={styles.fxNote}>{s.fxDisclaimer}</Text>
        </View>

        {/* Payment instructions */}
        <Text style={styles.sectionHeader}>{s.paymentInstructions}</Text>
        <View style={styles.paymentBlock}>
          {data.bankAccount ? (
            <>
              <View style={styles.paymentLine}>
                <Text style={styles.paymentLabel}>{s.bankTransfer}</Text>
                <Text style={styles.paymentValue}>{data.bankAccount.bankName}</Text>
              </View>
              <View style={styles.paymentLine}>
                <Text style={styles.paymentLabel}>{s.accountName}</Text>
                <Text style={styles.paymentValue}>{data.bankAccount.accountName}</Text>
              </View>
              <View style={styles.paymentLine}>
                <Text style={styles.paymentLabel}>{s.accountNumber}</Text>
                <Text style={styles.paymentValue}>{data.bankAccount.accountNumber}</Text>
              </View>
              {data.bankAccount.swiftBic && (
                <View style={styles.paymentLine}>
                  <Text style={styles.paymentLabel}>{s.swiftBic}</Text>
                  <Text style={styles.paymentValue}>{data.bankAccount.swiftBic}</Text>
                </View>
              )}
              {data.bankAccount.cryptoWallet && (
                <View style={styles.paymentLine}>
                  <Text style={styles.paymentLabel}>{s.cryptoWallet}</Text>
                  <Text style={styles.paymentValue}>{data.bankAccount.cryptoWallet}</Text>
                </View>
              )}
            </>
          ) : (
            <Text style={[styles.paymentValue, { fontStyle: "italic" }]}>
              {/* Payment instructions on file with the sales team. */}
              —
            </Text>
          )}
          <View style={styles.paymentLine}>
            <Text style={styles.paymentLabel}>{s.reference}</Text>
            <Text style={styles.paymentValue}>{data.reference}</Text>
          </View>
        </View>

        {/* Terms */}
        <Text style={[styles.sectionHeader, { marginTop: 18 }]}>
          {s.termsHeader}
        </Text>
        <Text style={[styles.partyLine, { marginBottom: 24 }]}>
          {data.termsBody ?? s.termsBody}
        </Text>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>
            {s.generatedAt}: {data.generatedAtFormatted}
          </Text>
          <Text
            style={styles.footerRight}
            render={({ pageNumber, totalPages }) =>
              `${s.page} ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
