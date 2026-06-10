/**
 * Platform Billing — per-org billing detail (honest v1, pre-PSP).
 *
 * What live data supports today:
 *   - current plan + derived billing state + MRR contribution
 *     (getSubscriptionOsOrgByCode — same read the org console uses)
 *   - plan/billing history = subscription lifecycle events
 *     (trial_started, trial_converted, comp_granted, …)
 *   - operator billing actions = audit_events with action
 *     'platform.subscription.*' for this org (comp grants with reason,
 *     trial extensions, cancellations) — see ./queries.ts
 *
 * No invoices / payments / refunds / dunning exist (no PSP yet) — the
 * PaymentsNotConnectedBand says so explicitly instead of faking them.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DetailPageHero, ListTableCard } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import {
  getSubscriptionOsOrgByCode,
  getOrgLifecycleEvents,
} from "@/lib/subscription-os/queries";
import { safeQuery } from "@/lib/development/safe-query";
import {
  deriveBillingState,
  getOrgBillingAuditTrail,
  type BillingAuditEntry,
  type BillingState,
} from "../queries";
import { PaymentsNotConnectedBand } from "../payments-not-connected";

export const metadata: Metadata = {
  title: "Org billing · Platform Admin OS",
};
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<BillingState, string> = {
  paying: "Active plan",
  comped: "Comped",
  trial: "Trial",
  grace: "Grace",
  cancelled: "Cancelled",
  dormant: "Dormant",
  "no-plan": "No plan",
};

const STATE_TONE: Record<
  BillingState,
  "success" | "info" | "warning" | "danger" | "neutral" | "gold"
> = {
  paying: "success",
  comped: "gold",
  trial: "info",
  grace: "warning",
  cancelled: "danger",
  dormant: "neutral",
  "no-plan": "neutral",
};

/** Human label per audit action — falls back to the raw dotted action. */
const AUDIT_ACTION_LABEL: Record<string, string> = {
  "platform.subscription.comp_granted": "Comp granted",
  "platform.subscription.trial_extended": "Trial extended",
  "platform.subscription.cancelled": "Subscription cancelled",
};

function fmtMoney(minor: bigint | null, currency: string | null): string {
  if (minor === null) return "—";
  const n = Number(minor) / 100;
  return `${currency ?? "USD"} ${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

function auditEntrySummary(e: BillingAuditEntry): string | null {
  const meta = e.metadata ?? {};
  const reason = typeof meta.reason === "string" ? meta.reason : null;
  const days =
    typeof meta.additionalDays === "number" ? meta.additionalDays : null;
  if (reason && days !== null) return `+${days}d · ${reason}`;
  if (days !== null) return `+${days} days`;
  if (reason) return reason;
  return null;
}

export default async function OrgBillingDetailPage({
  params,
}: {
  params: Promise<{ orgCode: string }>;
}) {
  const { orgCode } = await params;
  const org = await getSubscriptionOsOrgByCode(orgCode);
  if (!org) notFound();

  const billingState = deriveBillingState(org.status, org.isInternalComp);

  const [events, auditTrail] = await Promise.all([
    safeQuery(
      `platform-billing.lifecycle.${orgCode}`,
      getOrgLifecycleEvents(org.id, 50),
      [] as Awaited<ReturnType<typeof getOrgLifecycleEvents>>,
      4000,
    ),
    safeQuery(
      `platform-billing.audit.${orgCode}`,
      getOrgBillingAuditTrail(org.id, 50),
      [] as BillingAuditEntry[],
      4000,
    ),
  ]);

  const mrrValue =
    org.status === "active" && !org.isInternalComp
      ? fmtMoney(org.monthlyPriceMinor, org.currency)
      : org.status === "active" && org.isInternalComp
        ? `${fmtMoney(org.monthlyPriceMinor, org.currency)} (comp)`
        : "—";

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <DetailPageHero
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: org.name },
        ]}
        eyebrow={`Billing · ${org.organizationType}`}
        title={org.name}
        description={`Org code · ${org.organizationCode}`}
        statusRow={
          <>
            <Badge tone={STATE_TONE[billingState]}>
              {STATE_LABEL[billingState]}
            </Badge>
            {org.isInternalComp && <Badge tone="gold">Internal comp</Badge>}
            {org.planCode && (
              <Badge tone="outline">{org.planDisplayName ?? org.planCode}</Badge>
            )}
          </>
        }
        actions={
          <Link
            href={`/platform/${org.organizationCode}`}
            className="inline-flex items-center gap-2 rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-line-strong transition-colors"
          >
            Open org console
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        }
        summaryStrip={[
          { label: "Plan", value: org.planDisplayName ?? "—" },
          {
            label: "MRR contribution",
            value: mrrValue,
            hint:
              org.isInternalComp && org.status === "active"
                ? "List price — comped, not collected"
                : undefined,
          },
          {
            label: org.status === "trial" ? "Trial ends" : "Period ends",
            value:
              org.status === "trial"
                ? fmtDate(org.trialEndsAt)
                : fmtDate(org.currentPeriodEndsAt),
          },
          { label: "Customer since", value: fmtDate(org.createdAt) },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <ListTableCard
            eyebrow="Plan history"
            title="Subscription lifecycle"
            count={events.length}
          >
            {events.length === 0 ? (
              <div className="px-7 py-12 text-center text-sm text-ink-tertiary">
                No lifecycle events recorded yet.
              </div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="px-7 py-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink truncate">
                        {e.eventType}
                      </div>
                      <div className="text-xs text-ink-tertiary truncate">
                        {e.fromStatus
                          ? `${e.fromStatus} → ${e.toStatus ?? "?"}`
                          : (e.toStatus ?? "—")}{" "}
                        · actor: {e.actorKind}
                      </div>
                    </div>
                    <span className="text-xs text-ink-tertiary tabular-nums shrink-0">
                      {fmtDate(e.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ListTableCard>

          <ListTableCard
            eyebrow="Operator actions"
            title="Billing audit trail"
            count={auditTrail.length}
          >
            {auditTrail.length === 0 ? (
              <div className="px-7 py-12 text-center text-sm text-ink-tertiary">
                No operator billing actions recorded for this org — comp
                grants, trial extensions and cancellations land here.
              </div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {auditTrail.map((e) => {
                  const summary = auditEntrySummary(e);
                  return (
                    <li
                      key={e.id}
                      className="px-7 py-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink truncate">
                          {AUDIT_ACTION_LABEL[e.action] ?? e.action}
                        </div>
                        <div className="text-xs text-ink-tertiary truncate">
                          {e.actorName ?? e.actorEmail ?? "unknown actor"}
                          {summary ? ` · ${summary}` : ""}
                        </div>
                      </div>
                      <span className="text-xs text-ink-tertiary tabular-nums shrink-0">
                        {fmtDate(e.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </ListTableCard>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 flex flex-col gap-4">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Related
            </span>
            <Link
              href={`/platform/${org.organizationCode}`}
              className="inline-flex items-center gap-2 text-sm text-ink hover:text-accent"
            >
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              Org console
            </Link>
            <Link
              href="/platform/revenue"
              className="inline-flex items-center gap-2 text-sm text-ink hover:text-accent"
            >
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              Revenue dashboard
            </Link>
            <Link
              href={`/platform/audit?org=${org.organizationCode}`}
              className="inline-flex items-center gap-2 text-sm text-ink hover:text-accent"
            >
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              Full audit log
            </Link>
          </div>
        </aside>
      </div>

      <PaymentsNotConnectedBand />
    </div>
  );
}
