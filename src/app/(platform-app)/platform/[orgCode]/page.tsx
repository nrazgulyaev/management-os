/**
 * Stage 10.6.E.2.2 — Per-org detail.
 *
 * Subscription state, trial countdown, MRR contribution, recent
 * lifecycle activity, action buttons (extend trial / comp / cancel).
 *
 * Action buttons are READ-ONLY in 10.6.E.2 — they render disabled with
 * a tooltip pointing to the follow-up sub-phase that pairs them with
 * the impersonation flow + audit-log emission. Operator can still
 * see what's available and confirm the layout works end-to-end.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Mail, ExternalLink } from "lucide-react";
import {
  DetailPageHero,
  ListTableCard,
} from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import {
  getSubscriptionOsOrgByCode,
  getOrgLifecycleEvents,
  listAssignablePlans,
  type AssignablePlanOption,
} from "@/lib/subscription-os/queries";
import { PerOrgActionButtons } from "@/components/subscription-os/per-org-action-buttons";
import { AssignPlanButton } from "@/components/subscription-os/assign-plan-button";
import { ImpersonationStartButton } from "@/components/subscription-os/impersonation-start-button";
import { safeQuery } from "@/lib/development/safe-query";
import { isImpersonationEnabled } from "@/lib/env";

export const metadata: Metadata = {
  title: "Org detail · Platform Admin OS",
};
export const dynamic = "force-dynamic";

function fmtMoney(minor: bigint | null, currency: string | null): string {
  if (!minor) return "—";
  const n = Number(minor) / 100;
  return `${currency ?? "USD"} ${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

function daysUntil(d: Date | null): string {
  if (!d) return "—";
  const diff = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff === 0) return "today";
  return `in ${diff}d`;
}

const STATUS_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  trial: "info",
  grace: "warning",
  cancelled: "danger",
  archived: "neutral",
  purged: "neutral",
  "no-subscription": "neutral",
};

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ orgCode: string }>;
}) {
  const { orgCode } = await params;
  const org = await getSubscriptionOsOrgByCode(orgCode);
  if (!org) notFound();

  // P0 security — impersonation is OFF by default; only surface the
  // "View as customer" control when the env flag is explicitly enabled.
  const impersonationEnabled = isImpersonationEnabled();

  const events = await safeQuery(
    `subscription-os.lifecycle.${orgCode}`,
    getOrgLifecycleEvents(org.id, 25),
    [] as Awaited<ReturnType<typeof getOrgLifecycleEvents>>,
    4000,
  );

  const assignablePlans = await safeQuery(
    "subscription-os.assignablePlans",
    listAssignablePlans(),
    [] as AssignablePlanOption[],
    4000,
  );

  // "no-subscription" status (queries.ts fallback) ⇒ no org_subscriptions
  // row yet — the case that left Extend / Comp / Cancel inert.
  const hasSubscription = org.status !== "no-subscription";

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <DetailPageHero
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "Organizations", href: "/platform/organizations" },
          { label: org.name },
        ]}
        eyebrow={org.organizationType}
        title={org.name}
        description={`Org code · ${org.organizationCode}`}
        statusRow={
          <>
            <Badge tone={STATUS_TONE[org.status] ?? "neutral"}>
              {org.status}
            </Badge>
            {org.isInternalComp && <Badge tone="gold">Internal comp</Badge>}
            {org.productsEnabled.map((p) => (
              <Badge key={p} tone="outline">
                {p}
              </Badge>
            ))}
          </>
        }
        actions={
          <>
            <AssignPlanButton
              organizationCode={org.organizationCode}
              plans={assignablePlans}
              hasSubscription={hasSubscription}
              currentPlanCode={org.planCode}
            />
            {hasSubscription && (
              <PerOrgActionButtons
                organizationCode={org.organizationCode}
                status={org.status}
                isInternalComp={org.isInternalComp}
              />
            )}
          </>
        }
        summaryStrip={[
          {
            label: "Plan",
            value: org.planDisplayName ?? "—",
          },
          {
            label: "MRR",
            value:
              org.status === "active"
                ? fmtMoney(org.monthlyPriceMinor, org.currency)
                : "—",
          },
          {
            label: org.status === "trial" ? "Trial ends" : "Period ends",
            value:
              org.status === "trial"
                ? fmtDate(org.trialEndsAt)
                : fmtDate(org.currentPeriodEndsAt),
            hint:
              org.status === "trial"
                ? daysUntil(org.trialEndsAt)
                : daysUntil(org.currentPeriodEndsAt),
          },
          {
            label: "Customer since",
            value: fmtDate(org.createdAt),
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ListTableCard
            eyebrow="Activity"
            title="Lifecycle events"
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
                        {e.fromStatus ? `${e.fromStatus} → ${e.toStatus ?? "?"}` : (e.toStatus ?? "—")} · actor: {e.actorKind}
                      </div>
                    </div>
                    <span className="text-xs text-ink-tertiary tabular-nums shrink-0">
                      {e.occurredAt.toISOString().slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ListTableCard>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 flex flex-col gap-4">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Quick actions
            </span>
            {impersonationEnabled ? (
              <ImpersonationStartButton organizationCode={org.organizationCode} />
            ) : null}
            <Link
              href={`mailto:${org.organizationCode}@example.com`}
              className="inline-flex items-center gap-2 text-sm text-ink hover:text-accent"
            >
              <Mail className="w-4 h-4" strokeWidth={1.75} />
              Open support ticket
              <ExternalLink className="w-3.5 h-3.5 ml-auto" strokeWidth={1.75} />
            </Link>
            <Link
              href="/dashboard/settings/integrations"
              className="inline-flex items-center gap-2 text-sm text-ink hover:text-accent"
            >
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              Integrations command center
            </Link>
            <Link
              href={`/platform/audit?org=${org.organizationCode}`}
              className="inline-flex items-center gap-2 text-sm text-ink hover:text-accent"
            >
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              View audit log entries
            </Link>
          </div>

          <div className="rounded-3xl border border-line-soft bg-muted/30 p-6 flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Roadmap
            </span>
            <p className="text-xs text-ink-secondary leading-relaxed">
              <strong>Impersonation is disabled by default</strong> — the
              "View as customer" control only appears when an operator sets
              <code> PLATFORM_IMPERSONATION_ENABLED=1</code>. When enabled it
              sets the cookie, emits a
              <code> platform.impersonate.start</code> audit entry, and
              renders the warning banner overlay across Platform Admin OS
              pages. The middleware org_id resolution swap (so /dashboard/*
              actually loads the impersonated org's data) is a focused
              follow-up that pairs with RLS policy review.
            </p>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Stripe Customer Portal per-org link ships once 10.6.D.2.2
              (Stripe Connect per-org UI) lands.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
