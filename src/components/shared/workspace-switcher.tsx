"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronsUpDown,
  HardHat,
  Home,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceKey =
  | "management"
  | "development"
  | "owner"
  | "field";

interface Workspace {
  key: WorkspaceKey;
  name: string;
  description: string;
  href: string;
  /** Path prefix used to detect "current workspace". */
  matchPrefix: string;
  icon: LucideIcon;
  tone: "accent" | "gold" | "stone" | "sage";
}

const WORKSPACES: Workspace[] = [
  {
    key: "management",
    name: "Management OS",
    description: "Operate, report, distribute owner statements.",
    href: "/dashboard",
    matchPrefix: "/dashboard",
    icon: Building2,
    tone: "accent",
  },
  {
    key: "development",
    name: "Development OS",
    description: "Build, sell, hand over villas — full-cycle.",
    href: "/development-os",
    matchPrefix: "/development-os",
    icon: HardHat,
    tone: "gold",
  },
  {
    key: "owner",
    name: "Owner Portal",
    description: "Owner-side view of villas, calendar, statements.",
    href: "/owner",
    matchPrefix: "/owner",
    icon: Home,
    tone: "sage",
  },
  {
    key: "field",
    name: "Field App",
    description: "Field-staff app for tasks, inventory, photos.",
    href: "/field",
    matchPrefix: "/field",
    icon: KeyRound,
    tone: "stone",
  },
];

const toneIcon: Record<Workspace["tone"], string> = {
  accent: "bg-accent text-accent-contrast",
  gold: "bg-gold text-white",
  sage: "bg-data-sage text-white",
  stone: "bg-data-stone text-white",
};

function detectActive(pathname: string): Workspace {
  // Longest-match wins (so /development-os beats /development).
  const sorted = [...WORKSPACES].sort(
    (a, b) => b.matchPrefix.length - a.matchPrefix.length
  );
  return (
    sorted.find(
      (w) =>
        pathname === w.matchPrefix || pathname.startsWith(w.matchPrefix + "/")
    ) ?? WORKSPACES[0]
  );
}

export function WorkspaceSwitcher({
  className,
}: {
  className?: string;
}) {
  const pathname = usePathname() ?? "/";
  const active = detectActive(pathname);
  const [open, setOpen] = React.useState(false);
  const ActiveIcon = active.icon;
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 h-9 px-2.5 rounded-sm border border-line-soft bg-surface hover:bg-muted text-sm text-ink transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className={cn(
            "w-5 h-5 rounded-sm flex items-center justify-center",
            toneIcon[active.tone]
          )}
        >
          <ActiveIcon className="w-3 h-3" strokeWidth={2} />
        </span>
        <span className="hidden md:inline font-medium">{active.name}</span>
        <ChevronsUpDown
          className="w-3.5 h-3.5 text-ink-tertiary"
          strokeWidth={1.75}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 w-[320px] rounded-md border border-line-soft bg-surface shadow-[var(--shadow-floating)] z-50 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-line-soft">
            <span className="text-label">Switch workspace</span>
          </div>
          <ul className="py-1">
            {WORKSPACES.map((w) => {
              const Icon = w.icon;
              const isActive = w.key === active.key;
              return (
                <li key={w.key}>
                  <Link
                    href={w.href}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5 mx-1 rounded-sm transition-colors",
                      isActive
                        ? "bg-muted"
                        : "hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "w-8 h-8 rounded-sm flex items-center justify-center shrink-0 mt-0.5",
                        toneIcon[w.tone]
                      )}
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.75} />
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink truncate">
                          {w.name}
                        </span>
                        {isActive ? (
                          <Check
                            className="w-3.5 h-3.5 text-accent shrink-0"
                            strokeWidth={2}
                          />
                        ) : (
                          <ArrowRight
                            className="w-3.5 h-3.5 text-ink-tertiary shrink-0"
                            strokeWidth={1.75}
                          />
                        )}
                      </div>
                      <span className="text-xs text-ink-secondary leading-snug">
                        {w.description}
                      </span>
                      <span className="text-[10px] font-mono text-ink-tertiary mt-0.5">
                        {w.href}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
