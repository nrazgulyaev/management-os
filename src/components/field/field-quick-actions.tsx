import Link from "next/link";
import { Camera, ChevronRight, type LucideIcon } from "lucide-react";

/**
 * Field quick actions.
 *
 * Only surfaces actions that have a real, field-reachable destination.
 * The Damage report card points at the live operations damage-report
 * intake (the same route the task-detail screen deep-links to).
 *
 * Inventory-use / Purchase-request / Lost-&-found were UX-walkthrough
 * placeholders that all routed to the /field/tasks/demo mock — they have
 * no field-scoped flow yet, so they're intentionally not shown here
 * rather than linking a worker into a dead demo. Re-add them once a real
 * field flow exists for each.
 */
const actions: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}[] = [
  {
    href: "/dashboard/operations/damage-reports/new",
    icon: Camera,
    label: "Damage report",
    hint: "Photos + description",
  },
];

export function FieldQuickActions() {
  return (
    <div className="flex flex-col gap-2">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.label}
            href={a.href}
            className="rounded-md border border-line-soft bg-surface p-3 flex items-center gap-3 hover:border-line-strong active:translate-y-[1px] transition-all"
          >
            <Icon className="w-4 h-4 text-ink-secondary shrink-0" strokeWidth={1.75} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink font-medium">{a.label}</div>
              <div className="text-[11px] text-ink-tertiary">{a.hint}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-tertiary shrink-0" strokeWidth={1.75} />
          </Link>
        );
      })}
    </div>
  );
}
