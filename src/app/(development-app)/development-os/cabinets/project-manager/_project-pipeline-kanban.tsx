"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard, type KanbanCard, type KanbanColumn } from "@/components/ui/primitives";

/**
 * Phase 6 — Read-only kanban island wrapping the existing
 * <KanbanBoard> primitive with project-lifecycle columns. Used to
 * give the PM a portfolio-at-a-glance pipeline view; click-through
 * navigates to the project detail page.
 */

interface ProjectPipelineKanbanProps {
  projects: Array<{ id: string; name: string; status: string }>;
}

const COLUMNS: KanbanColumn[] = [
  { id: "planning", label: "Planning" },
  { id: "active", label: "Active" },
  { id: "on_hold", label: "On hold" },
  { id: "other", label: "Other" },
];

const KNOWN = new Set(["planning", "active", "on_hold"]);

export function ProjectPipelineKanban({
  projects,
}: ProjectPipelineKanbanProps) {
  const router = useRouter();
  const cards: KanbanCard[] = projects.map((p) => ({
    id: p.id,
    columnId: KNOWN.has(p.status) ? p.status : "other",
    title: p.name,
    subtitle: p.status,
    badge:
      p.status === "on_hold"
        ? { label: p.status, tone: "warn" }
        : p.status === "planning"
          ? { label: p.status, tone: "info" }
          : undefined,
  }));
  return (
    <KanbanBoard
      columns={COLUMNS}
      cards={cards}
      onCardClick={(id) => router.push(`/development-os/projects/${id}`)}
      emptyColumnLabel="No projects"
    />
  );
}
