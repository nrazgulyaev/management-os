import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { devFxSnapshots } from "@/lib/db/schema/dev-finance";
import { getLatestFXSnapshot } from "@/lib/development/server/fx";

export const metadata: Metadata = { title: "FX snapshots · Development OS" };
export const dynamic = "force-dynamic";

export default async function FxPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="FX snapshots" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const [latest, recent] = await Promise.all([
    getLatestFXSnapshot(),
    db
      .select()
      .from(devFxSnapshots)
      .orderBy(desc(devFxSnapshots.snapshotDate))
      .limit(60),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "FX snapshots" },
        ]}
        eyebrow={
          latest ? `Latest: ${String(latest.snapshotDate)} (${latest.source})` : "No snapshots"
        }
        title="FX snapshots"
        description="Daily FX rates referenced by every transaction's USD conversion. The fx-snapshot cron rolls forward today's snapshot from the latest prior when no API source is configured."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Finance
            </Link>
          </Button>
        }
      />

      {latest && (
        <Section eyebrow="Today" title="Most recent rates">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Rate label="USD → IDR" value={String(latest.rateIdr)} />
            {latest.rateRub && <Rate label="USD → RUB" value={String(latest.rateRub)} />}
            {latest.rateEur && <Rate label="USD → EUR" value={String(latest.rateEur)} />}
            <Rate label="USD → USDT" value={String(latest.rateUsdt)} />
            {latest.rateCny && <Rate label="USD → CNY" value={String(latest.rateCny)} />}
          </div>
          <div className="mt-3">
            <Badge tone="neutral">Source: {latest.source}</Badge>
          </div>
        </Section>
      )}

      <Section eyebrow="History" title="Last 60 snapshots">
        {recent.length === 0 ? (
          <EmptyState
            title="No FX snapshots"
            description="The fx-snapshot cron seeds today; the bulk seed populates 78 weekly snapshots across the past 18 months."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>IDR</TH>
                <TH>RUB</TH>
                <TH>EUR</TH>
                <TH>USDT</TH>
                <TH>CNY</TH>
                <TH>Source</TH>
              </TR>
            </THead>
            <TBody>
              {recent.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs">{String(r.snapshotDate)}</TD>
                  <TD className="font-mono text-xs">{String(r.rateIdr)}</TD>
                  <TD className="font-mono text-xs">{r.rateRub ? String(r.rateRub) : "—"}</TD>
                  <TD className="font-mono text-xs">{r.rateEur ? String(r.rateEur) : "—"}</TD>
                  <TD className="font-mono text-xs">{String(r.rateUsdt)}</TD>
                  <TD className="font-mono text-xs">{r.rateCny ? String(r.rateCny) : "—"}</TD>
                  <TD className="text-xs text-ink-secondary">{r.source}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}
