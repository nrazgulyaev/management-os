import * as React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatMoneyMinor } from "@/lib/money";
import type {
  OwnerStatementRow,
  StatementLineRow,
} from "@/features/finance/services";
import { generateStatementExplanation } from "@/features/finance/explanation";

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
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    color: colors.ink,
    fontFamily: "Helvetica",
    backgroundColor: colors.canvas,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  brand: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
  brandSub: {
    fontSize: 8,
    color: colors.inkTertiary,
    marginTop: 2,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  hero: {
    backgroundColor: colors.surface,
    border: `1pt solid ${colors.line}`,
    padding: 18,
    borderRadius: 4,
    marginBottom: 14,
  },
  heroLabel: {
    fontSize: 8,
    color: colors.inkTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: colors.inkSecondary,
  },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
    paddingTop: 12,
    borderTop: `1pt solid ${colors.line}`,
  },
  netLabel: {
    fontSize: 9,
    color: colors.inkTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  netValue: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: colors.accent,
  },
  metaRow: {
    flexDirection: "row",
    gap: 18,
    marginTop: 6,
  },
  metaCell: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 8,
    color: colors.inkTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    color: colors.ink,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    border: `1pt solid ${colors.line}`,
    borderRadius: 4,
    padding: 10,
  },
  summaryTable: {
    backgroundColor: colors.surface,
    border: `1pt solid ${colors.line}`,
    borderRadius: 4,
    padding: 14,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  summaryRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    marginTop: 6,
    borderTop: `1pt solid ${colors.line}`,
  },
  totalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  totalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: colors.accent,
  },
  sectionHeader: {
    fontSize: 9,
    color: colors.inkTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    paddingBottom: 4,
    borderBottom: `1pt solid ${colors.line}`,
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTotal: {
    fontFamily: "Helvetica-Bold",
    color: colors.ink,
    letterSpacing: 0,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  lineDescription: {
    flex: 1,
    fontSize: 10,
    color: colors.ink,
    paddingRight: 12,
  },
  lineCategory: {
    fontSize: 8,
    color: colors.inkTertiary,
    marginTop: 1,
  },
  lineAmount: {
    fontSize: 10,
    color: colors.ink,
  },
  lineAmountNeg: {
    color: colors.inkSecondary,
  },
  bulletList: {
    backgroundColor: colors.accentWeak,
    border: `1pt solid ${colors.line}`,
    borderRadius: 4,
    padding: 12,
    marginBottom: 14,
  },
  bullet: {
    fontSize: 10,
    color: colors.ink,
    marginBottom: 4,
  },
  footer: {
    marginTop: 18,
    paddingTop: 10,
    borderTop: `1pt solid ${colors.line}`,
    fontSize: 8,
    color: colors.inkTertiary,
  },
  badge: {
    backgroundColor: colors.goldWeak,
    color: colors.gold,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
    alignSelf: "flex-start",
  },
});

const sectionLabels: Record<string, string> = {
  revenue: "Revenue",
  fee: "Fees",
  expense: "Operating expenses",
  tax: "Taxes",
  reserve: "Reserves",
  management_fee: "Management fee",
  adjustment: "Adjustments",
};

const sectionOrder = [
  "revenue",
  "fee",
  "tax",
  "expense",
  "reserve",
  "management_fee",
  "adjustment",
];

export interface OwnerStatementPdfProps {
  statement: OwnerStatementRow;
  lines: StatementLineRow[];
  audience: "internal" | "owner";
  generatedAt: string;
  /**
   * Prompt 110 — optional pre-computed explanation snapshot.  When
   * present the renderer prefers its headline / summary / bullets /
   * payout-explanation over the deterministic fallback.  Owner-safe
   * by construction; the snapshot generator is the redaction seam.
   */
  explanationSnapshot?: {
    headline: string;
    summary: string;
    bulletPoints: string[];
    payoutExplanation: string | null;
    warningExplanation: string | null;
  } | null;
}

