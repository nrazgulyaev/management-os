import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  pending: "warn",
  paid: "ok",
  partial: "info",
  overdue: "danger",
  cancelled: "soft",
  planned: "info",
  committed: "warn",
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
        <div className="page-header">
          <div className="left">
            <h1>Land profile</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <span>Land profile</span>
          </div>
          <h1>Land profile</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Acquisition mode, lease term, sizes, due diligence, payment
            schedule, and acquisition-related costs.
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Project
          </Link>
        </div>
      </div>

      {!profile ? (
        <EmptyState
          title="No land profile yet"
          description="Set up the land profile via the upsertLandProfile server action. Detail-edit form coming in a follow-on UI polish stage; the API surface is ready today."
        />
      ) : (
        <>
          <div>
            <div className="label mb-2.5">Acquisition</div>
            <Card padding="default">
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
            </Card>
          </div>

          <div>
            <div className="label mb-2.5">Site characteristics</div>
            <Card padding="default">
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
            </Card>
          </div>

          <div>
            <div className="label mb-2.5">Due diligence</div>
            <Card padding="default">
              <div className="flex items-center gap-2 mb-2">
                <HandoffBadge tone={profile.dueDiligenceStatus === "completed" ? "ok" : "warn"}>
                  {profile.dueDiligenceStatus}
                </HandoffBadge>
                {profile.dueDiligenceCompletedAt && (
                  <span className="text-xs text-ink-tertiary">
                    Completed {profile.dueDiligenceCompletedAt}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-secondary whitespace-pre-wrap">
                {profile.dueDiligenceNotes ?? "—"}
              </p>
            </Card>
          </div>

          {schedule && (
            <div>
              <div className="label mb-2.5">
                Payment schedule · Total: {fmtUsd(schedule.schedule.totalPurchasePriceMinor)} {schedule.schedule.currency}
              </div>
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
                        <HandoffBadge tone={STATUS_TONE[inst.status] ?? "soft"}>
                          {inst.status}
                        </HandoffBadge>
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
            </div>
          )}

          {costs.length > 0 && (
            <div>
              <div className="label mb-2.5">
                Costs · {costs.length} acquisition-related cost lines
              </div>
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
                        <HandoffBadge tone={STATUS_TONE[c.status] ?? "soft"}>
                          {c.status}
                        </HandoffBadge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
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
