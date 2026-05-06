/**
 * P116A — Static demo completeness overview rendered on the
 * `/dashboard/demo` page.  Pure data, no DB.  Mirrors the matrix in
 * `docs/DEMO_COMPLETENESS_MATRIX.md`.
 */

export type CompletenessStatus = "populated" | "fallback" | "empty-accepted";

export interface ModuleEntry {
  label: string;
  href: string;
  status: CompletenessStatus;
  notes: string;
}

export interface ModuleSection {
  title: string;
  description: string;
  entries: ModuleEntry[];
}

export const COMPLETENESS_SECTIONS: ModuleSection[] = [
  {
    title: "Owner portal",
    description:
      "All routes resolve via `listOwnerIdsForCurrentUser()` with a demo-mode fallback to the seeded owner.",
    entries: [
      { label: "Portfolio home", href: "/owner", status: "populated", notes: "Static mock + workspace cards" },
      { label: "Calendar", href: "/owner/calendar", status: "populated", notes: "owner_visible_events" },
      { label: "Bookings", href: "/owner/bookings", status: "populated", notes: "owner_booking_summaries" },
      { label: "Revenue", href: "/owner/revenue", status: "populated", notes: "owner_revenue_source_monthly" },
      { label: "Statements", href: "/owner/statements", status: "populated", notes: "owner_statements" },
      { label: "Owner stays", href: "/owner/stays", status: "populated", notes: "owner_stay_requests" },
      { label: "Inbox", href: "/owner/inbox", status: "populated", notes: "in_app_notifications" },
    ],
  },
  {
    title: "Guest stay demo",
    description:
      "Every card on `/stay/demo` links to a static subroute with no token / DB requirement.",
    entries: [
      { label: "Stay landing", href: "/stay/demo", status: "populated", notes: "10 nav cards" },
      { label: "Check-in", href: "/stay/demo/check-in", status: "populated", notes: "Lock-code placeholder" },
      { label: "Wi-Fi", href: "/stay/demo/wifi", status: "populated", notes: "QR placeholder" },
      { label: "Guide", href: "/stay/demo/guide", status: "populated", notes: "4 sections" },
      { label: "House rules", href: "/stay/demo/house-rules", status: "populated", notes: "5 rules" },
      { label: "Neighborhood", href: "/stay/demo/neighborhood", status: "populated", notes: "7 places" },
      { label: "Services", href: "/stay/demo/services", status: "populated", notes: "8 services" },
      { label: "Concierge", href: "/stay/demo/concierge", status: "populated", notes: "Mock chat" },
      { label: "Requests", href: "/stay/demo/requests", status: "populated", notes: "3 demo requests" },
      { label: "Emergency", href: "/stay/demo/emergency", status: "populated", notes: "5 contacts" },
      { label: "Offline", href: "/stay/demo/offline", status: "populated", notes: "Printable summary" },
    ],
  },
  {
    title: "Field / staff app",
    description: "Mock fallback populates 15 tasks across overdue / today / in-progress / done / upcoming.",
    entries: [
      { label: "Field home", href: "/field", status: "populated", notes: "15 demo tasks" },
      { label: "Inventory", href: "/field/inventory", status: "populated", notes: "inventory_items" },
      { label: "Task demo", href: "/field/tasks/demo", status: "populated", notes: "22-item checklist" },
    ],
  },
  {
    title: "Admin · operations + finance",
    description: "Backed by the seed.sql + safeCount/safeList helpers.",
    entries: [
      { label: "Operations · Tasks", href: "/dashboard/operations/tasks", status: "populated", notes: "operation_tasks" },
      { label: "Operations · Housekeeping", href: "/dashboard/operations/housekeeping", status: "populated", notes: "" },
      { label: "Operations · Maintenance", href: "/dashboard/operations/maintenance", status: "populated", notes: "" },
      { label: "Finance", href: "/dashboard/finance", status: "populated", notes: "" },
      { label: "Statement transparency", href: "/dashboard/finance/transparency", status: "populated", notes: "" },
    ],
  },
  {
    title: "Admin · direct booking + pricing + AI",
    description: "Stubs labelled in copy; full lifecycle is testable.",
    entries: [
      { label: "Direct bookings", href: "/dashboard/direct-bookings", status: "populated", notes: "" },
      { label: "Direct booking · holds", href: "/dashboard/direct-bookings/holds", status: "populated", notes: "" },
      { label: "Direct booking · deposits", href: "/dashboard/direct-bookings/deposits", status: "populated", notes: "Manual stub" },
      { label: "Pricing rule sets", href: "/dashboard/pricing/rule-sets", status: "populated", notes: "" },
      { label: "Pricing channel push", href: "/dashboard/pricing/channel-push", status: "populated", notes: "Simulation" },
      { label: "AI Operations Co-pilot", href: "/dashboard/ai", status: "populated", notes: "Read-only" },
      { label: "Guest AI · sessions", href: "/dashboard/guest-ai/sessions", status: "populated", notes: "" },
    ],
  },
  {
    title: "Admin · system",
    description: "Deployment readiness + system health.",
    entries: [
      { label: "Deployment readiness", href: "/dashboard/system/deployment", status: "populated", notes: "" },
      { label: "System health", href: "/dashboard/system/health", status: "populated", notes: "" },
      { label: "Storage", href: "/dashboard/system/storage", status: "populated", notes: "" },
      { label: "Background jobs", href: "/dashboard/jobs", status: "populated", notes: "" },
      { label: "Audit log", href: "/dashboard/audit", status: "empty-accepted", notes: "Empty on a fresh DB" },
      { label: "Security · login attempts", href: "/dashboard/security/login-attempts", status: "empty-accepted", notes: "Empty on a fresh DB" },
    ],
  },
];

export function summariseCompleteness(): {
  total: number;
  populated: number;
  fallback: number;
  emptyAccepted: number;
  score: number;
} {
  let total = 0;
  let populated = 0;
  let fallback = 0;
  let emptyAccepted = 0;
  for (const s of COMPLETENESS_SECTIONS) {
    for (const e of s.entries) {
      total += 1;
      if (e.status === "populated") populated += 1;
      else if (e.status === "fallback") fallback += 1;
      else emptyAccepted += 1;
    }
  }
  // Scoring: populated = 1.0, fallback = 0.7, empty-accepted = 0.5.
  const weighted =
    total === 0 ? 0 : (populated * 1 + fallback * 0.7 + emptyAccepted * 0.5) / total;
  return {
    total,
    populated,
    fallback,
    emptyAccepted,
    score: Math.round(weighted * 100),
  };
}
