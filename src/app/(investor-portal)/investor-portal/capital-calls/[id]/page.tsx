import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { ConfirmWireForm } from "@/components/investor-portal/confirm-wire-form";
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
  const overdue =
    !call.isPaid && new Date(call.dueAt).getTime() < Date.now();

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div>
        <Link
          href="/investor-portal/capital-calls"
          className="inline-flex items-center gap-1 text-xs text-ink-tertiary hover:text-ink mb-3"
        >
          <ArrowLeft className="w-3 h-3" /> Capital calls
        </Link>
        <h1 className="font-display text-2xl text-ink">
          {call.projectName ?? "Capital call"}
        </h1>
        <p className="text-sm text-ink-secondary mt-1 font-mono">
          {call.ref} · <span className="capitalize">{call.kind.replace(/_/g, " ")}</span>
        </p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Your share"
          value={formatUsdMinor(allocated)}
          hint={
            breakdown
              ? `${breakdown.mySharePercent.toFixed(2)}% of the call`
              : undefined
          }
        />
        <Stat
          label="Confirmed"
          value={formatUsdMinor(received)}
          hint={call.isPaid ? "Wire confirmed" : "Not yet confirmed"}
        />
        <Stat label="Outstanding" value={formatUsdMinor(outstanding)} />
        <Stat
          label="Due"
          value={new Date(call.dueAt).toLocaleDateString()}
          hint={
            call.isPaid ? "Settled" : overdue ? "Overdue" : "Awaiting wire"
          }
        />
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-ink-tertiary mb-3">
          Pro-rata breakdown
        </h2>
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line-soft">
              <Row
                label="Total call"
                value={
                  breakdown
                    ? formatUsdMinor(BigInt(breakdown.callTotalUsdMinor))
                    : "—"
                }
              />
              <Row
                label="Investors on this call"
                value={breakdown ? String(breakdown.investorCount) : "—"}
              />
              <Row
                label="Your pro-rata share"
                value={
                  breakdown
                    ? `${breakdown.mySharePercent.toFixed(2)}%`
                    : "—"
                }
              />
              <Row label="Your amount" value={formatUsdMinor(allocated)} />
              <Row
                label="Confirmed across all investors"
                value={
                  breakdown
                    ? formatUsdMinor(BigInt(breakdown.callReceivedUsdMinor))
                    : "—"
                }
              />
              <Row
                label="Issued"
                value={new Date(call.issuedAt).toLocaleDateString()}
              />
              {call.wireRef && (
                <Row
                  label="Your wire reference"
                  value={call.wireRef}
                  mono
                />
              )}
              {call.receivedAt && (
                <Row
                  label="Confirmed at"
                  value={new Date(call.receivedAt).toLocaleString()}
                />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-ink-tertiary mb-3">
          {call.isPaid ? "Wire" : "Confirm your wire"}
        </h2>
        {call.isPaid ? (
          <div className="rounded-md border border-success/40 bg-success-weak px-4 py-3 text-sm text-success">
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
          <div className="rounded-lg border border-line-soft bg-surface p-5">
            <ConfirmWireForm
              allocationId={call.allocationId}
              allocatedLabel={formatUsdMinor(allocated)}
            />
          </div>
        )}
      </section>
    </PortalShell>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="text-xl font-medium tabular-nums text-ink mt-1">
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-tertiary mt-1">{hint}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <tr>
      <td className="px-4 py-3 text-ink-secondary">{label}</td>
      <td
        className={`px-4 py-3 text-right tabular-nums text-ink ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}
