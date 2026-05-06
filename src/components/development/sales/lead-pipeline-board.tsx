"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type LeadStatus,
} from "@/lib/development/server/leads-constants";
import type { LeadListItem } from "@/lib/development/types/sales";
import { LeadCard } from "./lead-card";
import { NewLeadDrawer } from "./new-lead-drawer";

const COLUMNS: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "viewing_scheduled",
  "negotiation",
  "reservation",
  "lost",
];

export interface LeadPipelineBoardProps {
  leads: LeadListItem[];
  pendingDraftsByRoleId: Record<string, number>;
  filterOptions: {
    projects: { id: string; name: string }[];
    sources: {
      code: string;
      category: string;
      id: string;
      campaignName?: string | null;
    }[];
    agents: { id: string; name: string }[];
  };
  scopedProjectId?: string | null;
  /** Hide the "+ New lead" button when rendering inside a project Sales tab. */
  showNewButton?: boolean;
}

export function LeadPipelineBoard({
  leads,
  pendingDraftsByRoleId,
  filterOptions,
  scopedProjectId,
  showNewButton = true,
}: LeadPipelineBoardProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [filterProject, setFilterProject] = React.useState<string>(
    scopedProjectId ?? "all",
  );
  const [filterSourceCategory, setFilterSourceCategory] =
    React.useState<string>("all");
  const [filterAgent, setFilterAgent] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (scopedProjectId) setFilterProject(scopedProjectId);
  }, [scopedProjectId]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (filterProject !== "all" && l.scopeProjectId !== filterProject) return false;
      if (filterSourceCategory !== "all") {
        // Inline category filter — sources list carries the category mapping.
        const src = filterOptions.sources.find((s) => s.code === l.sourceCode);
        if (src?.category !== filterSourceCategory) return false;
      }
      if (filterAgent !== "all") {
        // Match by agentDisplayName since the board doesn't expose agent ID
        // on the lead row directly. Good enough for 2.2.A; revisit when the
        // agent picker is wired through.
        if (!l.agentDisplayName) return false;
        const agent = filterOptions.agents.find((a) => a.id === filterAgent);
        if (!agent || agent.name !== l.agentDisplayName) return false;
      }
      if (!q) return true;
      return (
        l.fullName.toLowerCase().includes(q) ||
        (l.email?.toLowerCase().includes(q) ?? false) ||
        (l.phone?.toLowerCase().includes(q) ?? false) ||
        (l.projectName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [leads, filterProject, filterSourceCategory, filterAgent, query, filterOptions]);

  const grouped = React.useMemo(() => {
    const map = new Map<LeadStatus, LeadListItem[]>();
    for (const status of COLUMNS) map.set(status, []);
    for (const lead of visible) {
      const status = (LEAD_STATUSES as readonly string[]).includes(lead.status)
        ? (lead.status as LeadStatus)
        : null;
      if (!status || !map.has(status)) continue;
      map.get(status)!.push(lead);
    }
    return map;
  }, [visible]);

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {!scopedProjectId && (
              <Filter
                label="Project"
                value={filterProject}
                onChange={setFilterProject}
                options={[{ value: "all", label: "All projects" }, ...filterOptions.projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            )}
            <Filter
              label="Source"
              value={filterSourceCategory}
              onChange={setFilterSourceCategory}
              options={[
                { value: "all", label: "All sources" },
                { value: "website", label: "Website" },
                { value: "paid_ads", label: "Paid ads" },
                { value: "organic_social", label: "Organic social" },
                { value: "agent", label: "Agent" },
                { value: "referral", label: "Referral" },
                { value: "event", label: "Event" },
                { value: "cold", label: "Cold" },
                { value: "other", label: "Other" },
              ]}
            />
            <Filter
              label="Agent"
              value={filterAgent}
              onChange={setFilterAgent}
              options={[
                { value: "all", label: "All agents" },
                ...filterOptions.agents.map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, project…"
                className="w-full h-9 pl-8 pr-3 rounded-sm border border-line-soft bg-surface text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong"
              />
            </div>
            {showNewButton && (
              <Button onClick={() => setDrawerOpen(true)}>
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New lead
              </Button>
            )}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title="No leads match the filters."
            description={
              query
                ? `No matches for "${query}".`
                : "Try widening the source / agent filters or create a new lead."
            }
          />
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="flex items-start gap-3 min-w-max">
              {COLUMNS.map((status) => {
                const items = grouped.get(status) ?? [];
                return (
                  <div
                    key={status}
                    className="w-[280px] shrink-0 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-label">{LEAD_STATUS_LABEL[status]}</span>
                      <Badge tone="neutral">{items.length}</Badge>
                    </div>
                    <div className="rounded-md bg-muted/40 border border-dashed border-line-soft p-2 flex flex-col gap-2 min-h-[80px]">
                      {items.length === 0 ? (
                        <span className="text-xs text-ink-tertiary text-center py-3">
                          No leads
                        </span>
                      ) : (
                        items.map((l) => (
                          <LeadCard
                            key={l.roleId}
                            lead={l}
                            pendingDraftCount={pendingDraftsByRoleId[l.roleId] ?? 0}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <NewLeadDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        projects={filterOptions.projects}
        sources={filterOptions.sources}
        agents={filterOptions.agents}
        defaultProjectId={scopedProjectId ?? undefined}
      />
    </>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-2.5 rounded-sm border border-line-soft bg-surface text-xs text-ink",
      )}
    >
      <span className="text-ink-tertiary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm text-ink focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
