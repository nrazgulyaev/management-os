import { PageHeader } from "@/components/ui/page-header";
import { OperationsBoard } from "@/components/dashboard/operations-board";
import { Section } from "@/components/ui/section";
import { preventiveTasks } from "@/lib/mock/operations";
import { Button } from "@/components/ui/button";
import { Calendar, Plus } from "lucide-react";

export const metadata = { title: "Operations" };

export default function OperationsBoardPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Operations" }]}
        title="Operations"
        description="Villa status, housekeeping, maintenance, preventive — the full operating picture across the portfolio."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary">
              <Calendar className="w-4 h-4" strokeWidth={1.75} />
              Rotas
            </Button>
            <Button>
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New task
            </Button>
          </div>
        }
      />

      <OperationsBoard />

      <Section
        eyebrow="Preventive"
        title="Upcoming preventive maintenance"
        description="Scheduled inspections and services across projects."
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          <div className="divide-y divide-line-soft">
            {preventiveTasks.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 p-5 hover:bg-muted/30 transition-colors"
              >
                <div>
                  <div className="text-sm text-ink font-medium">{p.task}</div>
                  <div className="text-xs text-ink-tertiary mt-0.5">
                    {p.scope} · {p.cadence}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-ink-tertiary">
                    {p.assignee ?? "Unassigned"}
                  </div>
                  <div className="text-sm font-mono tabular-nums text-ink mt-0.5">
                    Due in {p.dueIn}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
