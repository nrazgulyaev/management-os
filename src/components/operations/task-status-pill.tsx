import { Badge } from "@/components/ui/badge";

const TASK_TONES: Record<
  string,
  "neutral" | "warning" | "success" | "info" | "accent" | "danger"
> = {
  open: "neutral",
  scheduled: "info",
  in_progress: "info",
  blocked: "danger",
  completed: "accent",
  needs_review: "warning",
  approved: "success",
  cancelled: "neutral",
};

const LABEL: Record<string, string> = {
  open: "Open",
  scheduled: "Scheduled",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  needs_review: "Needs review",
  approved: "Approved",
  cancelled: "Cancelled",
};

export function TaskStatusPill({ status }: { status: string }) {
  return <Badge tone={TASK_TONES[status] ?? "neutral"}>{LABEL[status] ?? status}</Badge>;
}

const MAINT_TONES: Record<string, "neutral" | "warning" | "info" | "success" | "danger"> = {
  open: "warning",
  triaged: "info",
  scheduled: "info",
  in_progress: "info",
  waiting_parts: "warning",
  resolved: "success",
  closed: "neutral",
  cancelled: "neutral",
};

export function MaintenanceStatusPill({ status }: { status: string }) {
  return <Badge tone={MAINT_TONES[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}

const SR_TONES: Record<string, "neutral" | "warning" | "info" | "success"> = {
  new: "warning",
  accepted: "info",
  scheduled: "info",
  in_progress: "info",
  completed: "success",
  cancelled: "neutral",
};

export function ServiceRequestStatusPill({ status }: { status: string }) {
  return <Badge tone={SR_TONES[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}

const CHECKLIST_TONES: Record<string, "neutral" | "info" | "warning" | "success"> = {
  open: "neutral",
  in_progress: "info",
  completed: "warning",
  approved: "success",
};

export function ChecklistStatusPill({ status }: { status: string }) {
  return <Badge tone={CHECKLIST_TONES[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}
