import { Badge } from "@/components/ui/badge";

const FEED_TONES: Record<string, "neutral" | "warning" | "info" | "success" | "danger"> = {
  active: "success",
  paused: "warning",
  error: "danger",
  archived: "neutral",
};

const CONFLICT_TONES: Record<
  string,
  "neutral" | "warning" | "info" | "success" | "danger"
> = {
  none: "neutral",
  duplicate: "warning",
  overlap: "danger",
  blocked_date: "warning",
  unresolved: "warning",
};

const CONFLICT_STATUS_TONES: Record<
  string,
  "neutral" | "warning" | "info" | "success" | "danger"
> = {
  open: "danger",
  acknowledged: "warning",
  resolved: "success",
  ignored: "neutral",
};

export function FeedStatusPill({ status }: { status: string }) {
  return <Badge tone={FEED_TONES[status] ?? "neutral"}>{status}</Badge>;
}

export function CalendarConflictPill({ status }: { status: string }) {
  if (status === "none") return null;
  return <Badge tone={CONFLICT_TONES[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}

export function ConflictStatusPill({ status }: { status: string }) {
  return (
    <Badge tone={CONFLICT_STATUS_TONES[status] ?? "neutral"}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
