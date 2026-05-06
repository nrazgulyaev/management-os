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
import { getCompanyStructure } from "@/lib/development/server/company-structure/company-queries";

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
        <PageHeader title="Company structure" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          {
            label: "Project",
            href: `/development-os/projects/${slug}`,
          },
          {
            label: "Company structure",
            href: `/development-os/projects/${slug}/company`,
          },
          { label: structure.structureLabel },
        ]}
        eyebrow={`${structure.structureType} · ${structure.registrationStatus}`}
        title={structure.structureLabel}
        description={structure.companyName ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/company`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All structures
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Identity" title="Company">
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
      </Section>

      <Section
        eyebrow="Ownership"
        title={`Shareholders (${shareholders.length}) — sum check ${sumPct.toFixed(2)}%`}
      >
        <Table>
          <THead>
            <TR>
              <TH>Type</TH>
              <TH>Display name</TH>
              <TH>Ownership %</TH>
              <TH>Role</TH>
              <TH>Managing</TH>
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
                    <Badge tone="info">managing</Badge>
                  ) : (
                    "—"
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="text-[11px] text-ink-tertiary mt-2">
          DB trigger enforces shareholder ownership sums to exactly 100% at COMMIT.
        </p>
      </Section>

      {structure.notes && (
        <Section eyebrow="Notes" title="Operator notes">
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">
            {structure.notes}
          </p>
        </Section>
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