export function OwnerStatementPdf({
  statement,
  lines,
  audience,
  generatedAt,
  explanationSnapshot,
}: OwnerStatementPdfProps) {
  const fallback = generateStatementExplanation(statement, lines);
  const headline = explanationSnapshot?.headline ?? fallback.headline;
  const bullets = explanationSnapshot?.bulletPoints ?? fallback.bullets;
  const summary = explanationSnapshot?.summary ?? null;
  const payoutNote = explanationSnapshot?.payoutExplanation ?? null;
  const warningNote = explanationSnapshot?.warningExplanation ?? null;
  const footer = fallback.footer;
  const grouped = sectionOrder
    .map((s) => ({
      section: s,
      lines: lines.filter((l) => l.lineType === s),
    }))
    .filter((g) => g.lines.length > 0);

  const fmt = (v: bigint) => formatMoneyMinor(v, statement.currency);
  const occupancyDisplay =
    statement.occupancyRate !== null ? `${(statement.occupancyRate * 100).toFixed(1)}%` : "—";
  const adrDisplay = statement.adrMinor !== null ? fmt(statement.adrMinor) : "—";
  const revparDisplay = statement.revparMinor !== null ? fmt(statement.revparMinor) : "—";

  return (
    <Document
      title={`Arconique Statement ${statement.statementCode}`}
      author="Arconique Management OS"
      subject={`Owner statement · ${statement.periodLabel}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <View>
            <Text style={styles.brand}>Arconique</Text>
            <Text style={styles.brandSub}>Management OS</Text>
          </View>
          <View>
            <Text style={styles.badge}>{statement.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Owner statement · {statement.periodLabel}</Text>
          <Text style={styles.title}>
            {statement.villaCode ?? statement.projectName ?? statement.ownerName}
          </Text>
          <Text style={styles.subtitle}>
            {statement.ownerName} · Management model: {statement.managementModel}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Period</Text>
              <Text style={styles.metaValue}>
                {statement.periodStart} → {statement.periodEnd}
              </Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Statement code</Text>
              <Text style={styles.metaValue}>{statement.statementCode}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Currency</Text>
              <Text style={styles.metaValue}>{statement.currency}</Text>
            </View>
          </View>

          <View style={styles.netRow}>
            <View>
              <Text style={styles.netLabel}>Net owner payout</Text>
            </View>
            <Text style={styles.netValue}>{fmt(statement.netPayoutMinor)}</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <Metric label="Occupancy" value={occupancyDisplay} />
          <Metric label="ADR" value={adrDisplay} />
          <Metric label="RevPAR" value={revparDisplay} />
        </View>

        <View style={styles.summaryTable}>
          <Text style={styles.heroLabel}>Summary</Text>
          <SummaryRow label="Gross revenue" value={fmt(statement.grossRevenueMinor)} />
          <SummaryRow label="Fees" value={fmt(statement.totalFeesMinor)} />
          <SummaryRow label="Operating expenses" value={fmt(statement.totalExpensesMinor)} />
          <SummaryRow label="Taxes" value={fmt(statement.totalTaxesMinor)} />
          <SummaryRow label="Reserves" value={fmt(statement.totalReservesMinor)} />
          <SummaryRow label="Management fee" value={fmt(statement.managementFeeMinor)} />
          <View style={styles.summaryRowTotal}>
            <Text style={styles.totalLabel}>Net owner payout</Text>
            <Text style={styles.totalValue}>{fmt(statement.netPayoutMinor)}</Text>
          </View>
        </View>

        <View style={styles.bulletList}>
          <Text style={[styles.heroLabel, { color: colors.accent, marginBottom: 6 }]}>
            Why this number
          </Text>
          <Text style={[styles.bullet, { fontFamily: "Helvetica-Bold" }]}>{headline}</Text>
          {summary && (
            <Text style={styles.bullet}>{summary}</Text>
          )}
          {bullets.map((b, i) => (
            <Text key={i} style={styles.bullet}>
              · {b}
            </Text>
          ))}
          {payoutNote && (
            <Text style={[styles.bullet, { marginTop: 4 }]}>{payoutNote}</Text>
          )}
          {warningNote && (
            <Text style={[styles.bullet, { color: colors.accent }]}>
              {warningNote}
            </Text>
          )}
        </View>

        {grouped.map((group) => (
          <View key={group.section} style={{ marginBottom: 12 }} wrap={false}>
            <View style={styles.sectionHeader}>
              <Text>{sectionLabels[group.section] ?? group.section}</Text>
              <Text style={styles.sectionTotal}>
                {fmt(group.lines.reduce<bigint>((a, l) => a + l.amountMinor, 0n))}
              </Text>
            </View>
            {group.lines.map((line) => (
              <View key={line.id} style={styles.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineDescription}>{line.description}</Text>
                  <Text style={styles.lineCategory}>{line.category}</Text>
                </View>
                <Text
                  style={
                    line.amountMinor < 0n
                      ? [styles.lineAmount, styles.lineAmountNeg]
                      : styles.lineAmount
                  }
                >
                  {fmt(line.amountMinor)}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>{footer}</Text>
          <Text style={{ marginTop: 4 }}>
            Generated {generatedAt} · Audience: {audience} · Where applicable, demo / modelled data is so
            labelled. This document is generated by Arconique Management OS and is not a tax document.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}
