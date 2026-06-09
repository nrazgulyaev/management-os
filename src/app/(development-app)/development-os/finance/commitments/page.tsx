import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { inArray } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  devCostCategories,
  devTransactions,
} from "@/lib/db/schema/dev-finance";
import { projects } from "@/lib/db/schema/projects";
import { contacts } from "@/lib/db/schema/contacts";
import { getCommitmentsLedger } from "@/lib/development/server/commitments-ledger";
import {
  COMMITMENT_LEDGER_STATUS_LABEL,
  commitmentLedgerStatusTone,
} from "@/lib/development/constants/commitment-ledger-constants";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Commitments (PO) · Development OS",
};
export const dynamic = "force-dynamic";

export default async function CommitmentsLedgerPage() {
  const db = getDb();

  const rows = db
    ? await safeQuery(
        "getCommitmentsLedger",
        getCommitmentsLedger({}),
        [] as Awaited<ReturnType<typeof getCommitmentsLedger>>,
        4000,
      )
    : [];

  // Enrich with project / category / vendor names + paid totals in a few
  // set-based queries (no N+1).
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const categoryIds = [...new Set(rows.map((r) => r.categoryId))];
  const vendorIds = [
    ...new Set(rows.map((r) => r.vendorContactId).filter(Boolean) as string[]),
  ];
  const commitmentIds = rows.map((r) => r.id);

  const [projectRows, categoryRows, vendorRows, paidRows] = db
    ? await Promise.all([
        projectIds.length
          ? db
              .select({ id: projects.id, name: projects.name })
              .from(projects)
              .where(inArray(projects.id, projectIds))
          : Promise.resolve([] as { id: string; name: string }[]),
        categoryIds.length
          ? db
              .select({
                id: devCostCategories.id,
                name: devCostCategories.displayName,
              })
              .from(devCostCategories)
              .where(inArray(devCostCategories.id, categoryIds))
          : Promise.resolve([] as { id: string; name: string }[]),
        vendorIds.length
          ? db
              .select({ id: contacts.id, name: contacts.fullName })
              .from(contacts)
              .where(inArray(contacts.id, vendorIds))
          : Promise.resolve([] as { id: string; name: string }[]),
        commitmentIds.length
          ? db
              .select({
                commitmentId: devTransactions.relatedCommitmentId,
                paidUsdMinor: devTransactions.amountUsdMinor,
              })
              .from(devTransactions)
              .where(
                inArray(devTransactions.relatedCommitmentId, commitmentIds),
              )
          : Promise.resolve(
              [] as { commitmentId: string | null; paidUsdMinor: bigint }[],
            ),
      ])
    : [[], [], [], []];

  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));
  const vendorName = new Map(vendorRows.map((v) => [v.id, v.name]));
  const paidByCommitment = new Map<string, bigint>();
  for (const p of paidRows) {
    if (!p.commitmentId) continue;
    paidByCommitment.set(
      p.commitmentId,
      (paidByCommitment.get(p.commitmentId) ?? 0n) + BigInt(p.paidUsdMinor),
    );
  }

  const totalCommittedUsd = rows.reduce(
    (acc, r) => acc + BigInt(r.amountUsdMinor),
    0n,
  );
  const totalPaidUsd = [...paidByCommitment.values()].reduce(
    (acc, v) => acc + v,
    0n,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Commitments (PO)" },
        ]}
        eyebrow={
          db
            ? `${rows.length} commitments · ${formatUsdMinor(totalCommittedUsd)} committed · ${formatUsdMinor(totalPaidUsd)} paid`
            : "Database not configured"
        }
        title="Procurement commitments"
        description="Signed vendor POs / contracts (the 'Committed' state of the three-state cost ledger). Approve, record manual payments, and track paid-vs-committed as actuals land against each PO."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/development-os/finance/commitments/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New commitment
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {!db && (
        <EmptyState
          title="Commitments need the database"
          description="Database connection not configured. Contact support."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      )}

      {db && (
        <Section eyebrow="All commitments" title="Open + closed POs">
          {rows.length === 0 ? (
            <EmptyState
              title="No commitments yet"
              description="Create your first vendor PO to start tracking committed cost and manual payments."
              action={
                <Button asChild>
                  <Link href="/development-os/finance/commitments/new">
                    <Plus className="w-4 h-4" strokeWidth={1.75} />
                    New commitment
                  </Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Description</TH>
                  <TH>Project</TH>
                  <TH>Category</TH>
                  <TH>Vendor</TH>
                  <TH>Committed</TH>
                  <TH>Paid</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const paid = paidByCommitment.get(r.id) ?? 0n;
                  return (
                    <TR key={r.id}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/development-os/finance/commitments/${r.id}`}
                          className="hover:underline"
                        >
                          {r.commitmentCode}
                        </Link>
                      </TD>
                      <TD className="text-xs">{r.description}</TD>
                      <TD className="text-xs">
                        {projectName.get(r.projectId) ?? "—"}
                      </TD>
                      <TD className="text-xs">
                        {categoryName.get(r.categoryId) ?? "—"}
                      </TD>
                      <TD className="text-xs">
                        {r.vendorContactId
                          ? (vendorName.get(r.vendorContactId) ?? "—")
                          : (
                            <span className="text-ink-tertiary">No vendor</span>
                          )}
                      </TD>
                      <TDNum>
                        {formatUsdMinor(BigInt(r.amountUsdMinor))}
                      </TDNum>
                      <TDNum>{formatUsdMinor(paid)}</TDNum>
                      <TD>
                        <Badge tone={commitmentLedgerStatusTone(r.status)}>
                          {COMMITMENT_LEDGER_STATUS_LABEL[
                            r.status as keyof typeof COMMITMENT_LEDGER_STATUS_LABEL
                          ] ?? r.status}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Section>
      )}
    </DevelopmentShell>
  );
}
