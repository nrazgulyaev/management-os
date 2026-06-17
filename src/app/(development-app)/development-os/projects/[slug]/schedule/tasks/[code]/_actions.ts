"use server";

/**
 * UI adapters for task lifecycle controls. updateProjectTask / setTaskProgress
 * / completeTask are "use server" + org-scoped and revalidate their own pages.
 * setTaskDependency is org-scoped but does not revalidate, so this wrapper adds
 * it. All wrappers normalise to a uniform result shape for the client island.
 */

import { revalidatePath } from "next/cache";
import {
  updateProjectTask,
  setTaskProgress,
  completeTask,
  setTaskDependency,
} from "@/lib/development/server/schedule/schedule-actions";

type TaskStatus =
  | "planned"
  | "ready_to_start"
  | "in_progress"
  | "completed"
  | "blocked"
  | "cancelled";

type DependencyType =
  | "finish_to_start"
  | "start_to_start"
  | "finish_to_finish"
  | "start_to_finish";

export async function updateProjectTaskAction(input: {
  taskId: string;
  name?: string;
  status?: TaskStatus;
  plannedStart?: string;
  plannedFinish?: string;
  actualStart?: string | null;
  actualFinish?: string | null;
  notes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await updateProjectTask(input);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update task.",
    };
  }
}

export async function setTaskProgressAction(input: {
  taskId: string;
  progressPercentage: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await setTaskProgress(input);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to set progress.",
    };
  }
}

export async function completeTaskAction(input: {
  taskId: string;
  actualFinish?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await completeTask(input);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to complete task.",
    };
  }
}

export async function addTaskDependencyAction(input: {
  predecessorId: string;
  successorId: string;
  slug: string;
  taskCode: string;
  type?: DependencyType;
  lagDays?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await setTaskDependency({
      predecessorId: input.predecessorId,
      successorId: input.successorId,
      type: input.type ?? "finish_to_start",
      lagDays: input.lagDays ?? 0,
    });
    revalidatePath(
      `/development-os/projects/${input.slug}/schedule/tasks/${encodeURIComponent(input.taskCode)}`,
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to add dependency.",
    };
  }
}
