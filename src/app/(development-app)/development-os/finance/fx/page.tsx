import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { desc } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>FX snapshots</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>FX snapshots</span>
          </div>
          <h1>FX snapshots</h1>
          <div className="label mt-2">
            {latest ? `Latest: ${String(latest.snapshotDate)} (${latest.source})` : "No snapshots"}
          </div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Daily FX rates referenced by every transaction&apos;s USD conversion.
            The fx-snapshot cron rolls forward today&apos;s snapshot from the
            latest prior when no API source is configured.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/finance" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Finance
          </Link>
        </div>
      </div>

      {latest && (
        <div>
          <div className="label mb-2.5">Today</div>
          <Card padding="default">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Rate label="USD → IDR" value={String(latest.rateIdr)} />
              {latest.rateRub && <Rate label="USD → RUB" value={String(latest.rateRub)} />}
              {latest.rateEur && <Rate label="USD → EUR" value={String(latest.rateEur)} />}
              <Rate label="USD → USDT" value={String(latest.rateUsdt)} />
              {latest.rateCny && <Rate label="USD → CNY" value={String(latest.rateCny)} />}
            </div>
            <div className="mt-3">
              <HandoffBadge tone="soft">Source: {latest.source}</HandoffBadge>
            </div>
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">History</div>
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
      </div>
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
