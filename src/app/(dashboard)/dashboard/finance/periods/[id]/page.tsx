import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PeriodPill } from "@/components/finance/period-pill";
import { getStatementPeriodById, listOwnerStatements } from "@/features/finance/services";
import { setPeriodStatusAction } from "@/features/finance/actions";

export const metadata = { title: "Period" };
export const dynamic = "force-dynamic";

export default async function PeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const period = await getStatementPeriodById(id);
  if (!period) notFound();

  const allStatements = await listOwnerStatements();
  const statementsForPeriod = allStatements.filter((s) => s.periodId === id);

  const nextActions: { next: "open" | "closing" | "closed" | "locked"; label: string }[] =
    period.status === "open"
      ? [{ next: "closing", label: "Begin closing" }]
      : period.status === "closing"
        ? [
            { next: "closed", label: "Mark closed" },
            { next: "open", label: "Reopen" },
          ]
        : period.status === "closed"
          ? [{ next: "locked", label: "Lock permanently" }]
          : [];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Periods", href: "/dashboard/finance/periods" },
          { label: period.label },
        ]}
        eyebrow="Period"
        title={period.label}
        description={`${period.periodStart} → ${period.periodEnd}`}
        actions={
          <div className="flex items-center gap-2">
            <PeriodPill status={period.status} />
            {nextActions.map((a) => (
              <form key={a.next} action={async (formData: FormData) => {
                "use server";
                formData.set("id", id);
                formData.set("next", a.next);
                await setPeriodStatusAction(null, formData);
              }}>
                <Button size="sm" variant="secondary" type="submit">
                  {a.label}
                </Button>
              </form>
            ))}
          </div>
        }
      />

      <Section
        eyebrow="Statements"
        title={`Owner statements · ${statementsForPeriod.length}`}
        description="Statements created against this period."
      >
        {statementsForPeriod.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-soft p-6 text-sm text-ink-tertiary">
            No statements for this period yet.
          </div>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {statementsForPeriod.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm text-ink font-medium">
                    {s.ownerName} · {s.villaCode ?? s.projectName ?? "—"}
                  </div>
                  <div className="text-[11px] text-ink-tertiary mt-0.5">{s.statementCode}</div>
                </div>
                <Badge tone={s.status === "paid" ? "success" : s.status === "draft" ? "neutral" : "info"}>
                  {s.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
