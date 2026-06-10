import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Percent } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
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

const statusTone: Record<
  DiscountStatus,
  "ok" | "warn" | "danger" | "amber" | "soft" | undefined
> = {
  proposed: "soft",
  pending_approval: "warn",
  approved: "amber",
  rejected: "danger",
  applied: "ok",
  reverted: "soft",
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
      <div className="section-heading">
        <div className="eyebrow label">Sales · role-driven authority</div>
        <h1>
          Discounts that <em>escalate</em>.
        </h1>
        <p>
          Authority is role-driven — a discount above the proposer&apos;s tier
          escalates automatically to the next role with sufficient authority.
        </p>
      </div>

      <div className="flex justify-end mb-[22px]">
        <Link href="/development-os" className="btn btn-dark btn-sm">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Command center
        </Link>
      </div>

      {/* Authorization tiers — who can approve what */}
      <section>
        <div className="gs-card-h">
          <h3 className="text-[15px]">Authorization tiers</h3>
          <span className="meta">Who can approve what</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {limits.length === 0 ? (
            <EmptyState
              title="No authorization tiers seeded"
              description="Configure your discount authorization tiers in Settings to start approving discounts."
              className="col-span-full"
            />
          ) : (
            limits.map((l) => (
              <div key={l.id} className="card px-4 py-3.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                  {l.roleKey}
                </div>
                <div className="display text-[24px] font-medium text-ink mt-1.5">
                  {l.maxPercentValue === null
                    ? "Unlimited"
                    : `${l.maxPercentValue}%`}
                </div>
                <div className="text-[11px] text-ink-4 mt-1">
                  {l.escalateToRoleKey
                    ? `Escalates to ${l.escalateToRoleKey}`
                    : l.notes ?? "Final authority"}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Awaiting your review */}
        <section>
          <div className="gs-card-h">
            <h3 className="text-[15px]">⚠ Awaiting your review</h3>
            <span className="meta">{pending.length}</span>
          </div>
          {pending.length === 0 ? (
            <EmptyState
              title="Nothing awaiting review"
              description="Proposed discounts above a proposer's tier appear here for approval."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map((d) => (
                <article
                  key={d.id}
                  className="card px-4 py-4 flex flex-col gap-2.5 border-warning/40 bg-warning-weak/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-ink">
                        {d.contactFullName}
                      </span>
                      <span className="text-[11px] text-ink-3">
                        {d.villaCode} · {DISCOUNT_REASON_LABEL[d.reason]}
                      </span>
                    </div>
                    <HandoffBadge tone="warn">
                      {DISCOUNT_STATUS_LABEL[d.status]}
                    </HandoffBadge>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-1">
                    <div>
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-4">
                        Original
                      </div>
                      <div className="font-mono text-[14px] text-ink mt-0.5">
                        {fmtUsd(d.appliedToOriginalPriceUsdMinor)}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-4">
                        Discount
                      </div>
                      <div className="font-mono text-[14px] text-ink mt-0.5">
                        {d.discountType === "percent"
                          ? fmtPercent(d.discountPercent)
                          : fmtUsd(d.discountAmountUsdMinor ?? 0n)}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-4">
                        Final
                      </div>
                      <div className="font-mono text-[14px] text-accent mt-0.5">
                        {fmtUsd(d.finalPriceUsdMinor)}
                      </div>
                    </div>
                  </div>
                  {d.reasonNote && (
                    <p className="text-sm text-ink-3 leading-relaxed">
                      {d.reasonNote}
                    </p>
                  )}
                  <div className="text-[11px] text-ink-3">
                    Proposed {formatDate(d.proposedAt, "short")}
                    {d.escalatedAt &&
                      ` · escalated ${formatDate(d.escalatedAt, "short")}`}
                  </div>
                  {me?.id ? (
                    <DiscountApprovalActions
                      discountId={d.id}
                      approverUserId={me.id}
                    />
                  ) : (
                    <span className="text-[11px] text-ink-3">
                      Sign in to approve.
                    </span>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* History */}
        <section>
          <div className="card card-pad overflow-hidden">
            <div className="gs-card-h">
              <h3>History</h3>
              <span className="meta">All discounts</span>
            </div>
            {all.length === 0 ? (
              <EmptyState
                icon={<Percent className="w-5 h-5" strokeWidth={1.75} />}
                title="No discounts proposed"
                description="Discounts are proposed from a contract group's detail page."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Buyer</th>
                      <th>Unit</th>
                      <th className="num">Disc.</th>
                      <th className="num">Final</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.map((d) => (
                      <tr key={d.id}>
                        <td className="row-title">{d.contactFullName}</td>
                        <td className="font-mono text-[11px] text-ink-3">
                          {d.villaCode}
                        </td>
                        <td className="num">
                          {d.discountType === "percent"
                            ? fmtPercent(d.discountPercent)
                            : fmtUsd(d.discountAmountUsdMinor ?? 0n)}
                        </td>
                        <td className="num">{fmtUsd(d.finalPriceUsdMinor)}</td>
                        <td>
                          <HandoffBadge tone={statusTone[d.status]}>
                            {DISCOUNT_STATUS_LABEL[d.status]}
                          </HandoffBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </DevelopmentShell>
  );
}
