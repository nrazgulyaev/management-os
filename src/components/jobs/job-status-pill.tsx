import { Badge } from "@/components/ui/badge";

const TONES: Record<
  string,
  "neutral" | "warning" | "info" | "success" | "danger" | "accent"
> = {
  running: "info",
  success: "success",
  partial_success: "warning",
  failed: "danger",
  cancelled: "neutral",
  skipped: "neutral",
};

export function JobStatusPill({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}

const NOTIF_TONES: Record<string, "neutral" | "warning" | "info" | "success" | "danger"> = {
  queued: "info",
  suppressed: "neutral",
  sent: "success",
  failed: "danger",
  cancelled: "neutral",
};

export function NotificationStatusPill({ status }: { status: string }) {
  return <Badge tone={NOTIF_TONES[status] ?? "neutral"}>{status}</Badge>;
}
