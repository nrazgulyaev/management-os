import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listClosedPeriodsForUi } from "@/lib/banking/queries";
import {
  closePeriodAction,
  reopenPeriodAction,
} from "@/lib/banking/bookkeeper-actions";

export const metadata: Metadata = { title: "Period close · Finance" };
export const dynamic = "force-dynamic";

export default async function PeriodClosePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Period close" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const periods = await listClosedPeriodsForUi({ limit: 36 });

  // Default form: close last calendar month.
  const today = new Date();
  const lastMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
  );
  const lastMonthEnd = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0),
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Period close" },
        ]}
        eyebrow={`${periods.length} periods on record`}
        title="Period close"
        description="Lock an accounting period after the bookkeeper has reviewed every transaction. Reopening requires a written reason and is logged for audit."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/bank-review">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Bank review
            </Link>
          </Button>
        }
      />

      <Section
        title="Close a period"
        description="Defaults to last calendar month. Counters (transactions / reconciled / unmatched) are snapshotted at close-time so the audit trail records what the bookkeeper saw."
      >
        <form
          action={closePeriodAction}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-md border border-line-soft bg-surface p-3 text-sm"
        >
          <Field label="Period start">
            <input
              type="date"
              name="periodStart"
              required
              defaultValue={lastMonth.toISOString().slice(0, 10)}
              className={inputCls}
            />
          </Field>
          <Field label="Period end">
            <input
              type="date"
              name="periodEnd"
              required
              defaultValue={lastMonthEnd.toISOString().slice(0, 10)}
              className={inputCls}
            />
          </Field>
          <Field label="Scope">
            <select name="scope" defaultValue="month" className={inputCls}>
              <option value="month">month</option>
              <option value="quarter">quarter</option>
              <option value="year">year</option>
              <option value="custom">custom</option>
            </select>
          </Field>
          <Field label="Notes (optional)" className="md:col-span-3">
            <input type="text" name="notes" className={inputCls} />
          </Field>
          <div className="md:col-span-3 flex justify-end">
            <Button type="submit" variant="primary">
              <Lock className="w-4 h-4" strokeWidth={1.75} />
              Close period
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Closed periods">
        {periods.length === 0 ? (
          <EmptyState
            title="No periods closed yet"
            description="Close your first period above. Closed periods block transaction modifications without an explicit admin override."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Scope</TH>
                <TH className="text-right">Txns</TH>
                <TH className="text-right">Matched</TH>
                <TH className="text-right">Unmatched</TH>
                <TH>Status</TH>
                <TH>Closed</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {periods.map((p) => {
                const isLocked = !p.reopenedAt;
                return (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">
                      {p.periodStart} → {p.periodEnd}
                    </TD>
                    <TD>
                      <Badge tone="outline">{p.scope}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {p.transactionsCount}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {p.reconciledCount}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {p.unmatchedCount}
                    </TD>
                    <TD>
                      <Badge tone={isLocked ? "success" : "neutral"}>
                        {isLocked ? "locked" : "reopened"}
                      </Badge>
                    </TD>
                    <TD className="text-xs text-ink-secondary">
                      {new Date(p.closedAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </TD>
                    <TD className="text-right">
                      {isLocked && (
                        <form
                          action={reopenPeriodAction}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="hidden"
                            name="periodId"
                            value={p.id}
                          />
                          <input
                            type="text"
                            name="reason"
                            required
                            placeholder="Reason"
                            className="rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
                          />
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                          >
                            Reopen
                          </Button>
                        </form>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}

const inputCls =
  "w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-ink-secondary text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}
