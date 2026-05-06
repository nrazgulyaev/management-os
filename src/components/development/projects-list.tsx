"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search, X, Pencil, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatUSD } from "@/lib/utils";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import type { DevelopmentProjectListItem } from "@/lib/development/types/projects";
import { NewProjectDrawer } from "./new-project-drawer";
import { EntityModal } from "@/components/forms/entity-modal";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { ProjectForm, type ProjectFormDefaults } from "@/features/projects/form";
import { archiveProjectAction } from "@/features/projects/actions";

const filters = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "planning", label: "Planning" },
  { key: "completed", label: "Completed" },
] as const;

type FilterKey = (typeof filters)[number]["key"];

function fmtMinor(minor: bigint, currency: string): string {
  const major = Number(minor) / 100;
  if (currency === "USD" || currency === "EUR") return formatUSD(major);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(major);
}

const phaseFilterMatch: Record<FilterKey, (phase: string) => boolean> = {
  all: () => true,
  active: (p) => p === "under_construction" || p === "fit_out",
  planning: (p) => p === "permitting" || p === "design" || p === "pre_acquisition" || p === "acquisition",
  completed: (p) => p === "managed" || p === "handover" || p === "archived",
};

export function ProjectsList({
  projects,
}: {
  projects: DevelopmentProjectListItem[];
}) {
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [query, setQuery] = React.useState("");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DevelopmentProjectListItem | null>(
    null,
  );
  const [archiving, setArchiving] =
    React.useState<DevelopmentProjectListItem | null>(null);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (!phaseFilterMatch[filter](p.phase)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
      );
    });
  }, [filter, query, projects]);

  const editingDefaults: ProjectFormDefaults | undefined = editing
    ? {
        id: editing.id,
        slug: editing.slug,
        name: editing.name,
        location: editing.location,
      }
    : undefined;

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-sm bg-muted/60 border border-line-soft p-0.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-3 h-8 text-xs font-medium rounded-sm transition-colors",
                  filter === f.key
                    ? "bg-surface text-ink shadow-[var(--shadow-flat)]"
                    : "text-ink-secondary hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="relative max-w-xs w-full">
              <Search
                className="w-3.5 h-3.5 text-ink-tertiary absolute left-3 top-1/2 -translate-y-1/2"
                strokeWidth={1.75}
                aria-hidden
              />
              <input
                type="search"
                placeholder="Search by name, location, slug…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-8 rounded-sm border border-line-soft bg-surface text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              )}
            </div>

            <Button onClick={() => setDrawerOpen(true)}>
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New project
            </Button>
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title="No projects match this filter."
            description={
              query
                ? `Nothing matches "${query}". Try clearing the search.`
                : "Switch the filter or create the first project for this view."
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((p) => (
              <ProjectListCard
                key={p.id}
                project={p}
                onEdit={() => setEditing(p)}
                onArchive={() => setArchiving(p)}
              />
            ))}
          </div>
        )}
      </div>

      <NewProjectDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <EntityModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : "Edit project"}
        size="lg"
      >
        {editing && (
          <ProjectForm
            mode="edit"
            defaults={editingDefaults}
            cancelHref={`${DEVELOPMENT_APP_PATH}/projects`}
          />
        )}
      </EntityModal>

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title={archiving ? `Archive ${archiving.name}?` : "Archive project?"}
        description="The project will be hidden from the active list. You can restore it later from the Archived filter."
        confirmLabel="Archive"
        action={archiveProjectAction}
        hiddenFields={archiving ? { id: archiving.id } : {}}
        onSuccess={() => setArchiving(null)}
      />
    </>
  );
}

function ProjectListCard({
  project,
  onEdit,
  onArchive,
}: {
  project: DevelopmentProjectListItem;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const totalBudgetMajor = Number(project.totalBudgetMinor) / 100;
  const usedMajor = Number(project.budgetUsedMinor) / 100;
  const budgetPct =
    totalBudgetMajor > 0 ? Math.round((usedMajor / totalBudgetMajor) * 100) : 0;

  // Stop the parent <Link> from navigating when an action button is clicked.
  function rowAction(handler: () => void) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    };
  }

  return (
    <Link
      href={`${DEVELOPMENT_APP_PATH}/projects/${project.slug}`}
      className="group block rounded-md border border-line-soft bg-surface overflow-hidden hover:border-line-strong hover:shadow-[var(--shadow-raised)] transition-all relative"
    >
      <div className="h-20 w-full" style={{ background: project.heroToken }} aria-hidden />
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={rowAction(onEdit)}
          className="bg-surface/95 backdrop-blur-sm border border-line-soft rounded-sm w-8 h-8 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-8 md:h-8 inline-flex items-center justify-center text-ink-secondary hover:text-ink hover:border-line-strong"
          aria-label={`Edit ${project.name}`}
          data-testid="project-card-edit"
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={rowAction(onArchive)}
          className="bg-surface/95 backdrop-blur-sm border border-line-soft rounded-sm w-8 h-8 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-8 md:h-8 inline-flex items-center justify-center text-ink-secondary hover:text-danger hover:border-danger/50"
          aria-label={`Archive ${project.name}`}
          data-testid="project-card-archive"
        >
          <Archive className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="text-base font-medium text-ink truncate">{project.name}</h3>
            <p className="text-xs text-ink-tertiary truncate">{project.location}</p>
          </div>
          <PhaseBadge phase={project.phase} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-tertiary">Construction</span>
            <span className="font-mono tabular-nums text-ink">
              {project.constructionProgressPct}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-accent"
              style={{ width: `${project.constructionProgressPct}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-tertiary">Units</dt>
            <dd className="font-mono tabular-nums text-ink">
              {project.unitsSold} / {project.units}
            </dd>
            <dd className="text-[11px] text-ink-tertiary">contracted / total</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-tertiary">Budget used</dt>
            <dd className="font-mono tabular-nums text-ink">
              {fmtMinor(project.budgetUsedMinor, project.currency)}
            </dd>
            <dd className="text-[11px] text-ink-tertiary">{budgetPct}% of plan</dd>
          </div>
        </dl>

        <div className="flex items-center justify-between text-xs text-ink-tertiary">
          <span className="font-mono">{project.slug}</span>
          <Badge tone={project.source === "db" ? "success" : "gold"}>
            {project.source === "db" ? "Live" : "Demo"}
          </Badge>
        </div>
      </div>
    </Link>
  );
}

const phaseTone: Record<string, "accent" | "gold" | "warning" | "neutral"> = {
  pre_acquisition: "neutral",
  acquisition: "neutral",
  design: "neutral",
  permitting: "warning",
  pre_construction: "neutral",
  under_construction: "accent",
  fit_out: "accent",
  handover: "gold",
  managed: "gold",
  archived: "neutral",
};

const phaseLabel: Record<string, string> = {
  pre_acquisition: "Pre-acquisition",
  acquisition: "Acquisition",
  design: "Design",
  permitting: "Permitting",
  pre_construction: "Pre-construction",
  under_construction: "Under construction",
  fit_out: "Fit-out",
  handover: "Handover",
  managed: "Managed",
  archived: "Archived",
};

function PhaseBadge({ phase }: { phase: string }) {
  return (
    <Badge tone={phaseTone[phase] ?? "neutral"}>
      {phaseLabel[phase] ?? phase}
    </Badge>
  );
}
