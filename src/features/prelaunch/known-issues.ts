/**
 * Prompt 115 — Pre-launch known issues registry.
 *
 * The single typed source of truth for "what is intentionally not
 * built / not finished" in Management OS v1.  Used by:
 *   - the pre-launch dashboard card on `/dashboard/demo`,
 *   - `docs/MANAGEMENT_OS_V1_SCOPE_FREEZE.md` and the post-v1 backlog,
 *   - the P115 test suite (every blocker must have a non-empty `notes`
 *     field, every issue must have a documented severity / status /
 *     target).
 *
 * Pure module — no DB, no env, no `server-only`.  Safe to import from
 * tests, scripts, and React Server Components.
 */

export type IssueSeverity = "blocker" | "important" | "minor" | "accepted";
export type IssueStatus = "fixed" | "accepted" | "deferred";
export type IssueTarget = "v1" | "post_v1" | "v2";

export interface KnownIssue {
  id: string;
  area: string;
  title: string;
  severity: IssueSeverity;
  status: IssueStatus;
  target: IssueTarget;
  notes: string;
}

/**
 * Curated from P108–P114 ADRs + READMEs.  Reflects the *intentional*
 * scope: items here are either:
 *   - fixed in v1 (and kept as a record of what was deferred earlier),
 *   - accepted for v1 demo / staging launch (with explicit notes),
 *   - deferred to post-v1 with a target band.
 *
 * The registry is conservative: a bug that should block v1 is marked
 * `severity: "blocker"` and `status: "deferred"` only with a clear
 * note explaining the trade-off.  See P115 ADR.
 */
