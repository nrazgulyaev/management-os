import { Badge } from "@/components/ui/badge";

const TONES: Record<string, "neutral" | "info" | "warning" | "danger" | "accent"> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

export function PriorityPill({ priority }: { priority: string }) {
  return <Badge tone={TONES[priority] ?? "neutral"}>{priority}</Badge>;
}
