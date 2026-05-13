import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Stage 10.C — Route triage redirects.
 *
 * The Stage 10.A audit catalogued 56 BLOCKER 404 routes that came from
 * the operator's mental-model URL spec, not the shipped navigation.
 * Walking the actual nav (`src/config/navigation.ts`) confirmed every
 * link points to a real page — operators clicking the menu never hit a
 * 404 today. The audit BLOCKERs surface when:
 *   - Operators bookmark or paste a URL using their mental model
 *     (e.g. `/dashboard/maintenance` instead of the canonical
 *     `/dashboard/maintenance-intelligence`)
 *   - External tools or older docs reference the previous slug
 *
 * 49 of 56 audit BLOCKERs map cleanly to a canonical route. We ship
 * permanent redirects (`permanent: true` → HTTP 308) so:
 *   1. Bookmarked / pasted URLs resolve to the right page
 *   2. SEO consolidates on the canonical URL
 *   3. Future audits stop flagging these as 404
 *
 * The remaining 7 audit URLs need engineering work — captured as BUILD
 * entries in `docs/stage-10-route-triage.md` and feed Phase 10.M.
 */
const STAGE_10_C_REDIRECTS = [
  // /dashboard — operator-spec → canonical
  { source: "/dashboard/ai/assistants", destination: "/dashboard/ai" },
  { source: "/dashboard/audit-log", destination: "/dashboard/audit" },
  { source: "/dashboard/calendar", destination: "/dashboard/bookings/calendar" },
  { source: "/dashboard/direct-bookings/guest-messages", destination: "/dashboard/direct-bookings/messages" },
  { source: "/dashboard/finance/material-usage-bridge", destination: "/dashboard/finance/material-usage" },
  { source: "/dashboard/finance/statement-transparency", destination: "/dashboard/finance/transparency" },
  { source: "/dashboard/front-office/availability/board", destination: "/dashboard/availability" },
  { source: "/dashboard/front-office/calendar-blocks", destination: "/dashboard/availability/blocks" },
  { source: "/dashboard/front-office/check-in-out-requests", destination: "/dashboard/front-office/requests" },
  { source: "/dashboard/front-office/today", destination: "/dashboard/front-office" },
  { source: "/dashboard/guest-journey/review-requests", destination: "/dashboard/guest-journey/reviews" },
  { source: "/dashboard/integrations/automation-rules", destination: "/dashboard/integrations/automation" },
  { source: "/dashboard/inventory/stock-by-location", destination: "/dashboard/inventory/stock" },
  // Maintenance namespace consolidation
  { source: "/dashboard/maintenance", destination: "/dashboard/maintenance-intelligence" },
  { source: "/dashboard/maintenance/plans", destination: "/dashboard/maintenance-intelligence/plans" },
  { source: "/dashboard/maintenance/risk-feed", destination: "/dashboard/maintenance-intelligence/risks" },
  { source: "/dashboard/maintenance/templates", destination: "/dashboard/maintenance-intelligence/templates" },
  { source: "/dashboard/maintenance/windows", destination: "/dashboard/maintenance-intelligence/windows" },
  // Notifications + operations
  { source: "/dashboard/notifications/delivery-log", destination: "/dashboard/notifications/deliveries" },
  { source: "/dashboard/operations/command-center", destination: "/dashboard/operations" },
  // Owner intelligence — operator's verbose URLs → shipped slugs
  { source: "/dashboard/owner-intelligence/booking-projection", destination: "/dashboard/owner-intelligence/bookings" },
  { source: "/dashboard/owner-intelligence/health-reports", destination: "/dashboard/owner-intelligence/health" },
  { source: "/dashboard/owner-intelligence/rebuild-events", destination: "/dashboard/owner-intelligence/rebuild" },
  { source: "/dashboard/owner-intelligence/revenue-source-mix", destination: "/dashboard/owner-intelligence/revenue" },
  // Pricing
  { source: "/dashboard/pricing/quote-tester", destination: "/dashboard/pricing/quote" },
  { source: "/dashboard/rate-plans", destination: "/dashboard/bookings/rates" },
  // Security — drop the /auth/ infix that doesn't exist
  { source: "/dashboard/security/auth/events", destination: "/dashboard/security/events" },
  { source: "/dashboard/security/auth/login-attempts", destination: "/dashboard/security/login-attempts" },
  { source: "/dashboard/security/auth/mfa-factors", destination: "/dashboard/security/mfa" },
  { source: "/dashboard/sync", destination: "/dashboard/bookings/sync" },
  // System — operator's spec mixed /dashboard/system/* vs shipped /dashboard/jobs
  { source: "/dashboard/system/demo-walkthrough", destination: "/dashboard/demo" },
  { source: "/dashboard/system/deployment-readiness", destination: "/dashboard/system/deployment" },
  { source: "/dashboard/system/job-locks", destination: "/dashboard/jobs/locks" },
  { source: "/dashboard/system/job-runs", destination: "/dashboard/jobs/runs" },
  { source: "/dashboard/system/jobs", destination: "/dashboard/jobs" },
  // Villa guides — entire namespace was migrated to /guest-* surfaces
  { source: "/dashboard/villa-guides/concierge-ai", destination: "/dashboard/guest-ai" },
  { source: "/dashboard/villa-guides/concierge-ai/attachments", destination: "/dashboard/guest-ai/storage" },
  { source: "/dashboard/villa-guides/concierge-ai/handoff-sla", destination: "/dashboard/guest-ai/handoffs/metrics" },
  { source: "/dashboard/villa-guides/concierge-ai/handoffs", destination: "/dashboard/guest-ai/handoffs" },
  { source: "/dashboard/villa-guides/concierge-ai/sessions", destination: "/dashboard/guest-ai/sessions" },
  { source: "/dashboard/villa-guides/security/events", destination: "/dashboard/guest-stays/security/events" },
  { source: "/dashboard/villa-guides/security/verifications", destination: "/dashboard/guest-stays/security/verifications" },
  { source: "/dashboard/villa-guides/services", destination: "/dashboard/guest-services" },
  { source: "/dashboard/villa-guides/services/finance-bridge", destination: "/dashboard/guest-services/finance-bridge" },
  { source: "/dashboard/villa-guides/services/orders", destination: "/dashboard/guest-services/orders" },
  // Stage 10.M.3 — procurement aliased URLs from the operator spec
  { source: "/dashboard/procurement/purchase-orders", destination: "/dashboard/procurement/orders" },
  { source: "/dashboard/procurement/purchase-requests", destination: "/dashboard/procurement/requests" },
  // Stage 10.I.3 — public marketing URLs retired in favour of /products/*
  { source: "/villa-management", destination: "/products/management-os" },
  { source: "/development", destination: "/products/development-os" },
  // Stage 10.I.4 originally retired the bare /pricing page and
  // 308-redirected it to /pricing/management-os. Sprint 3a un-retired
  // /pricing for the consolidated three-column (Mgmt-only / Dev-only
  // / Bundle) page; Sprint 3b then retired the per-product
  // /pricing/management-os and /pricing/development-os pages entirely
  // (the Stage-10.I.4 tier model was incompatible with the
  // Sprint-3a/3b plan_packaging model and held a duplicate source of
  // truth). Both former URLs now 308 to the consolidated /pricing.
  { source: "/pricing/management-os", destination: "/pricing" },
  { source: "/pricing/development-os", destination: "/pricing" },
  // /development-os
  { source: "/development-os/cabinets", destination: "/development-os/cabinets/my-cabinet" },
  { source: "/development-os/notifications", destination: "/development-os/settings/notifications" },
  { source: "/development-os/operations/site-reports", destination: "/development-os/site-reports" },
  { source: "/development-os/projects/new", destination: "/development-os/projects" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin tracing root to this package so Next doesn't walk up to parent lockfiles.
  outputFileTracingRoot: __dirname,
  async redirects() {
    return STAGE_10_C_REDIRECTS.map((r) => ({
      source: r.source,
      destination: r.destination,
      permanent: true,
    }));
  },
};

export default nextConfig;
