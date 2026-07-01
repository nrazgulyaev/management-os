import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTurnoverPolicy } from "@/features/operations/turnover-policy";
import { hasPermission, getCurrentUserContext } from "@/features/auth/permissions";
import { TurnoverPolicyForm } from "@/components/operations/turnover-policy-form";

export const metadata: Metadata = { title: "Turnover policy · Operations" };
export const dynamic = "force-dynamic";

export default async function TurnoverPolicyPage() {
  const [policy, ctx] = await Promise.all([
    getTurnoverPolicy(),
    getCurrentUserContext(),
  ]);
  const canWrite = ctx.mode === "demo" || hasPermission(ctx, "operations.write");

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <Link href="/dashboard/operations/turnovers">Turnovers</Link> /{" "}
            <span>Policy</span>
          </div>
          <h1>Turnover policy</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Your company&apos;s standard check-out / check-in times and minimum
            cleaning window. Used by the turnover board and the same-day
            allocation SLA. Until you save a policy, the defaults (11:00 / 14:00
            / 180 min) apply.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/operations/turnovers"
            className="btn btn-secondary btn-sm inline-flex items-center gap-1"
          >
            <ArrowLeft size={14} /> Back to board
          </Link>
        </div>
      </div>

      {canWrite ? (
        <div className="max-w-[640px]">
          <TurnoverPolicyForm policy={policy} />
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-6 text-sm text-ink-3 max-w-[640px]">
          You don&apos;t have permission to change the turnover policy. The
          current company standard is{" "}
          <strong className="text-ink-1">{policy.checkoutTime}</strong> check-out
          / <strong className="text-ink-1">{policy.checkinTime}</strong>{" "}
          check-in, with a{" "}
          <strong className="text-ink-1">{policy.minTurnoverMinutes}-minute</strong>{" "}
          minimum turnover window.
        </div>
      )}
    </div>
  );
}
