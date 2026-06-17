"use client";

/**
 * AI-agents cabinet — project-memory management island.
 *
 * Two surfaces previously missing from the read-only memory page:
 *   · "New memory item" form  → ingestMemoryItem (runs conflict
 *     detection server-side, then inserts / bumps / supersedes).
 *   · per-row Archive          → archiveMemoryItem.
 *   · a type + free-text filter over the visible rows.
 *
 * Both actions are org-scoped "use server" RPCs; we never pass an org.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Plus } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ingestMemoryItem,
  archiveMemoryItem,
} from "@/lib/development/server/ai-memory/memory-actions";

const MEMORY_TYPES = [
  "decision_summary",
  "supplier_pattern",
  "cost_pattern",
  "schedule_pattern",
  "team_observation",
  "risk_observation",
  "communication_pattern",
  "product_specification",
  "site_condition",
  "regulatory_note",
  "design_evolution",
  "quality_observation",
  "general_lesson_learned",
] as const;

const CONFIDENCE = ["low", "medium", "high"] as const;

export interface MemoryRow {
  id: string;
  memoryType: string;
  title: string;
  summary: string;
  confidenceLevel: string | null;
  observedCount: number;
  lastObservedAt: string | null;
  sourceType: string;
}

export interface MemoryProjectOption {
  id: string;
  name: string;
}

export function MemoryManager({
  rows,
  projects,
}: {
  rows: MemoryRow[];
  projects: MemoryProjectOption[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = React.useState<string>("");
  const [textFilter, setTextFilter] = React.useState<string>("");

  // Form state
  const [projectId, setProjectId] = React.useState<string>(
    projects[0]?.id ?? "",
  );
  const [memoryType, setMemoryType] = React.useState<string>(MEMORY_TYPES[0]);
  const [confidence, setConfidence] =
    React.useState<(typeof CONFIDENCE)[number]>("medium");
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [detail, setDetail] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter && r.memoryType !== typeFilter) return false;
      if (q && !`${r.title} ${r.summary}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, typeFilter, textFilter]);

  function resetForm() {
    setTitle("");
    setSummary("");
    setDetail("");
    setMemoryType(MEMORY_TYPES[0]);
    setConfidence("medium");
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!projectId) {
      setError("Pick a project first.");
      return;
    }
    start(async () => {
      const r = await ingestMemoryItem({
        projectId,
        type: memoryType,
        title: title.trim(),
        summary: summary.trim(),
        detail: detail.trim() || undefined,
        confidenceLevel: confidence,
        sourceType: "manual_entry",
      });
      if (!r.ok) {
        setError(r.error ?? "Failed to save memory item.");
        return;
      }
      setNotice(
        r.verdict === "increment_count"
          ? "Matched an existing item — observation count bumped."
          : r.verdict === "supersede_existing"
            ? "Saved — superseded a prior conflicting item."
            : "Memory item saved.",
      );
      resetForm();
      setShowForm(false);
      router.refresh();
    });
  }

  function onArchive(id: string) {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await archiveMemoryItem({
        memoryId: id,
        reason: "Archived from memory list",
      });
      if (!r.ok) {
        setError(r.error ?? "Archive failed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          disabled={projects.length === 0}
          className="btn btn-primary btn-sm"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          New memory item
        </button>
        {projects.length === 0 && (
          <span className="text-xs text-ink-3">
            Create a project first to attach memory.
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs px-2 py-1 rounded border border-line-soft bg-surface"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Filter text…"
            className="text-xs px-2 py-1 rounded border border-line-soft bg-surface"
            aria-label="Filter by text"
          />
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={onCreate}
          className="rounded-lg border border-line-soft bg-surface p-4 flex flex-col gap-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs text-ink-3 mb-1"
                htmlFor="mem-project"
              >
                Project
              </label>
              <select
                id="mem-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={pending}
                className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface disabled:opacity-50"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-xs text-ink-3 mb-1"
                htmlFor="mem-type"
              >
                Type
              </label>
              <select
                id="mem-type"
                value={memoryType}
                onChange={(e) => setMemoryType(e.target.value)}
                disabled={pending}
                className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface disabled:opacity-50"
              >
                {MEMORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1" htmlFor="mem-title">
              Title
            </label>
            <input
              id="mem-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
              required
              minLength={2}
              maxLength={200}
              className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface disabled:opacity-50"
            />
          </div>
          <div>
            <label
              className="block text-xs text-ink-3 mb-1"
              htmlFor="mem-summary"
            >
              Summary
            </label>
            <textarea
              id="mem-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={pending}
              required
              minLength={2}
              maxLength={2000}
              rows={3}
              className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface disabled:opacity-50"
            />
          </div>
          <div>
            <label
              className="block text-xs text-ink-3 mb-1"
              htmlFor="mem-detail"
            >
              Detail (optional)
            </label>
            <textarea
              id="mem-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              disabled={pending}
              rows={2}
              className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface disabled:opacity-50"
            />
          </div>
          <div className="max-w-[200px]">
            <label
              className="block text-xs text-ink-3 mb-1"
              htmlFor="mem-confidence"
            >
              Confidence
            </label>
            <select
              id="mem-confidence"
              value={confidence}
              onChange={(e) =>
                setConfidence(e.target.value as (typeof CONFIDENCE)[number])
              }
              disabled={pending}
              className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface disabled:opacity-50"
            >
              {CONFIDENCE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary btn-sm"
            >
              {pending ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Plus className="w-4 h-4" strokeWidth={1.75} />
              )}
              Save memory item
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={pending}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="text-xs text-ink-3">{notice}</p>}

      {filtered.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No memory yet" : "No items match"}
          description={
            rows.length === 0
              ? "Add the first memory item above, or run an agent to seed memory."
              : "Adjust the type / text filter to see more."
          }
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Title</th>
              <th scope="col">Confidence</th>
              <th scope="col">Observed</th>
              <th scope="col">Last seen</th>
              <th scope="col">Source</th>
              <th scope="col" className="text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td className="text-xs">{m.memoryType}</td>
                <td className="row-title truncate max-w-md">{m.title}</td>
                <td>
                  <HandoffBadge tone="soft">
                    {m.confidenceLevel ?? "—"}
                  </HandoffBadge>
                </td>
                <td className="mono tabular-nums text-xs">
                  {m.observedCount}×
                </td>
                <td className="text-xs text-ink-3">
                  {m.lastObservedAt ?? "—"}
                </td>
                <td className="text-xs">{m.sourceType}</td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => onArchive(m.id)}
                    disabled={pending}
                    className="btn btn-secondary btn-sm text-danger"
                  >
                    <Archive className="w-4 h-4" strokeWidth={1.75} />
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
