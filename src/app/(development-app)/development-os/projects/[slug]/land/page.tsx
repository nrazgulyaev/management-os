import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import {
  getLandProfileByProject,
  getLandPaymentSchedule,
  getLandTransactionCosts,
} from "@/lib/development/server/land/land-actions";
import { safeQuery } from "@/lib/development/safe-query";
import { InstallmentPay } from "./_installment-pay";

export const metadata: Metadata = { title: "Land profile · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  pending: "warning",
  paid: "success",
  partial: "info",
  overdue: "danger",
  cancelled: "neutral",
  planned: "info",
  committed: "warning",
};

function fmtUsd(b: bigint | string | number | null): string {
  if (b == null) return "—";
  const n = typeof b === "bigint" ? Number(b) : Number(b);
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function LandProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Land profile" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const projectId = project.realProjectId;

  const profile = await safeQuery(
    "getLandProfileByProject",
    getLandProfileByProject(projectId),
    null,
    4000,
  );
  const schedule = profile
    ? await safeQuery(
        "getLandPaymentSchedule",
        getLandPaymentSchedule(profile.id),
        null,
        4000,
      )
    : null;
  const costs = profile
    ? await safeQuery(
        "getLandTransactionCosts",
        getLandTransactionCosts(profile.id),
        [],
        4000,
      )
    : [];

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Land profile" },
        ]}
        eyebrow={profile ? profile.acquisitionMode : "No profile yet"}
        title="Land profile"
        description="Acquisition mode, lease term, sizes, due diligence, payment schedule, and acquisition-related costs."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Project
            </Link>
          </Button>
        }
      />

      {!profile ? (
        <EmptyState
          title="No land profile yet"
          description="Set up the land profile via the upsertLandProfile server action. Detail-edit form coming in a follow-on UI polish stage; the API surface is ready today."
        />
      ) : (
        <>
          <Section eyebrow="Acquisition" title="Mode + dates">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <Field label="Mode" value={profile.acquisitionMode} />
              <Field label="Acquisition date" value={profile.acquisitionDate ?? "—"} />
              <Field
                label="Certificate ref"
                value={profile.landCertificateReference ?? "—"}
                mono
              />
              <Field label="Lease start" value={profile.leaseStartDate ?? "—"} />
              <Field label="Lease expiry" value={profile.leaseExpiryDate ?? "—"} />
              <Field
                label="Lease tenure"
                value={
                  profile.leaseTenureYears != null
                    ? `${profile.leaseTenureYears} years`
                    : "—"
                }
              />
            </div>
          </Section>

          <Section eyebrow="Site characteristics" title="Sizes + zoning">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <Field
                label="Total sqm"
                value={profile.totalLandSizeSqm ?? "—"}
              />
              <Field
                label="Net usable sqm"
                value={profile.netUsableLandAreaSqm ?? "—"}
              />
              <Field
                label="Per unit sqm"
                value={profile.landPerUnitSqm ?? "—"}
              />
              <Field
                label="Zoning"
                value={profile.zoningClassification ?? "—"}
              />
              <Field
                label="Topography"
                value={profile.topographyNotes ?? "—"}
              />
              <Field
                label="Soil notes"
                value={profile.soilGeotechnicalNotes ?? "—"}
              />
            </div>
          </Section>

          <Section eyebrow="Due diligence" title="Status + notes">
            <div className="flex items-center gap-2 mb-2">
              <Badge tone={profile.dueDiligenceStatus === "completed" ? "success" : "warning"}>
                {profile.dueDiligenceStatus}
              </Badge>
              {profile.dueDiligenceCompletedAt && (
                <span className="text-xs text-ink-tertiary">
                  Completed {profile.dueDiligenceCompletedAt}
                </span>
              )}
            </div>
            <p className="text-sm text-ink-secondary whitespace-pre-wrap">
              {profile.dueDiligenceNotes ?? "—"}
            </p>
          </Section>

          {schedule && (
            <Section
              eyebrow="Payment schedule"
              title={`Total: ${fmtUsd(schedule.schedule.totalPurchasePriceMinor)} ${schedule.schedule.currency}`}
            >
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Due</TH>
                    <TH>Amount</TH>
                    <TH>Status</TH>
                    <TH>Paid date</TH>
                    <TH>Paid amount</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {schedule.installments.map((inst) => (
                    <TR key={inst.id}>
                      <TD className="text-xs">{inst.installmentNumber}</TD>
                      <TD className="text-xs">{inst.dueDate}</TD>
                      <TDNum>{fmtUsd(inst.amountMinor)}</TDNum>
                      <TD>
                        <Badge tone={STATUS_TONE[inst.status] ?? "neutral"}>
                          {inst.status}
                        </Badge>
                      </TD>
                      <TD className="text-xs">{inst.paidDate ?? "—"}</TD>
                      <TDNum>
                        {inst.paidAmountMinor != null
                          ? fmtUsd(inst.paidAmountMinor)
                          : "—"}
                      </TDNum>
                      <TD>
                        <InstallmentPay
                          installmentId={inst.id}
                          slug={slug}
                          amountMinor={String(inst.amountMinor)}
                          currency={schedule.schedule.currency}
                          status={inst.status}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Section>
          )}

          {costs.length > 0 && (
            <Section eyebrow="Costs" title={`${costs.length} acquisition-related cost lines`}>
              <Table>
                <THead>
                  <TR>
                    <TH>Type</TH>
                    <TH>Label</TH>
                    <TH>Planned</TH>
                    <TH>Actual</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {costs.map((c) => (
                    <TR key={c.id}>
                      <TD className="text-xs">{c.costType}</TD>
                      <TD className="text-sm">{c.costLabel}</TD>
                      <TDNum>{c.plannedAmountMinor != null ? fmtUsd(c.plannedAmountMinor) : "—"}</TDNum>
                      <TDNum>{c.actualAmountMinor != null ? fmtUsd(c.actualAmountMinor) : "—"}</TDNum>
                      <TD>
                        <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                          {c.status}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Section>
          )}
        </>
      )}
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
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs break-all" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
