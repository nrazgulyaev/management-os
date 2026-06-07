import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Percent } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { formatDate, formatUSD } from "@/lib/utils";
import {
  getAllAuthorizationLimits,
  getDiscounts,
  getPendingDiscountApprovals,
} from "@/lib/development/server/discounts";
import { safeQuery } from "@/lib/development/safe-query";
import {
  DISCOUNT_REASON_LABEL,
  DISCOUNT_STATUS_LABEL,
} from "@/lib/development/constants/discount-constants";
import type { DiscountStatus } from "@/lib/development/types/discounts";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { DiscountApprovalActions } from "./_approval-actions";

export const metadata: Metadata = { title: "Discounts · Development OS" };
export const dynamic = "force-dynamic";

const statusTone: Record<DiscountStatus, "neutral" | "warning" | "accent" | "success" | "danger"> = {
  proposed: "neutral",
  pending_approval: "warning",
  approved: "accent",
  rejected: "danger",
  applied: "success",
  reverted: "neutral",
};

function fmtUsd(minor: bigint): string {
  return formatUSD(Number(minor) / 100);
}

function fmtPercent(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(2)}%`;
}

export default async function DiscountsPage() {
  // Stage 10.6.B.2-fix.2 — wrap each query individually so a single
  // failing loader doesn't 500 the whole page.
  const [pending, all, limits, me] = await Promise.all([
    safeQuery(
      "discounts.getPendingDiscountApprovals",
      getPendingDiscountApprovals(),
      [] as Awaited<ReturnType<typeof getPendingDiscountApprovals>>,
    ),
    safeQuery(
      "discounts.getDiscounts",
      getDiscounts(),
      [] as Awaited<ReturnType<typeof getDiscounts>>,
    ),
    safeQuery(
      "discounts.getAllAuthorizationLimits",
      getAllAuthorizationLimits(),
      [] as Awaited<ReturnType<typeof getAllAuthorizationLimits>>,
    ),
    getCurrentAppUser().catch(() => null),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Discounts" },
        ]}
        eyebrow={`${pending.length} pending approval · ${all.length} total`}
        title="Discounts"
        description="Discount proposals and approvals. Authority is role-driven — discounts above a proposer's tier escalate automatically to the next role with sufficient authority."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      <Section
        eyebrow="Authorization tiers"
        title="Who can approve what"
        description="Configured by admin. Edit tiers in /development-os/settings."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {limits.length === 0 ? (
            <EmptyState
              title="No authorization tiers seeded"
              description="Configure your discount authorization tiers in Settings to start approving discounts."
              className="col-span-full"
            />
          ) : (
            limits.map((l) => (
              <div
                key={l.id}
                className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2"
              >
                <span className="text-label">{l.roleKey}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-display text-[24px] font-medium text-ink">
                    {l.maxPercentValue === null
                      ? "Unlimited"
                      : `${l.maxPercentValue}%`}
                  </span>
                </div>
                {l.escalateToRoleKey && (
                  <span className="text-xs text-ink-tertiary">
                    Escalates to {l.escalateToRoleKey}
                  </span>
                )}
                {l.notes && (
                  <span className="text-xs text-ink-secondary leading-relaxed">
                    {l.notes}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </Section>

      {pending.length > 0 && (
        <Section
          eyebrow="Awaiting approval"
          title={`${pending.length} discount${pending.length === 1 ? "" : "s"} awaiting your review`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pending.map((d) => (
              <article
                key={d.id}
                className="rounded-md border border-warning/30 bg-warning-weak/30 p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-ink">
                      {d.contactFullName}
                    </span>
                    <span className="text-xs text-ink-tertiary">
                      {d.villaCode} · {DISCOUNT_REASON_LABEL[d.reason]}
                    </span>
                  </div>
                  <Badge tone="warning">{DISCOUNT_STATUS_LABEL[d.status]}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-label">Original</span>
                    <div className="font-mono text-ink">
                      {fmtUsd(d.appliedToOriginalPriceUsdMinor)}
                    </div>
                  </div>
                  <div>
                    <span className="text-label">Discount</span>
                    <div className="font-mono text-ink">
                      {d.discountType === "percent"
                        ? fmtPercent(d.discountPercent)
                        : fmtUsd(d.discountAmountUsdMinor ?? 0n)}
                    </div>
                  </div>
                  <div>
                    <span className="text-label">Final</span>
                    <div className="font-mono text-accent font-medium">
                      {fmtUsd(d.finalPriceUsdMinor)}
                    </div>
                  </div>
                </div>
                {d.reasonNote && (
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    {d.reasonNote}
                  </p>
                )}
                <div className="text-xs text-ink-tertiary">
                  Proposed {formatDate(d.proposedAt, "short")}
                  {d.escalatedAt && ` · escalated ${formatDate(d.escalatedAt, "short")}`}
                </div>
                {me?.id ? (
                  <DiscountApprovalActions
                    discountId={d.id}
                    approverUserId={me.id}
                  />
                ) : (
                  <span className="text-[11px] text-ink-tertiary">
                    Sign in to approve.
                  </span>
                )}
              </article>
            ))}
          </div>
        </Section>
      )}

      {all.length === 0 ? (
        <EmptyState
          icon={<Percent className="w-5 h-5" strokeWidth={1.75} />}
          title="No discounts proposed"
          description="Discounts are proposed from a contract group's detail page."
        />
      ) : (
        <Section eyebrow="History" title="All discounts">
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b border-line-soft text-left">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Buyer</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Unit</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Discount</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Final</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Reason</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-ink">{d.contactFullName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-tertiary">
                        {d.villaCode}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-secondary">
                        {d.discountType === "percent"
                          ? fmtPercent(d.discountPercent)
                          : fmtUsd(d.discountAmountUsdMinor ?? 0n)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">
                        {fmtUsd(d.finalPriceUsdMinor)}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {DISCOUNT_REASON_LABEL[d.reason]}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone[d.status]}>
                          {DISCOUNT_STATUS_LABEL[d.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}
