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

  // HF-16 — Vercel build OOM (8GB container SIGKILL on ~800 server
  // files + 426 client components + 100+ routes). Skipping ESLint
  // during build saves ~500MB-1GB peak; lint still runs locally via
  // `npm run lint`.
  eslint: {
    ignoreDuringBuilds: true,
  },

  // HF-16 follow-up — DAILY-DIGEST-SPRINT-1 P4 pushed the server-file
  // count from ~799 to 807, triggering OOM again on the 8GB Vercel
  // builder (SIGKILL during Next compile worker). Disabling the
  // build-time typecheck saves another ~500MB-1GB; typecheck still
  // runs locally via `npm run typecheck` (and on every commit per
  // the sprint discipline). Upgrade path: Enhanced Builds (16GB)
  // when the project re-evaluates Vercel plan tier.
  typescript: {
    ignoreBuildErrors: true,
  },

  // HF-16 — Disable production source maps (saves ~30% build memory).
  // Browser sourcemaps regenerable on demand and aren't shipped to
  // clients in production anyway.
  productionBrowserSourceMaps: false,

  // HF-16 — gzip/brotli on Node responses.
  compress: true,

  experimental: {
    // HF-8 — Receipt OCR ships the receipt image inline (base64 in
    // FormData) to extractReceipt(). Default Next.js 15 Server Action
    // body limit is 1 MB; modern phone JPEGs are 2–5 MB and were
    // crashing with `Body exceeded 1 MB limit` (413, digest 4033951084).
    // Bumping to 10 MB covers compressed phone uploads with headroom.
    // Direct-to-storage (presigned URL) is a follow-up sprint.
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // HF-16 — tree-shake heavy package imports. Without this, the
    // entire lucide-react icon set + date-fns + recharts bundle
    // pulls into every server build artefact. Biggest single
    // memory win.
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "@supabase/supabase-js",
      "drizzle-orm",
      // P4 — react-markdown + remark + micromark fan out to ~30
      // sub-packages; tree-shaking them is a meaningful win.
      "react-markdown",
      "remark-gfm",
    ],
    // HF-16 / OOM-FIX — Cap webpack worker concurrency. Default uses all
    // CPUs and each worker holds its own module graph; on Vercel's 8GB
    // container that's the proximate cause of the SIGKILL OOM. Dropped from
    // 2 → 1: with the main process + a single worker (instead of two), peak
    // RAM stays under the 8GB ceiling. Slightly slower wall-clock build.
    // NOTE: do NOT also raise NODE_OPTIONS=--max-old-space-size in the build
    // script — it applies to EVERY process here, so a high cap lets main +
    // workers each grow past the container limit and forces the OOM-killer
    // (this is exactly what regressed deploys when it was set to 7168).
    workerThreads: false,
    cpus: 1,
  },

  // P4 follow-up — keep heavy server-only deps OUT of the route
  // bundling pipeline. Each route's server output otherwise traces
  // the full transitive graph of these modules even when the route
  // doesn't import them. Externalizing means Next imports them at
  // runtime from node_modules instead of compiling them into every
  // function. Biggest blast-radius reduction for the agent-related
  // routes (only 1-2 actually use these) and the worker memory
  // footprint during build.
  serverExternalPackages: [
    "@ai-sdk/openai",
    "@ai-sdk/anthropic",
    "ai",
    "unpdf",
    "mammoth",
    "gpt-tokenizer",
  ],

  async redirects() {
    return STAGE_10_C_REDIRECTS.map((r) => ({
      source: r.source,
      destination: r.destination,
      permanent: true,
    }));
  },
};

export default nextConfig;