export const KNOWN_ISSUES: KnownIssue[] = [
  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------
  {
    id: "PSP-001",
    area: "Direct booking · payments",
    title: "No real PSP — Stripe / Xendit / Midtrans deferred",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "Direct-booking deposits use the manual provider stub. No real card capture, no webhook secrets, no payouts. Deposit + balance flow is fully testable end-to-end via the manual stub. See ADR-0029.",
  },
  {
    id: "PSP-002",
    area: "Direct booking · refunds",
    title: "Refund path issues a manual ledger entry only",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "There is no automated refund call to a PSP. Operators record the refund in finance manually after the off-platform refund executes.",
  },
  // -------------------------------------------------------------------------
  // OTA / channel
  // -------------------------------------------------------------------------
  {
    id: "OTA-001",
    area: "Pricing · channel push",
    title: "Channel push is a simulation",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "`/dashboard/pricing/channel-push` writes a log row + bumps a counter; no real OTA write API is called. Inbound iCal sync is real where a feed URL is provided.",
  },
  {
    id: "OTA-002",
    area: "Integrations · OTA write API",
    title: "No OTA write back (Booking.com / Airbnb)",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "Outbound rate / availability writes require a paid channel-manager (Hostex / Hostaway / PriceLabs). Read-only iCal coverage works today.",
  },
  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  {
    id: "NOT-001",
    area: "Notifications · WhatsApp / Telegram",
    title: "WhatsApp + Telegram providers not wired",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "Provider abstraction exists for in_app + email (Resend) + SMS (Twilio). WhatsApp Business API + Telegram bot tokens are deferred. ADR-0010.",
  },
  {
    id: "NOT-002",
    area: "Notifications · production go-live",
    title: "NOTIFICATIONS_DRY_RUN must be flipped explicitly",
    severity: "important",
    status: "accepted",
    target: "v1",
    notes:
      "Default is dry-run safe. Operator must set NOTIFICATIONS_DRY_RUN=0 + Resend/Twilio env before live delivery. Production gate enforces explicit value.",
  },
  // -------------------------------------------------------------------------
  // AI
  // -------------------------------------------------------------------------
  {
    id: "AI-001",
    area: "AI · write tools",
    title: "AI Operations Co-pilot is read-only",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "AI assistants surface insights but never mutate state. No write tools, no auto-actions. Approval-gated write tools are post-v1.",
  },
  {
    id: "AI-002",
    area: "AI · concierge handoff",
    title: "Guest AI hands off to staff once confidence drops",
    severity: "minor",
    status: "fixed",
    target: "v1",
    notes:
      "Working as designed. Documented in ADR-0019 / ADR-0020.",
  },
  // -------------------------------------------------------------------------
  // Security
  // -------------------------------------------------------------------------
  {
    id: "SEC-001",
    area: "Security · WebAuthn / passkeys",
    title: "WebAuthn / passkeys not implemented",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "TOTP MFA + recovery codes are live. WebAuthn is post-v1. ADR-0034.",
  },
  {
    id: "SEC-002",
    area: "Security · login throttling",
    title: "Throttle is best-effort at the app layer",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "App-level rate limit on the login form. Full server-side enforcement (auth proxy / Cloudflare Turnstile) is post-v1. Default per-email + per-IP windows applied today.",
  },
  {
    id: "SEC-003",
    area: "Security · audit completeness",
    title: "Sensitive-table audit covers 14 tables",
    severity: "minor",
    status: "fixed",
    target: "v1",
    notes:
      "Postgres trigger writes to auth_security_events for sensitive INSERT/UPDATE/DELETE. Add tables here as the schema grows.",
  },
  {
    id: "SEC-004",
    area: "Security · storage AV scanning",
    title: "No anti-virus / content moderation on uploads",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "EXIF strip + MIME allowlist + size cap + private bucket + signed URLs in place. ClamAV / vendor moderation is post-v1.",
  },
  // -------------------------------------------------------------------------
  // Smart home / IoT
  // -------------------------------------------------------------------------
  {
    id: "IOT-001",
    area: "Guest stay · smart lock",
    title: "Smart-lock provider is a stub",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "Lock-code issuance + revoke records intent. No real Aqara / TTLock / SchlageIO call. Post-v1: integrate one provider + sign-off the on-call runbook.",
  },
  // -------------------------------------------------------------------------
  // Owner / finance
  // -------------------------------------------------------------------------
  {
    id: "FIN-001",
    area: "Finance · FX conversion",
    title: "Owner revenue views show IDR only",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "All money is BIGINT IDR minor units. No live FX rate; owner revenue views label IDR explicitly. USD/EUR display is post-v1.",
  },
  {
    id: "FIN-002",
    area: "Finance · accountancy export",
    title: "No Xero / QuickBooks export",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "Owner statements are the canonical record (PDF + DB). External-accountancy-package export is post-v1.",
  },
  // -------------------------------------------------------------------------
  // Vendor portal
  // -------------------------------------------------------------------------
  {
    id: "VEN-001",
    area: "Vendor · payouts",
    title: "Vendor portal has no payout provider",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "Vendor invoices are visible + downloadable; settlement is recorded manually. Real Wise / Indonesian-bank rails are post-v1.",
  },
  // -------------------------------------------------------------------------
  // i18n / accessibility / PWA
  // -------------------------------------------------------------------------
  {
    id: "UX-001",
    area: "UX · localisation",
    title: "English-only UI",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "Copy strings are not externalised. EN/ID/RU/JA is post-v1.",
  },
  {
    id: "UX-002",
    area: "UX · field PWA offline",
    title: "Field app is online-first",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "Service-worker cache for the offline guest stay page exists. Full offline-first task runner with sync is post-v1.",
  },
  // -------------------------------------------------------------------------
  // Operations / seed
  // -------------------------------------------------------------------------
  {
    id: "OPS-001",
    area: "Operations · production minimal seed",
    title: "Production-minimal seed is a documented stub",
    severity: "accepted",
    status: "accepted",
    target: "v1",
    notes:
      "`npm run seed:production:minimal` prints what production should contain and exits 0. Roles / permissions / templates are auto-applied by migrations. Replace with a thin SQL applier post-v1 if needed.",
  },
  {
    id: "OPS-002",
    area: "Operations · SIEM / Sentry",
    title: "Logger emits JSON to stdout; no SIEM hookup yet",
    severity: "accepted",
    status: "accepted",
    target: "post_v1",
    notes:
      "Structured logger with redacted field allowlist is in place. Wiring to Sentry / Logtail / Datadog is post-v1.",
  },
];

export interface KnownIssueSummary {
  total: number;
  byStatus: Record<IssueStatus, number>;
  bySeverity: Record<IssueSeverity, number>;
  byTarget: Record<IssueTarget, number>;
}

export function summariseKnownIssues(
  issues: KnownIssue[] = KNOWN_ISSUES,
): KnownIssueSummary {
  const summary: KnownIssueSummary = {
    total: issues.length,
    byStatus: { fixed: 0, accepted: 0, deferred: 0 },
    bySeverity: { blocker: 0, important: 0, minor: 0, accepted: 0 },
    byTarget: { v1: 0, post_v1: 0, v2: 0 },
  };
  for (const issue of issues) {
    summary.byStatus[issue.status] += 1;
    summary.bySeverity[issue.severity] += 1;
    summary.byTarget[issue.target] += 1;
  }
  return summary;
}

export function listBlockers(
  issues: KnownIssue[] = KNOWN_ISSUES,
): KnownIssue[] {
  return issues.filter(
    (i) => i.severity === "blocker" && i.status !== "fixed",
  );
}

export function listAcceptedForV1(
  issues: KnownIssue[] = KNOWN_ISSUES,
): KnownIssue[] {
  return issues.filter(
    (i) =>
      i.target === "v1" &&
      (i.status === "accepted" || i.status === "fixed"),
  );
}

export function listDeferredToPostV1(
  issues: KnownIssue[] = KNOWN_ISSUES,
): KnownIssue[] {
  return issues.filter((i) => i.target === "post_v1");
}
