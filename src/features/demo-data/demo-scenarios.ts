/**
 * Prompt 112 — Declarative demo scenarios.  The `/dashboard/demo`
 * walkthrough route + the QA doc both consume this list, so adding a
 * new demo flow only requires editing this file.
 */

export type DemoScenarioCategory =
  | "owner_portal"
  | "guest_stay"
  | "direct_booking"
  | "field_app"
  | "vendor_portal"
  | "finance"
  | "operations"
  | "pricing"
  | "security_jobs";

export interface DemoScenarioLink {
  href: string;
  label: string;
  /** Some links require a token / id that the demo can't pre-mint
   *  (raw tokens are never persisted).  Mark these so the UI can
   *  render a "Generate from public form" hint instead of a dead link. */
  requiresLiveToken?: boolean;
}

export interface DemoScenario {
  category: DemoScenarioCategory;
  title: string;
  /** What the operator should verify after clicking through. */
  expect: string;
  links: DemoScenarioLink[];
  /** Soft caveats shown next to the card. */
  caveats?: string[];
  /** Env vars that materially change behaviour (informational only). */
  envHints?: string[];
}

const SCENARIOS: DemoScenario[] = [
  // ---------- Owner portal ----------
  {
    category: "owner_portal",
    title: "Owner Portal Demo",
    expect:
      "Calendar shows direct, OTA, owner-stay, and maintenance overlays. Bookings list redacts guest contact info. Revenue mix splits direct vs OTA. Statements list shows the transparency badge.",
    links: [
      { href: "/owner", label: "Portfolio overview" },
      { href: "/owner/calendar", label: "Calendar" },
      { href: "/owner/bookings", label: "Bookings" },
      { href: "/owner/revenue", label: "Revenue" },
      { href: "/owner/statements", label: "Statements" },
    ],
    caveats: [
      "Owners only see their own villas; sign in as the demo owner user (see QA doc).",
    ],
  },
  // ---------- Guest stay ----------
  {
    category: "guest_stay",
    title: "Guest Stay Demo",
    expect:
      "Stay portal opens with token-bound context: villa, dates, Wi-Fi (encrypted), services, concierge AI, and the request center.",
    links: [
      { href: "/stay/demo", label: "Stay demo (no token required)" },
      {
        href: "/stay/__token__",
        label: "Live stay portal (paste a real token)",
        requiresLiveToken: true,
      },
      {
        href: "/stay/__token__/services",
        label: "Service catalog",
        requiresLiveToken: true,
      },
      {
        href: "/stay/__token__/concierge",
        label: "AI concierge",
        requiresLiveToken: true,
      },
      {
        href: "/stay/__token__/requests",
        label: "Request center",
        requiresLiveToken: true,
      },
    ],
    caveats: [
      "Raw stay tokens are never persisted by seed.sql. To get a live token, mint one via the admin booking flow (see QA doc).",
    ],
  },
  // ---------- Direct booking ----------
  {
    category: "direct_booking",
    title: "Direct Booking Demo",
    expect:
      "Public hold/status page shows the 14-stage taxonomy and a clean timeline. Admin reconciliation hub lists pending / posted / failed finance links.",
    links: [
      { href: "/dashboard/direct-bookings", label: "Direct bookings hub" },
      {
        href: "/dashboard/direct-bookings/holds",
        label: "Holds",
      },
      {
        href: "/dashboard/direct-bookings/requests",
        label: "Requests",
      },
      {
        href: "/dashboard/direct-bookings/deposits",
        label: "Deposits",
      },
      {
        href: "/dashboard/direct-bookings/reconciliation",
        label: "Reconciliation",
      },
      {
        href: "/dashboard/direct-bookings/guest-status",
        label: "Guest status snapshots",
      },
      {
        href: "/dashboard/direct-bookings/messages",
        label: "Guest messages",
      },
      {
        href: "/book/hold/__token__/status",
        label: "Public guest status page",
        requiresLiveToken: true,
      },
    ],
    caveats: [
      "No real PSP. Deposit verification is manual via /dashboard/direct-bookings/deposits.",
    ],
  },
  // ---------- Field app ----------
  {
    category: "field_app",
    title: "Field App Demo",
    expect:
      "Field landing shows assigned tasks. Tasks have checklists, photo-required items, and material usage capture.",
    links: [
      { href: "/field/tasks/demo", label: "Field demo" },
      { href: "/field", label: "Field landing" },
      { href: "/field/inventory", label: "Inventory" },
    ],
  },
  // ---------- Vendor portal ----------
  {
    category: "vendor_portal",
    title: "Vendor Portal Demo",
    expect:
      "Vendor portal accepts a service request, shows ETA controls, and supports invoice metadata submission.",
    links: [
      {
        href: "/vendor/service/__token__",
        label: "Vendor service request",
        requiresLiveToken: true,
      },
      {
        href: "/vendor/service/__token__/invoice",
        label: "Vendor invoice form",
        requiresLiveToken: true,
      },
    ],
    caveats: [
      "Vendor tokens are issued per service request. Use /dashboard/service-fulfilment to mint one for the demo vendor.",
    ],
  },
  // ---------- Finance ----------
  {
    category: "finance",
    title: "Finance Demo",
    expect:
      "Statement detail shows source-grouped lines, an explanation snapshot, owner-visible warnings, and a linked-activity panel.",
    links: [
      { href: "/dashboard/finance/statements", label: "All statements" },
      {
        href: "/dashboard/finance/transparency",
        label: "Statement transparency hub",
      },
      {
        href: "/dashboard/finance/transparency/statements",
        label: "Transparency · per statement",
      },
      {
        href: "/dashboard/finance/transparency/warnings",
        label: "Reconciliation warnings",
      },
      {
        href: "/dashboard/owner-intelligence/revenue",
        label: "Owner revenue source mix",
      },
    ],
    caveats: [
      "Statement PDFs render via @react-pdf/renderer — first request is slower (~2s).",
    ],
  },
  // ---------- Operations ----------
  {
    category: "operations",
    title: "Operations Demo",
    expect:
      "Operations hub lists recent tasks. Maintenance intelligence shows preventive plans + risk events. Utilities shows accounts + readings.",
    links: [
      { href: "/dashboard/operations", label: "Operations hub" },
      {
        href: "/dashboard/maintenance-intelligence",
        label: "Maintenance intelligence",
      },
      { href: "/dashboard/utilities", label: "Utilities" },
      { href: "/dashboard/inventory", label: "Inventory" },
      { href: "/dashboard/procurement", label: "Procurement" },
    ],
  },
  // ---------- Pricing ----------
  {
    category: "pricing",
    title: "Pricing Demo",
    expect:
      "Pricing landing lists rule sets. Calendar shows day-by-day rates. Quote tester returns a deterministic result with audit log entry.",
    links: [
      { href: "/dashboard/pricing", label: "Pricing rule sets" },
      { href: "/dashboard/pricing/calendar", label: "Pricing calendar" },
      { href: "/dashboard/pricing/quote", label: "Quote tester" },
      { href: "/dashboard/pricing/logs", label: "Quote logs" },
    ],
  },
  // ---------- Security / jobs ----------
  {
    category: "security_jobs",
    title: "Security & Jobs Demo",
    expect:
      "System health shows every tracked table + env readiness. Jobs page lists job definitions + recent runs + locks. Security pages show login attempts, events, and MFA factors.",
    links: [
      { href: "/dashboard/system/health", label: "System health" },
      { href: "/dashboard/jobs", label: "Background jobs" },
      { href: "/dashboard/jobs/runs", label: "Job runs" },
      { href: "/dashboard/jobs/locks", label: "Job locks" },
      { href: "/dashboard/security/auth", label: "Authentication security" },
      {
        href: "/dashboard/security/login-attempts",
        label: "Login attempts",
      },
      { href: "/dashboard/security/events", label: "Security events" },
      { href: "/dashboard/security/mfa", label: "MFA factors" },
      { href: "/dashboard/notifications", label: "Notifications" },
    ],
    envHints: [
      "SECURITY_ENCRYPTION_SECRET — required to mint MFA factors.",
      "CRON_SECRET — required for the cron route handler.",
    ],
  },
];

export function listDemoScenarios(): DemoScenario[] {
  return SCENARIOS;
}

export function listDemoScenariosByCategory(): Record<
  DemoScenarioCategory,
  DemoScenario[]
> {
  const out = {} as Record<DemoScenarioCategory, DemoScenario[]>;
  for (const s of SCENARIOS) {
    (out[s.category] ??= []).push(s);
  }
  return out;
}
