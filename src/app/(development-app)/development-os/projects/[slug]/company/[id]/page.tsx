import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getCompanyStructure } from "@/lib/development/server/company-structure/company-queries";
import {
  ActivateStructure,
  AddShareholder,
  EditShareholderOwnership,
} from "./_controls";

export const metadata: Metadata = { title: "Company structure · Development OS" };
export const dynamic = "force-dynamic";

export default async function CompanyStructureDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Company structure</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getCompanyStructure(id);
  if (!data) notFound();
  const { structure, shareholders } = data;

  const sumPct = shareholders.reduce(
    (acc, s) => acc + Number(s.ownershipPercentage),
    0,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>Project</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/company`}>
              Company structure
            </Link>{" "}
            / <span>{structure.structureLabel}</span>
          </div>
          <h1>{structure.structureLabel}</h1>
          {structure.companyName && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {structure.companyName}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/company`}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All structures
          </Link>
        </div>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Identity</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Type" value={structure.structureType} />
          <Field label="Status" value={structure.registrationStatus} />
          <Field label="Active" value={structure.isActive ? "yes" : "no"} />
          <Field label="Country" value={structure.country ?? "—"} />
          <Field label="Region" value={structure.region ?? "—"} />
          <Field
            label="Reg. number"
            value={structure.companyRegistrationNumber ?? "—"}
            mono
          />
          <Field label="Reg. date" value={structure.registrationDate ?? "—"} />
          <Field
            label="Setup cost"
            value={
              structure.setupCostMinor != null
                ? `$${(Number(structure.setupCostMinor) / 100).toLocaleString()} ${structure.setupCurrency}`
                : "—"
            }
          />
          <Field
            label="Legal consultant"
            value={structure.responsibleLegalConsultant ?? "—"}
          />
          </div>
        </Card>
      </div>

      <div className="mt-[18px]">
        <div className="label mb-2.5">Lifecycle</div>
        <Card padding="default">
          <ActivateStructure
            projectId={structure.projectId}
            structureId={structure.id}
            slug={slug}
            isActive={structure.isActive}
          />
        </Card>
      </div>

      <div className="mt-[18px]">
        <div className="flex items-center justify-between mb-2.5">
          <div className="label">Ownership</div>
          <AddShareholder structureId={structure.id} slug={slug} />
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Type</TH>
              <TH>Display name</TH>
              <TH>Ownership %</TH>
              <TH>Role</TH>
              <TH>Managing</TH>
              <TH>Edit</TH>
            </TR>
          </THead>
          <TBody>
            {shareholders.map((s) => (
              <TR key={s.id}>
                <TD className="text-xs">{s.shareholderType}</TD>
                <TD className="text-sm">{s.displayName}</TD>
                <TDNum>{Number(s.ownershipPercentage).toFixed(2)}%</TDNum>
                <TD className="text-xs">{s.roleInCompany ?? "—"}</TD>
                <TD>
                  {s.isManagingParty ? (
                    <HandoffBadge tone="info">managing</HandoffBadge>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  <EditShareholderOwnership
                    shareholderId={s.id}
                    structureId={structure.id}
                    slug={slug}
                    currentPercentage={Number(s.ownershipPercentage)}
                    currentRole={s.roleInCompany}
                    currentManaging={s.isManagingParty}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="text-[11px] text-ink-tertiary mt-2">
          Shareholders ({shareholders.length}) — sum check {sumPct.toFixed(2)}%.
          DB trigger enforces shareholder ownership sums to exactly 100% at COMMIT.
        </p>
      </div>

      {structure.notes && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Notes</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary whitespace-pre-wrap">
              {structure.notes}
            </p>
          </Card>
        </div>
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
