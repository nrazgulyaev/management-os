import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TaskChecklist } from "@/components/field/task-checklist";

export const metadata = { title: "Turnover — Enso S2 · Demo" };

export default function TaskDemoPage() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-dashed border-line-soft bg-muted/20 p-3 text-xs text-ink-secondary flex items-center gap-2">
        <Badge tone="outline">demo</Badge>
        <span>
          This is a UX walkthrough.{" "}
          <Link href="/field" className="underline">
            Live tasks
          </Link>{" "}
          appear once you're signed in and assigned work.
        </span>
      </div>
      <TaskChecklist />
    </div>
  );
}
