import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getVendor,
  getVendorEngagements,
} from "@/lib/development/server/vendors";
import { listInvoices } from "@/lib/development/server/invoices/invoice-actions";
import {
  ENGAGEMENT_STATUS_LABEL,
  VENDOR_TYPE_LABEL,
  VENDOR_STATUS_LABEL,
} from "@/lib/development/constants/vendor-constants";

export const metadata: Metadata = { title: "Vendor · Development OS" };
export const dynamic = "force-dynamic";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Vendor</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const vendor = await getVendor(decodeURIComponent(code));
  if (!vendor) notFound();

  const [engagements, vendorInvoices] = await Promise.all([
    getVendorEngagements({ vendorId: vendor.id }),
    listInvoices({ vendorId: vendor.id, limit: 50 }),
  ]);

  const outstandingMinor = vendorInvoices.reduce(
    (s, i) => s + BigInt(i.outstandingMinor ?? "0"),
    0n,
  );
  const fmtUsd = (b: bigint) =>
    `$${(Number(b) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/vendors">Vendors</Link> /{" "}
            <span>{vendor.vendorCode}</span>
            {" · "}
            {VENDOR_TYPE_LABEL[vendor.vendorType]}
          </div>
          <h1>{vendor.legalName}</h1>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/vendors/${vendor.vendorCode}/engagements/new`}
            className="btn btn-accent btn-sm"
          >
            + New engagement
          </Link>
          <Link
            href="/development-os/vendors"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All vendors
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Profile</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            label="On-time delivery"
            value={
              vendor.onTimeDeliveryRate
                ? `${Number(vendor.onTimeDeliveryRate).toFixed(1)}%`
                : "—"
            }
          />
          <Kpi
            label="Quality rating"
            value={
              vendor.qualityRating
                ? `${Number(vendor.qualityRating).toFixed(2)} / 5`
                : "—"
            }
          />
          <Kpi
            label="Engagements"
            value={String(vendor.totalCommitmentsCount)}
            sub={`${vendor.activeEngagementCount} active`}
          />
          <Kpi
            label="Status"
            value={VENDOR_STATUS_LABEL[vendor.status]}
            sub={vendor.lastEngagementAt ?? undefined}
          />
          <Kpi
            label="Invoices"
            value={String(vendorInvoices.length)}
            sub={
              vendorInvoices.length > 0
                ? `${fmtUsd(outstandingMinor)} outstanding`
                : "—"
            }
          />
        </div>
        <Card padding="default" className="mt-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <Field label="Email" value={vendor.primaryEmail ?? "—"} mono />
            <Field label="Phone" value={vendor.primaryPhone ?? "—"} />
            <Field label="WhatsApp" value={vendor.whatsappPhone ?? "—"} />
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Invoices</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Invoices assigned to this vendor. Outstanding amounts roll up to the
          snapshot above.
        </p>
        {vendorInvoices.length === 0 ? (
          <EmptyState
            title="No invoices linked to this vendor"
            description="When a vendor invoice is created, it will appear here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Issue date</TH>
                <TH>Due date</TH>
                <TH>Total</TH>
                <TH>Outstanding</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {vendorInvoices.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/finance/invoices/${i.id}`}
                      className="hover:underline"
                    >
                      {i.invoiceNumber}
                    </Link>
                  </TD>
                  <TD className="text-xs">{i.issueDate}</TD>
                  <TD className="text-xs">{i.dueDate}</TD>
                  <TD className="text-xs tabular-nums">
                    {fmtUsd(BigInt(i.totalMinor ?? "0"))}
                  </TD>
                  <TD className="text-xs tabular-nums">
                    {fmtUsd(BigInt(i.outstandingMinor ?? "0"))}
                  </TD>
                  <TD>
                    <HandoffBadge tone="soft">{i.status}</HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Engagements</div>
        {engagements.length === 0 ? (
          <EmptyState
            title="No engagements"
            description="When this vendor is assigned to a project, the engagement will appear here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Project</TH>
                <TH>Scope</TH>
                <TH>Start</TH>
                <TH>Expected end</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {engagements.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs">{e.engagementCode}</TD>
                  <TD className="text-sm">{e.projectName}</TD>
                  <TD className="text-xs">{e.scopeDescription}</TD>
                  <TD className="text-xs">{e.startDate}</TD>
                  <TD className="text-xs">{e.expectedEndDate ?? "—"}</TD>
                  <TD>
                    <HandoffBadge
                      tone={
                        e.status === "active"
                          ? "ok"
                          : e.status === "completed"
                            ? "soft"
                            : e.status === "terminated"
                              ? "danger"
                              : "warn"
                      }
                    >
                      {ENGAGEMENT_STATUS_LABEL[e.status]}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}
