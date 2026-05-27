"use client";

import * as React from "react";

/**
 * Phase 2.2 mgmt-04 — StaffChip.
 *
 * Compact assignee chip. Unassigned variant renders with a dashed
 * border. Click → opens AssignStaffModal (caller handles).
 */

export interface StaffChipProps {
  staff: { id: string; name: string; initials?: string } | null;
  onClick?: () => void;
  className?: string;
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function StaffChip({ staff, onClick, className }: StaffChipProps) {
  const Wrapper: "button" | "span" = onClick ? "button" : "span";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      className={`staff-chip${staff ? "" : " unassigned"}${className ? ` ${className}` : ""}`}
      onClick={onClick}
    >
      {staff ? (
        <>
          <span className="initials">{staff.initials ?? initialsFor(staff.name)}</span>
          <span className="name">{staff.name}</span>
        </>
      ) : (
        <>
          <span className="initials">+</span>
          <span className="name">Assign</span>
        </>
      )}
    </Wrapper>
  );
}
