import { Badge } from "@/components/ui/badge";

export function SourceBadge({ source }: { source: "db" | "mock" }) {
  return source === "db" ? (
    <Badge tone="success">Live data</Badge>
  ) : (
    <Badge tone="gold">Demo data</Badge>
  );
}
