import * as React from "react";
import { cn } from "@/lib/utils";

export type VillaStatus =
  | "available"
  | "occupied"
  | "checkout_pending"
  | "cleaning"
  | "inspection"
  | "ready"
  | "maintenance_blocked"
  | "owner_stay"
  | "out_of_service"
  | "archived";

export const statusLabel: Record<VillaStatus, string> = {
  available: "Available",
  occupied: "Occupied",
  checkout_pending: "Checkout pending",
  cleaning: "Cleaning in progress",
  inspection: "Supervisor inspection",
  ready: "Ready for check-in",
  maintenance_blocked: "Maintenance blocked",
  owner_stay: "Owner stay",
  out_of_service: "Out of service",
  archived: "Archived",
};

const statusStyle: Record<VillaStatus, string> = {
  available: "bg-success-weak text-success",
  occupied: "bg-muted text-ink",
  checkout_pending: "bg-muted text-ink-secondary",
  cleaning: "bg-info-weak text-info",
  inspection: "bg-warning-weak text-warning",
  ready: "bg-success-weak text-success",
  maintenance_blocked: "bg-warning-weak text-warning",
  owner_stay: "bg-gold-weak text-gold",
  out_of_service: "bg-danger-weak text-danger",
  archived: "bg-muted text-ink-tertiary",
};

export function StatusPill({
  status,
  className,
}: {
  status: VillaStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        statusStyle[status],
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {statusLabel[status]}
    </span>
  );
}
