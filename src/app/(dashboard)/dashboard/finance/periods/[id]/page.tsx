import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/periods">Periods</Link> /{" "}
            <span>{period.label}</span>
          </div>
          <h1>{period.label}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {period.periodStart} → {period.periodEnd}
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <PeriodPill status={period.status} />
            {nextActions.map((a) => (
              <form key={a.next} action={async (formData: FormData) => {
                "use server";
                formData.set("id", id);
                formData.set("next", a.next);
                await setPeriodStatusAction(null, formData);
              }}>
                <button className="btn btn-secondary btn-sm" type="submit">
                  {a.label}
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Statements</div>
        <div className="mb-2.5">
          <div className="text-[14px] text-ink font-medium">
            Owner statements · {statementsForPeriod.length}
          </div>
          <div className="text-[12px] text-ink-3 mt-0.5">
            Statements created against this period.
          </div>
        </div>
        {statementsForPeriod.length === 0 ? (
          <Card padding="default">
            <div className="text-sm text-ink-tertiary">
              No statements for this period yet.
            </div>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <div className="divide-y divide-line-soft">
              {statementsForPeriod.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm text-ink font-medium">
                      {s.ownerName} · {s.villaCode ?? s.projectName ?? "—"}
                    </div>
                    <div className="text-[11px] text-ink-tertiary mt-0.5">{s.statementCode}</div>
                  </div>
                  <HandoffBadge tone={s.status === "paid" ? "ok" : s.status === "draft" ? "soft" : "info"}>
                    {s.status}
                  </HandoffBadge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
