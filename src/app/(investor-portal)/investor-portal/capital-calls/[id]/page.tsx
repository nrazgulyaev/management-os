import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { ConfirmWireForm } from "@/components/investor-portal/confirm-wire-form";
import {
  PortalBadge,
  PortalBreakdownRow,
  PortalCard,
  PortalDetailHeader,
  PortalKpi,
  PortalSectionTitle,
} from "@/components/investor-portal/portal-primitives";
import {
  getMyCapitalCall,
  getMyCapitalCallBreakdown,
} from "@/lib/investor-portal/capital-calls-queries";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Capital call · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function CapitalCallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);

  const call = await getMyCapitalCall(id);
  if (!call) notFound();

  const breakdown = await getMyCapitalCallBreakdown(call.callId);

  const allocated = BigInt(call.allocatedUsdMinor);
  const received = BigInt(call.receivedUsdMinor);
  const outstanding = allocated > received ? allocated - received : 0n;
  const overdue = !call.isPaid && new Date(call.dueAt).getTime() < Date.now();

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle="Capital call"
    >
      <PortalDetailHeader
        backHref="/investor-portal/capital-calls"
        backLabel="Capital calls"
        title={call.projectName ?? "Capital call"}
        sub={
          <span className="font-mono text-ink-3">
            {call.ref} ·{" "}
            <span className="capitalize">{call.kind.replace(/_/g, " ")}</span>
          </span>
        }
        badge={
          <PortalBadge tone={call.isPaid ? "success" : overdue ? "danger" : "warning"}>
            {call.isPaid
              ? "Wire confirmed"
              : overdue
                ? "Overdue"
                : "Awaiting your wire"}
          </PortalBadge>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PortalKpi
          label="Your share"
          value={formatUsdMinor(allocated)}
          hint={
            breakdown
              ? `${breakdown.mySharePercent.toFixed(2)}% of the call`
              : undefined
          }
          tone={call.isPaid ? "default" : "amber"}
        />
        <PortalKpi
          label="Confirmed"
          value={formatUsdMinor(received)}
          hint={call.isPaid ? "Wire confirmed" : "Not yet confirmed"}
        />
        <PortalKpi
          label="Outstanding"
          value={formatUsdMinor(outstanding)}
        />
        <PortalKpi
          label="Due"
          value={new Date(call.dueAt).toLocaleDateString()}
          hint={call.isPaid ? "Settled" : overdue ? "Overdue" : "Awaiting wire"}
        />
      </section>

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Wire lifecycle + pro-rata breakdown */}
        <div className="flex flex-col gap-5">
          <PortalCard>
            <PortalSectionTitle title="Wire status" />
            <WireStepper isPaid={call.isPaid} />
            <p className="mt-3.5 text-[11px] leading-relaxed text-ink-4">
              Manual settlement: confirming your wire records that you have sent
              the funds. Arconique finance reconciles it against the incoming
              bank transfer — no payment is captured in the portal.
            </p>
          </PortalCard>

          <PortalCard>
            <PortalSectionTitle title="Pro-rata breakdown" />
            <PortalBreakdownRow
              label="Total call"
              value={
                breakdown
                  ? formatUsdMinor(BigInt(breakdown.callTotalUsdMinor))
                  : "—"
              }
            />
            <PortalBreakdownRow
              label="Investors on this call"
              value={breakdown ? String(breakdown.investorCount) : "—"}
            />
            <PortalBreakdownRow
              label="Your pro-rata share"
              value={
                breakdown ? `${breakdown.mySharePercent.toFixed(2)}%` : "—"
              }
            />
            <PortalBreakdownRow
              label="Confirmed across all investors"
              value={
                breakdown
                  ? formatUsdMinor(BigInt(breakdown.callReceivedUsdMinor))
                  : "—"
              }
            />
            <PortalBreakdownRow
              label="Issued"
              value={new Date(call.issuedAt).toLocaleDateString()}
            />
            {call.wireRef ? (
              <PortalBreakdownRow
                label="Your wire reference"
                value={<span className="font-mono text-xs">{call.wireRef}</span>}
              />
            ) : null}
            {call.receivedAt ? (
              <PortalBreakdownRow
                label="Confirmed at"
                value={new Date(call.receivedAt).toLocaleString()}
              />
            ) : null}
            <hr className="my-3.5 border-0 border-t border-line-soft" />
            <PortalBreakdownRow
              label="Your amount"
              value={formatUsdMinor(allocated)}
              emphasis
            />
          </PortalCard>
        </div>

        {/* Pay / confirm wire panel */}
        <PortalCard>
          <PortalSectionTitle
            title={call.isPaid ? "Wire" : "Confirm your wire"}
          />
          {call.isPaid ? (
            <div className="rounded-[10px] border border-success/40 bg-success-weak px-4 py-3 text-sm text-success">
              Your wire of {formatUsdMinor(allocated)} has been confirmed
              {call.wireRef ? (
                <>
                  {" "}
                  (ref <span className="font-mono">{call.wireRef}</span>)
                </>
              ) : null}
              . No further action is required.
            </div>
          ) : (
            <>
              <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
                Wire your pro-rata share of{" "}
                <span className="tnum font-semibold text-ink">
                  {formatUsdMinor(allocated)}
                </span>{" "}
                using the project SPV requisites, then confirm the transfer
                reference below.
              </p>
              <ConfirmWireForm
                allocationId={call.allocationId}
                allocatedLabel={formatUsdMinor(allocated)}
              />
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-line-soft bg-bg-2 px-[14px] py-2.5 text-[12px] leading-relaxed text-ink-3">
                <Download
                  className="h-[15px] w-[15px] flex-none text-ink-4"
                  strokeWidth={2}
                />
                SPV wire requisites are included in your subscription
                agreement under{" "}
                <Link
                  href="/investor-portal/documents"
                  className="font-semibold text-amber-deep hover:underline"
                >
                  Documents
                </Link>
                .
              </p>
            </>
          )}
        </PortalCard>
      </div>
    </PortalShell>
  );
}

function WireStepper({ isPaid }: { isPaid: boolean }) {
  // Two LP-visible steps. The 3rd (reconciliation) is an Arconique-side
  // action shown as "Next" until confirmed — the portal never asserts it.
  const steps = [
    { label: "Issued", done: true, active: false },
    { label: "Wire confirmed", done: isPaid, active: !isPaid },
    {
      label: "Reconciled by Arconique",
      done: false,
      active: isPaid,
    },
  ];
  return (
    <ol
      className="flex items-center gap-2 overflow-x-auto"
      aria-label="Wire lifecycle"
    >
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={[
                "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-medium",
                s.done
                  ? "bg-ok text-white"
                  : s.active
                    ? "bg-carbon text-ink-inverse"
                    : "bg-bg-2 text-ink-4",
              ].join(" ")}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <span
              className={[
                "whitespace-nowrap text-[11px]",
                s.active
                  ? "font-medium text-ink"
                  : s.done
                    ? "text-ink-2"
                    : "text-ink-4",
              ].join(" ")}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <span
              className={[
                "h-px w-6",
                s.done ? "bg-ok" : "bg-line-soft",
              ].join(" ")}
              aria-hidden
            />
          )}
        </li>
      ))}
    </ol>
  );
}
