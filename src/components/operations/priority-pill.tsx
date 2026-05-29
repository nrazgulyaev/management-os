import { Badge } from "@/components/ui/badge";

// Shared by generic task / service-request `priority` (low/normal/high/urgent,
// unchanged) AND maintenance/damage `severity` (p0–p3 after mig 0116), so both
// key sets are kept.
const TONES: Record<string, "neutral" | "info" | "warning" | "danger" | "accent"> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
  p3: "neutral",
  p2: "info",
  p1: "warning",
  p0: "danger",
};

export function PriorityPill({ priority }: { priority: string }) {
  return <Badge tone={TONES[priority] ?? "neutral"}>{priority}</Badge>;
}
