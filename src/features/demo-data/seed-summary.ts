/**
 * Prompt 112 — Module-by-module summary of what `drizzle/seed.sql`
 * inserts.  This is the canonical inventory the validation script
 * walks against.
 */

import { DEMO_MIN_ROW_COUNTS } from "./constants";

export interface DemoSeedModule {
  /** Module label shown in QA reports. */
  module: string;
  /** Tables to count. */
  tables: ReadonlyArray<keyof typeof DEMO_MIN_ROW_COUNTS>;
  /** Short description of the module's coverage. */
  notes: string;
}

export const DEMO_SEED_MODULES: DemoSeedModule[] = [
  {
    module: "Projects + villas",
    tables: ["projects", "villas"],
    notes:
      "3 demo projects (Eternal / Enso / Ahau) with 6+ villas across hybrid / pooled / individual management models.",
  },
  {
    module: "Owners + ownership shares",
    tables: ["owners", "ownership_shares"],
    notes:
      "3 owner records (Emma Whitmore, Takeda Family Office, Sonoma Capital) with deterministic share rows.",
  },
  {
    module: "Internal users + role grants",
    tables: ["app_users"],
    notes:
      "Demo app_users for super_admin, director, ops/property/booking/revenue managers, finance/accountant, concierge, housekeeping, technician, security. All emails @example.test or arconique-demo domains.",
  },
  {
    module: "Bookings + channels",
    tables: ["bookings", "villa_calendar_blocks"],
    notes:
      "Bookings across direct / Airbnb / Booking.com / Vrbo / manual / owner-stay / maintenance-block / internal-hold sources, statuses inquiry → completed, with masked guest labels only.",
  },
  {
    module: "Direct booking lifecycle",
    tables: [
      "direct_booking_holds",
      "direct_booking_requests",
      "direct_booking_finance_links",
    ],
    notes:
      "Three holds (active / approved-with-deposit / expired), three requests, four finance links across pending / posted / skipped_locked / failed. Token plaintext is never persisted.",
  },
  {
    module: "Owner-booking projection",
    tables: [
      "owner_booking_summaries",
      "owner_revenue_source_monthly",
    ],
    notes:
      "Five owner-booking summaries (direct posted / direct pending / OTA confirmed / owner stay / maintenance) plus three monthly source-mix buckets across 3 months.",
  },
  {
    module: "Statement transparency",
    tables: [
      "statement_source_groups",
      "statement_explanation_snapshots",
    ],
    notes:
      "Source groups attached to the most recent issued statement (direct / OTA / guest services / owner stay / utilities / management / reserves) plus 5 reconciliation warnings + 1 explanation snapshot.",
  },
  {
    module: "Guest stay tokens + services",
    tables: ["guest_stay_tokens", "guest_services"],
    notes:
      "One guest-stay token bound to a demo booking (token plaintext documented in QA doc; only hash persisted). Service catalog: housekeeping, transport, dining, wellness.",
  },
  {
    module: "Vendors",
    tables: ["service_vendors"],
    notes:
      "Demo vendors for transport / laundry / cleaning / handyman, all clearly labelled with `.demo` domains.",
  },
  {
    module: "Pricing rule sets",
    tables: ["pricing_rule_sets"],
    notes:
      "At least one rule set with day-of-week, occupancy, min-stay, channel, and close-out rules.",
  },
  {
    module: "Notifications + jobs",
    tables: ["notification_templates", "job_definitions", "job_locks"],
    notes:
      "Templates for every direct-booking, owner-stay, and statement event. Job definitions for every cron-driven background task.",
  },
  {
    module: "Security baseline",
    tables: [
      "auth_login_attempts",
      "auth_security_events",
    ],
    notes:
      "Sample login attempts (success + locked) and security events. Hashed IP/UA only — no raw values.",
  },
  // P116A — additional modules.
  {
    module: "Owner-portal linkage",
    tables: ["app_users_owners"],
    notes:
      "At least one app_users_owners grant so the demo logged-in user resolves to a seeded owner. Validator also accepts the demo-mode fallback.",
  },
  {
    module: "Owner-visible events + statements + inbox",
    tables: ["owner_visible_events", "owner_statements", "in_app_notifications"],
    notes:
      "Owner calendar / statements / inbox surfaces depend on these tables. Demo mode falls back to mock when missing.",
  },
  {
    module: "Guest stay content",
    tables: [
      "villa_guide_sections",
      "villa_wifi_credentials",
      "villa_emergency_contacts",
      "villa_neighborhood_places",
    ],
    notes:
      "Guest stay portal pulls these for /stay/[token]. /stay/demo uses static fallback.",
  },
  {
    module: "Operations + service fulfilment",
    tables: ["operation_tasks", "service_fulfilments"],
    notes:
      "Field app + admin operations + vendor portal need at least 10 tasks and 5 fulfilments to demonstrate the runtime.",
  },
  {
    module: "Maintenance + utilities",
    tables: ["preventive_plans", "utility_accounts"],
    notes: "Maintenance intelligence + utility risk feed depend on these.",
  },
  {
    module: "Inventory + procurement",
    tables: ["inventory_items", "procurement_requests", "procurement_orders"],
    notes: "Stock command / procurement views need these.",
  },
  {
    module: "Notifications + AI",
    tables: ["notifications", "ai_runs"],
    notes:
      "Notification center + AI Operations Co-pilot insights. Both optional — validator emits a warning rather than failure when missing.",
  },
];

/** Aggregate the modules into a flat (table → minimum count) map. */
export function expectedMinCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const mod of DEMO_SEED_MODULES) {
    for (const table of mod.tables) {
      out[table] = DEMO_MIN_ROW_COUNTS[table];
    }
  }
  return out;
}
