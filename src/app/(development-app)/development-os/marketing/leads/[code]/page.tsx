import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadLeadByCode } from "@/lib/development/server/marketing/lead-detail-queries";
import { formatMoneyMinor } from "@/lib/money";
import { LeadLifecycleControl } from "./_lifecycle-control";

export const metadata: Metadata = { title: "Lead · Marketing" };
export const dynamic = "force-dynamic";

const LIFECYCLE_TONE: Record<
  string,
  "ok" | "warn" | "amber" | "info" | "soft"
> = {
  contract: "ok",
  reservation: "ok",
  hot: "amber",
  qualified: "info",
  lead: "soft",
  lost: "warn",
  disqualified: "warn",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const lead = await loadLeadByCode(code);
  if (!lead) notFound();

  const value =
    lead.estimatedValueMinor && lead.estimatedValueMinor !== "0"
      ? formatMoneyMinor(Number(lead.estimatedValueMinor), lead.currency || "IDR")
      : "—";

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> /{" "}
            <Link href="/development-os/marketing/leads">Leads</Link> /{" "}
            <span>{lead.leadCode}</span>
          </div>
          <h1>{lead.contactName || lead.leadCode}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px] font-mono">
            {lead.leadCode}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/leads"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Lifecycle</div>
        <Card padding="default">
          <div className="flex items-center gap-2 mb-3">
            <HandoffBadge tone={LIFECYCLE_TONE[lead.lifecycleStatus] ?? "soft"}>
              {lead.lifecycleStatus}
            </HandoffBadge>
            <span className="font-mono text-[10px] text-ink-tertiary">
              changed {fmtDate(lead.lifecycleStatusChangedAt)}
            </span>
          </div>
          <LeadLifecycleControl
            leadCode={lead.leadCode}
            status={lead.lifecycleStatus}
          />
        </Card>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Attribution</div>
        <Card padding="default">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="Source" value={lead.sourceLabel || lead.leadSourceKey || "—"} />
            <Row label="Campaign" value={lead.campaignCode || "—"} mono />
            <Row label="UTM source" value={lead.utmSource || "—"} mono />
            <Row label="UTM medium" value={lead.utmMedium || "—"} mono />
            <Row label="UTM campaign" value={lead.utmCampaign || "—"} mono />
            <Row label="Estimated value" value={value} mono />
          </dl>
        </Card>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Contact</div>
        <Card padding="default">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="Name" value={lead.contactName || "—"} />
            <Row label="Email" value={lead.contactEmail || "—"} mono />
            <Row label="Phone" value={lead.contactPhone || "—"} mono />
            <Row label="Created" value={fmtDate(lead.createdAt)} />
          </dl>
        </Card>
      </div>

      {lead.notes && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Notes</div>
          <Card padding="default">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {lead.notes}
            </p>
          </Card>
        </div>
      )}
    </DevelopmentShell>
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
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-ink" : "text-ink"}>{value}</dd>
    </div>
  );
}
