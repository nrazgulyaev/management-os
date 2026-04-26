import { Badge } from "@/components/ui/badge";

const PR_TONES: Record<
  string,
  "neutral" | "warning" | "info" | "success" | "danger" | "accent"
> = {
  draft: "neutral",
  submitted: "info",
  approved: "success",
  rejected: "danger",
  ordered: "accent",
  cancelled: "neutral",
};

const PO_TONES: Record<
  string,
  "neutral" | "warning" | "info" | "success" | "danger" | "accent"
> = {
  draft: "neutral",
  sent: "info",
  confirmed: "info",
  partially_received: "warning",
  received: "success",
  cancelled: "neutral",
};

export function PurchaseRequestStatusPill({ status }: { status: string }) {
  return <Badge tone={PR_TONES[status] ?? "neutral"}>{status}</Badge>;
}

export function PurchaseOrderStatusPill({ status }: { status: string }) {
  return <Badge tone={PO_TONES[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}
