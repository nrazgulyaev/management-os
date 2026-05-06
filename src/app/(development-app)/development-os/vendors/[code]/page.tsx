import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
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
        <PageHeader title="Vendor" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Vendors", href: "/development-os/vendors" },
          { label: vendor.vendorCode },
        ]}
        eyebrow={`${vendor.vendorCode} · ${VENDOR_TYPE_LABEL[vendor.vendorType]}`}
        title={vendor.legalName}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link
                href={`/development-os/vendors/${vendor.vendorCode}/engagements/new`}
              >
                + New engagement
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/vendors">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                All vendors
              </Link>
            </Button>
          </div>
        }
      />

      <Section eyebrow="Profile" title="Contact + performance">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="On-time delivery"
            value={
              vendor.onTimeDeliveryRate
                ? `${Number(vendor.onTimeDeliveryRate).toFixed(1)}%`
                : "—"
            }
          />
          <MetricCard
            label="Quality rating"
            value={
              vendor.qualityRating
                ? `${Number(vendor.qualityRating).toFixed(2)} / 5`
                : "—"
            }
          />
          <MetricCard
            label="Engagements"
            value={String(vendor.totalCommitmentsCount)}
            hint={`${vendor.activeEngagementCount} active`}
          />
          <MetricCard
            label="Status"
            value={VENDOR_STATUS_LABEL[vendor.status]}
            hint={vendor.lastEngagementAt ?? undefined}
          />
          <MetricCard
            label="Invoices"
            value={String(vendorInvoices.length)}
            hint={
              vendorInvoices.length > 0
                ? `${fmtUsd(outstandingMinor)} outstanding`
                : "—"
            }
          />
        </div>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <Field label="Email" value={vendor.primaryEmail ?? "—"} mono />
          <Field label="Phone" value={vendor.primaryPhone ?? "—"} />
          <Field label="WhatsApp" value={vendor.whatsappPhone ?? "—"} />
        </div>
      </Section>

      <Section
        eyebrow="Invoices"
        title={`Linked invoices (${vendorInvoices.length})`}
        description="Invoices assigned to this vendor. Outstanding amounts roll up to the snapshot above."
      >
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
                    <Badge tone="neutral">{i.status}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section eyebrow="Engagements" title="Project assignments">
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
                    <Badge
                      tone={
                        e.status === "active"
                          ? "success"
                          : e.status === "completed"
                            ? "neutral"
                            : e.status === "terminated"
                              ? "danger"
                              : "warning"
                      }
                    >
                      {ENGAGEMENT_STATUS_LABEL[e.status]}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
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
