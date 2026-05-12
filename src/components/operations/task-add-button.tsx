/**
 * Stage 10.6.B.4 — Modal-First Add for operations tasks.
 *
 * Used on /dashboard/operations, /dashboard/operations/tasks,
 * /dashboard/operations/housekeeping (which all link to /tasks/new).
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { TaskForm } from "./task-form";

export function TaskAddButton({
  villas,
  projects,
  appUsers,
  templates,
  defaultCategory = "housekeeping",
  label = "New task",
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  appUsers: { id: string; label: string }[];
  templates: { id: string; label: string }[];
  defaultCategory?: string;
  label?: string;
}) {
  return (
    <ModalFirstAddButton
      label={label}
      modalTitle="New operations task"
      modalDescription="Tasks materialise into the field workflow once assigned."
      formComponent={TaskForm}
      formProps={{
        villas,
        projects,
        appUsers,
        templates,
        cancelHref: "/dashboard/operations/tasks",
        defaultCategory,
      }}
      newRouteHref="/dashboard/operations/tasks/new"
      size="xl"
      testId="task-add-trigger"
    />
  );
}
