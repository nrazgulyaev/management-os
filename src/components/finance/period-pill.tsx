import { Badge } from "@/components/ui/badge";

const tone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  open: "success",
  closing: "warning",
  closed: "neutral",
  locked: "danger",
};

export function PeriodPill({ status }: { status: "open" | "closing" | "closed" | "locked" }) {
  return <Badge tone={tone[status] ?? "neutral"}>{status}</Badge>;
}

const stmtTone: Record<string, "neutral" | "warning" | "success" | "info"> = {
  draft: "neutral",
  issued: "info",
  approved: "warning",
  paid: "success",
  voided: "neutral",
};

export function StatementStatusPill({ status }: { status: string }) {
  return <Badge tone={stmtTone[status] ?? "neutral"}>{status}</Badge>;
}
