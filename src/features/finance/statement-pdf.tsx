import "server-only";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import * as React from "react";
import { getStatementById } from "@/features/finance/statement-generation";

/**
 * STATEMENT-1 — Owner statement PDF renderer.
 *
 * Uses @react-pdf/renderer (already in package.json deps). Output is
 * a Buffer the caller can stream as `application/pdf` or persist to
 * cloud storage (STORAGE-1 sprint). No cloud storage configured at
 * sprint time → caller uses a direct-stream endpoint per the
 * STATEMENT-1 halt condition.
 */

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1f1d1a",
  },
  brand: { fontSize: 14, fontWeight: "bold", marginBottom: 4, color: "#c4583c" },
  brandTagline: { fontSize: 8, color: "#7a716a", marginBottom: 24 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 6 },
  subtitle: { fontSize: 10, color: "#7a716a", marginBottom: 24 },
  metaRow: { flexDirection: "row", gap: 24, marginBottom: 16 },
  metaCell: { flex: 1 },
  metaLabel: { fontSize: 7, color: "#7a716a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  metaValue: { fontSize: 11, fontWeight: "bold" },
  hr: { borderBottomWidth: 1, borderBottomColor: "#d8d0c4", marginVertical: 12 },
  table: { marginTop: 14, marginBottom: 14 },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1f1d1a",
    paddingBottom: 6,
    marginBottom: 4,
  },
  th: { fontSize: 7, color: "#7a716a", textTransform: "uppercase", letterSpacing: 1 },
  thCategory: { width: 72 },
  thDescription: { flex: 1 },
  thAmount: { width: 100, textAlign: "right" },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ece6dc",
  },
  cellCategory: { width: 72, fontSize: 8, textTransform: "uppercase", color: "#7a716a" },
  cellDescription: { flex: 1, fontSize: 10 },
  cellAmount: { width: 100, fontSize: 10, textAlign: "right" },
  cellAmountPositive: { color: "#3b6f3b" },
  cellAmountNegative: { color: "#1f1d1a" },
  netRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderTopWidth: 2,
    borderTopColor: "#1f1d1a",
    backgroundColor: "#f8f3eb",
    paddingHorizontal: 6,
    marginTop: 4,
  },
  netLabel: { flex: 1, fontSize: 14, fontWeight: "bold" },
  netAmount: { width: 160, fontSize: 16, fontWeight: "bold", textAlign: "right", color: "#c4583c" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48 },
  footerLine: { fontSize: 7, color: "#7a716a", marginBottom: 2 },
  hashCode: { fontSize: 7, fontFamily: "Courier", color: "#7a716a" },
  previewBanner: {
    backgroundColor: "#f4e9c9",
    padding: 8,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#c4583c",
  },
  previewText: { fontSize: 9, color: "#1f1d1a" },
});

const IDR_BILLION = 1_000_000_000_00;
const IDR_MILLION = 1_000_000_00;
const IDR_K = 1_000_00;

function fmtIdrSigned(minor: bigint): string {
  const sign = minor < 0n ? "−" : "";
  const abs = minor < 0n ? -minor : minor;
  if (abs >= BigInt(IDR_BILLION)) return `${sign}IDR ${(Number(abs) / IDR_BILLION).toFixed(2)}B`;
  if (abs >= BigInt(IDR_MILLION)) return `${sign}IDR ${(Number(abs) / IDR_MILLION).toFixed(1)}M`;
  return `${sign}IDR ${Math.round(Number(abs) / IDR_K).toLocaleString()}K`;
}

function fmtUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  return `USD ${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface StatementPdfInput {
  statementId: string;
  ownerName: string;
  villaCode: string;
  villaName: string | null;
  monthLabel: string;
  organizationName: string;
}

export async function renderStatementPdf(input: StatementPdfInput): Promise<Buffer> {
  const data = await getStatementById(input.statementId);
  if (!data) throw new Error(`Statement ${input.statementId} not found`);
  const { statement, lines } = data;

  // MOCK_MONEY fix — the "Operator fee" headline used to fall back to a
  // hardcoded 0.2 (20%) for EVERY statement (the canonical engine never stores
  // operator_commission_pct, so the `?? "0.2"` branch fired for all of them).
  // Derive the HONEST effective rate from the statement's own real money:
  // managementFeeMinor / grossRevenueMinor. Prefer the stored nominal rate when
  // it exists (legacy generator records it); else compute from the actuals; show
  // "—" when there's no gross to divide by (rate not derivable). No hardcode.
  const operatorFeeLabel: string = (() => {
    if (
      statement.operatorCommissionPct !== null &&
      statement.operatorCommissionPct !== undefined
    ) {
      return `${Math.round(Number(statement.operatorCommissionPct) * 100)}%`;
    }
    if (statement.grossRevenueMinor > 0n) {
      const pct =
        (Number(statement.managementFeeMinor) / Number(statement.grossRevenueMinor)) *
        100;
      return `${pct.toFixed(1)}%`;
    }
    return "—";
  })();

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>ARCONIQUE</Text>
        <Text style={styles.brandTagline}>
          {input.organizationName} · owner statement
        </Text>

        <Text style={styles.title}>
          {input.ownerName} · {input.villaCode}
        </Text>
        <Text style={styles.subtitle}>
          {input.monthLabel} · {lines.length} lines · Statement
          {" "}<Text style={styles.hashCode}>{statement.statementCode}</Text>
        </Text>

        {statement.status !== "approved" && statement.status !== "sent" && (
          <View style={styles.previewBanner}>
            <Text style={styles.previewText}>
              DRAFT · Status: {statement.status.replace(/_/g, " ")}. Not yet signed.
            </Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Gross revenue</Text>
            <Text style={styles.metaValue}>{fmtIdrSigned(statement.grossRevenueMinor)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Operator fee</Text>
            <Text style={styles.metaValue}>{operatorFeeLabel}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>FX snapshot</Text>
            <Text style={styles.metaValue}>
              IDR {Number(statement.fxRateSnapshot ?? "15800").toLocaleString()}/USD
            </Text>
          </View>
        </View>

        <View style={styles.hr} />

        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.thCategory]}>Category</Text>
            <Text style={[styles.th, styles.thDescription]}>Description</Text>
            <Text style={[styles.th, styles.thAmount]}>Amount</Text>
          </View>
          {lines.map((l) => (
            <View key={l.id} style={styles.row}>
              <Text style={styles.cellCategory}>{l.category}</Text>
              <Text style={styles.cellDescription}>{l.description}</Text>
              <Text
                style={[
                  styles.cellAmount,
                  l.amountMinor >= 0n ? styles.cellAmountPositive : styles.cellAmountNegative,
                ]}
              >
                {fmtIdrSigned(l.amountMinor)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.netRow}>
          <Text style={styles.netLabel}>Net to owner</Text>
          <View style={{ width: 160, alignItems: "flex-end" }}>
            <Text style={styles.netAmount}>{fmtIdrSigned(statement.netPayoutMinor)}</Text>
            <Text style={{ fontSize: 9, color: "#7a716a" }}>
              ≈ {fmtUsd(statement.netToOwnerUsdMinor ?? 0n)}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLine}>
            Generated {new Date(statement.createdAt).toISOString().slice(0, 19).replace("T", " ")} UTC
            {statement.approvedAt
              ? ` · Approved ${new Date(statement.approvedAt).toISOString().slice(0, 10)}`
              : ""}
          </Text>
          <Text style={styles.footerLine}>
            Content hash: <Text style={styles.hashCode}>{statement.contentHash ?? "—"}</Text>
          </Text>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
