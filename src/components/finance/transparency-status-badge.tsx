import { Badge } from "@/components/ui/badge";
import type { ReconciliationStatusKey } from "@/features/statement-transparency/reconciliation-pure";

export function TransparencyStatusBadge({
  status,
}: {
  status: ReconciliationStatusKey;
}) {
  switch (status) {
    case "healthy":
      return <Badge tone="success">Ready</Badge>;
    case "needs_review":
      return <Badge tone="warning">Needs review</Badge>;
    case "critical":
      return <Badge tone="danger">Critical review</Badge>;
  }
}
