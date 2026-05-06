import * as React from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "./development-shell";
import { resolveIcon } from "./icon-registry";

/**
 * Stage 1 placeholder for Development OS sub-modules. Real pages replace
 * this in the wave that owns them.
 */
export function ModulePlaceholder({
  iconKey,
  title,
  description,
  status = "next",
  upcoming,
  stageTarget,
}: {
  iconKey: string;
  title: string;
  description: string;
  status?: "next" | "roadmap";
  upcoming: string[];
  stageTarget?: string;
}) {
  const Icon = resolveIcon(iconKey) as LucideIcon;
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: title },
        ]}
        eyebrow={
          stageTarget
            ? `Stage ${stageTarget} · planned`
            : status === "next"
              ? "Next wave · stage 2"
              : "On the roadmap"
        }
        title={title}
        description={description}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to command center
            </Link>
          </Button>
        }
      />

      <EmptyState
        icon={<Icon className="w-5 h-5" strokeWidth={1.75} />}
        title="Module not yet built"
        description="This surface is scoped and queued. The list below is what will be inside when this page ships."
        action={
          <Badge tone={status === "next" ? "gold" : "neutral"}>
            {stageTarget ? `Stage ${stageTarget}` : status === "next" ? "Building next" : "Planned"}
          </Badge>
        }
      />

      <section className="rounded-md border border-line-soft bg-surface p-6">
        <div className="flex flex-col gap-4">
          <span className="text-label">What's coming</span>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {upcoming.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-ink-secondary"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </DevelopmentShell>
  );
}
