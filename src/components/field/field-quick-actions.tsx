import Link from "next/link";
import {
  Camera,
  Package,
  ShieldAlert,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

const actions: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}[] = [
  {
    href: "/field/tasks/demo",
    icon: Camera,
    label: "Damage report",
    hint: "Photos + description",
  },
  {
    href: "/field/tasks/demo",
    icon: Package,
    label: "Inventory use",
    hint: "Scan or pick item",
  },
  {
    href: "/field/tasks/demo",
    icon: ShoppingBag,
    label: "Purchase request",
    hint: "Send to procurement",
  },
  {
    href: "/field/tasks/demo",
    icon: ShieldAlert,
    label: "Lost & found",
    hint: "Log a found item",
  },
];

export function FieldQuickActions() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.label}
            href={a.href}
            className="rounded-md border border-line-soft bg-surface p-3 flex flex-col gap-2 hover:border-line-strong active:translate-y-[1px] transition-all"
          >
            <Icon className="w-4 h-4 text-ink-secondary" strokeWidth={1.75} />
            <div>
              <div className="text-sm text-ink font-medium">{a.label}</div>
              <div className="text-[11px] text-ink-tertiary">{a.hint}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
