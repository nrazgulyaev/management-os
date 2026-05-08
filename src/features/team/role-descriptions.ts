/**
 * Stage 9.E.3 — operator-facing description for each app_user_roles
 * role_key. Used by the role-change form + member detail page so the
 * owner sees a one-line summary of "what this role can do" without
 * digging through code.
 *
 * Keep these descriptions short + decision-relevant: the owner is
 * picking a role for a teammate, not reading documentation.
 *
 * Source-of-truth for the actual permissions is
 * `src/features/auth/permission-matrix.ts`. These descriptions are
 * derived from Stage 7.A's role catalog and need to stay in sync with
 * any future expansion of the role list.
 */

import type { CabinetRoleKey } from "./role-keys";

interface RoleDescription {
  /** Display label — title-cased. */
  label: string;
  /** One-line summary shown next to the role picker. */
  blurb: string;
  /** Bulleted highlights shown in the help drawer / tooltip. */
  highlights: string[];
}

export const ROLE_DESCRIPTIONS: Record<CabinetRoleKey, RoleDescription> = {
  admin: {
    label: "Admin",
    blurb: "Full access to org settings, billing, team management, and all cabinets.",
    highlights: [
      "Invite + remove team members",
      "Change roles + manage subscription",
      "All cabinets + all integrations",
      "Reserve for owners + co-founders",
    ],
  },
  executive_ceo: {
    label: "Executive / CEO",
    blurb: "Strategic dashboards + executive cabinet. Read-only on operational data.",
    highlights: [
      "Executive command center",
      "Strategic dashboards (cashflow, profitability)",
      "Read-only on bookings, ops, finance details",
    ],
  },
  cfo_accountant: {
    label: "CFO / Accountant",
    blurb: "Finance cabinet — periods, statements, distributions, taxes.",
    highlights: [
      "CFO cabinet + finance hub",
      "Open / close periods, generate statements",
      "Taxes + shared costs + distributions",
    ],
  },
  project_manager: {
    label: "Project Manager",
    blurb: "Project cabinet — schedule, BOQ, milestones, site reports.",
    highlights: [
      "Project Manager cabinet",
      "BOQ + procurement requests + milestones",
      "Site reports + safety escalations",
    ],
  },
  qs_analyst: {
    label: "QS / Cost Analyst",
    blurb: "Quantity Surveying cabinet — cost analysis, BOQ review, budget vs actual.",
    highlights: [
      "QS cabinet + AI cost analyst",
      "BOQ review + cost overrun analysis",
      "No write access to procurement / finance",
    ],
  },
  procurement_manager: {
    label: "Procurement Manager",
    blurb: "Procurement cabinet — RFQs, vendors, deliveries, supplier performance.",
    highlights: [
      "Procurement cabinet",
      "RFQs + quotations + vendor performance",
      "Approve / reject purchase requests",
    ],
  },
  warehouse_manager: {
    label: "Warehouse Manager",
    blurb: "Inventory cabinet — stock, movements, low-stock alerts.",
    highlights: [
      "Warehouse cabinet + inventory hub",
      "Stock movements + reorder points",
      "Materials deliveries + warehouse ops",
    ],
  },
  site_supervisor: {
    label: "Site Supervisor",
    blurb: "Site Supervisor cabinet — daily site reports, safety, photo upload.",
    highlights: [
      "Site Supervisor cabinet",
      "Daily site reports + photo upload",
      "Safety incident escalation",
    ],
  },
  marketing_staff: {
    label: "Marketing Staff",
    blurb: "Marketing cabinet — campaigns, leads, content pipeline.",
    highlights: [
      "Marketing cabinet + connections",
      "Campaigns + content + lead routing",
      "Read-only on bookings + revenue",
    ],
  },
  sales_manager: {
    label: "Sales Manager",
    blurb: "Sales cabinet — reservations, contracts, discounts, lead conversion.",
    highlights: [
      "Sales cabinet",
      "Reservations + contracts + discounts",
      "Lead → reservation pipeline",
    ],
  },
};

export function getRoleDescription(roleKey: string): RoleDescription | null {
  return (ROLE_DESCRIPTIONS[roleKey as CabinetRoleKey] ?? null) as RoleDescription | null;
}
