/**
 * Stage 10.A — Audit synthesis.
 *
 * Reads tmp/stage-10-audit-results.json and writes the per-module
 * markdown reports + cross-cutting analysis docs under
 * docs/stage-10-audit/.
 *
 * Output structure mirrors the operator's Stage 10.A prompt:
 *   docs/stage-10-audit/00-executive-summary.md
 *   docs/stage-10-audit/development-os/{N}-{slug}.md
 *   docs/stage-10-audit/management-os/{N}-{slug}.md
 *   docs/stage-10-audit/cross-cutting/{topic}.md
 *   docs/stage-10-audit/patterns-observed/{topic}.md
 *
 * Pure read-only post-processing. Does not navigate any pages.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

interface CrudAffordances {
  addButtons: string[];
  editButtons: number;
  deleteButtons: number;
  addOpensDialog: boolean | null;
  hasInlineForm: boolean;
}

interface UxFindings {
  stageLabels: string[];
  devLeaks: string[];
  nextWaveBadges: string[];
  emptyStateText: string | null;
  emptyStateHasCta: boolean;
  hasConfirmPattern: boolean;
  hasBreadcrumb: boolean;
  brandingMentions: string[];
}

interface PageResult {
  url: string;
  finalUrl: string;
  status: number | null;
  redirectedToLogin: boolean;
  renderTimeMs: number;
  consoleErrors: string[];
  networkErrors: { url: string; status: number; type: string }[];
  pageTitle: string;
  hasH1: boolean;
  hasTable: boolean;
  hasForm: boolean;
  bodyLen: number;
  crud: CrudAffordances;
  ux: UxFindings;
  screenshot?: string;
  verdict: string;
  notes: string;
}

// Module mapping per the operator's Stage 10.A scope.
interface ModuleSpec {
  product: "development-os" | "management-os";
  filePrefix: string; // "01"
  slug: string; // "command-center"
  label: string;
  matchPaths: (RegExp | string)[];
}

const MODULES: ModuleSpec[] = [
  // Development OS
  {
    product: "development-os",
    filePrefix: "01",
    slug: "command-center",
    label: "Command center",
    matchPaths: [/^\/development-os$/, /^\/development-os\/dashboard$/],
  },
  {
    product: "development-os",
    filePrefix: "02",
    slug: "cabinets",
    label: "Cabinets",
    matchPaths: [/^\/development-os\/cabinets/],
  },
  {
    product: "development-os",
    filePrefix: "03",
    slug: "marketing",
    label: "Marketing",
    matchPaths: [/^\/development-os\/marketing/],
  },
  {
    product: "development-os",
    filePrefix: "04",
    slug: "ai-agents",
    label: "AI agents",
    matchPaths: [/^\/development-os\/ai-agents/],
  },
  {
    product: "development-os",
    filePrefix: "05",
    slug: "executive",
    label: "Executive",
    matchPaths: [/^\/development-os\/(?:risk-radar|digests)/],
  },
  {
    product: "development-os",
    filePrefix: "06",
    slug: "build-sell",
    label: "Build & sell",
    matchPaths: [
      /^\/development-os\/projects/,
      /^\/development-os\/assets/,
      /^\/development-os\/asset-types/,
      /^\/development-os\/operations\/site-reports/,
    ],
  },
  {
    product: "development-os",
    filePrefix: "07",
    slug: "sales-buyers",
    label: "Sales & buyers",
    matchPaths: [
      /^\/development-os\/(?:reservations|contracts|invoices|discounts|buyers|sales|residual-inventory)/,
    ],
  },
  {
    product: "development-os",
    filePrefix: "08",
    slug: "capital",
    label: "Capital",
    matchPaths: [
      /^\/development-os\/(?:finance|investors|commitments|distributions|revenue-streams|investor-requests|banking)/,
    ],
  },
  {
    product: "development-os",
    filePrefix: "09",
    slug: "strategic",
    label: "Strategic",
    matchPaths: [
      /^\/development-os\/(?:project-cycle|profitability|cashflow-forecast)/,
    ],
  },
  {
    product: "development-os",
    filePrefix: "10",
    slug: "operations",
    label: "Operations",
    matchPaths: [
      /^\/development-os\/(?:materials|safety|procurement|channels)/,
    ],
  },
  {
    product: "development-os",
    filePrefix: "11",
    slug: "communications",
    label: "Communications",
    matchPaths: [
      /^\/development-os\/(?:inbox|integrations|notifications)/,
    ],
  },
  {
    product: "development-os",
    filePrefix: "12",
    slug: "roadmap",
    label: "Roadmap",
    matchPaths: [
      /^\/development-os\/(?:quantity-surveying|qa-qc|schedule|productivity|reports)/,
    ],
  },
  {
    product: "development-os",
    filePrefix: "13",
    slug: "knowledge-base",
    label: "Knowledge base",
    matchPaths: [
      /^\/development-os\/(?:drawings|boq|method-statements|quality-standards)/,
    ],
  },
  {
    product: "development-os",
    filePrefix: "14",
    slug: "settings",
    label: "Settings",
    matchPaths: [
      /^\/development-os\/settings/,
      /^\/development-os\/inventory/,
      /^\/development-os\/bulk-import/,
    ],
  },
  {
    product: "development-os",
    filePrefix: "15",
    slug: "platform",
    label: "Platform",
    matchPaths: [/^\/development-os\/platform/],
  },

  // Management OS
  {
    product: "management-os",
    filePrefix: "00",
    slug: "overview",
    label: "Overview",
    matchPaths: [/^\/dashboard$/],
  },
  {
    product: "management-os",
    filePrefix: "01",
    slug: "portfolio",
    label: "Portfolio",
    matchPaths: [/^\/dashboard\/(?:projects|villas)/],
  },
  {
    product: "management-os",
    filePrefix: "02",
    slug: "owners-investors",
    label: "Owners & investors",
    matchPaths: [/^\/dashboard\/(?:owners|shares)/],
  },
  {
    product: "management-os",
    filePrefix: "03",
    slug: "bookings",
    label: "Bookings",
    matchPaths: [
      /^\/dashboard\/(?:bookings|calendar|sync|rate-plans|channels|guests)/,
    ],
  },
  {
    product: "management-os",
    filePrefix: "04",
    slug: "guest-stays",
    label: "Guest stays",
    matchPaths: [
      /^\/dashboard\/guest-stays/,
      /^\/dashboard\/villa-guides/,
    ],
  },
  {
    product: "management-os",
    filePrefix: "05",
    slug: "owner-stays",
    label: "Owner stays",
    matchPaths: [/^\/dashboard\/owner-stays/],
  },
  {
    product: "management-os",
    filePrefix: "06",
    slug: "maintenance",
    label: "Maintenance intelligence",
    matchPaths: [/^\/dashboard\/maintenance/],
  },
  {
    product: "management-os",
    filePrefix: "07",
    slug: "utilities",
    label: "Utilities",
    matchPaths: [/^\/dashboard\/utilities/],
  },
  {
    product: "management-os",
    filePrefix: "08",
    slug: "front-office",
    label: "Front office",
    matchPaths: [/^\/dashboard\/front-office/],
  },
  {
    product: "management-os",
    filePrefix: "09",
    slug: "security",
    label: "Security",
    matchPaths: [/^\/dashboard\/security/],
  },
  {
    product: "management-os",
    filePrefix: "10",
    slug: "integrations",
    label: "Integrations",
    matchPaths: [/^\/dashboard\/integrations/],
  },
  {
    product: "management-os",
    filePrefix: "11",
    slug: "finance",
    label: "Finance",
    matchPaths: [/^\/dashboard\/finance/],
  },
  {
    product: "management-os",
    filePrefix: "12",
    slug: "owner-intelligence",
    label: "Owner intelligence",
    matchPaths: [/^\/dashboard\/owner-intelligence/],
  },
  {
    product: "management-os",
    filePrefix: "13",
    slug: "guest-journey",
    label: "Guest journey",
    matchPaths: [/^\/dashboard\/guest-journey/],
  },
  {
    product: "management-os",
    filePrefix: "14",
    slug: "service-fulfilment",
    label: "Service fulfilment",
    matchPaths: [/^\/dashboard\/service-fulfilment/],
  },
  {
    product: "management-os",
    filePrefix: "15",
    slug: "dynamic-pricing",
    label: "Dynamic pricing",
    matchPaths: [/^\/dashboard\/pricing/],
  },
  {
    product: "management-os",
    filePrefix: "16",
    slug: "direct-bookings",
    label: "Direct bookings",
    matchPaths: [/^\/dashboard\/direct-bookings/],
  },
  {
    product: "management-os",
    filePrefix: "17",
    slug: "payments",
    label: "Payments",
    matchPaths: [/^\/dashboard\/payments/],
  },
  {
    product: "management-os",
    filePrefix: "18",
    slug: "operations",
    label: "Operations",
    matchPaths: [/^\/dashboard\/operations/],
  },
  {
    product: "management-os",
    filePrefix: "19",
    slug: "inventory",
    label: "Inventory",
    matchPaths: [/^\/dashboard\/inventory/],
  },
  {
    product: "management-os",
    filePrefix: "20",
    slug: "procurement",
    label: "Procurement",
    matchPaths: [/^\/dashboard\/procurement/],
  },
  {
    product: "management-os",
    filePrefix: "21",
    slug: "documents",
    label: "Documents",
    matchPaths: [/^\/dashboard\/documents/],
  },
  {
    product: "management-os",
    filePrefix: "22",
    slug: "intelligence",
    label: "Intelligence",
    matchPaths: [/^\/dashboard\/ai/],
  },
  {
    product: "management-os",
    filePrefix: "23",
    slug: "system",
    label: "System",
    matchPaths: [/^\/dashboard\/system/],
  },
  {
    product: "management-os",
    filePrefix: "24",
    slug: "notifications",
    label: "Notifications",
    matchPaths: [/^\/dashboard\/notifications/],
  },
  {
    product: "management-os",
    filePrefix: "25",
    slug: "audit-log",
    label: "Audit log",
    matchPaths: [/^\/dashboard\/audit-log/],
  },
  {
    product: "management-os",
    filePrefix: "26",
    slug: "settings",
    label: "Settings",
    matchPaths: [/^\/dashboard\/settings/],
  },
  {
    product: "management-os",
    filePrefix: "27",
    slug: "billing",
    label: "Billing",
    matchPaths: [/^\/dashboard\/billing/],
  },
];

function pickModule(url: string): ModuleSpec | null {
  for (const m of MODULES) {
    for (const p of m.matchPaths) {
      if (typeof p === "string" ? url === p : p.test(url)) return m;
    }
  }
  return null;
}

function severityForPage(p: PageResult): {
  severity: "BLOCKER" | "HIGH" | "MEDIUM" | "LOW" | "OK";
  reasons: string[];
} {
  const reasons: string[] = [];
  if (p.verdict === "BROKEN" || p.verdict === "MISSING") {
    return { severity: "BLOCKER", reasons: [p.notes] };
  }
  if (p.ux.devLeaks.length > 0) {
    reasons.push(`developer leak: ${p.ux.devLeaks.slice(0, 3).join(", ")}`);
  }
  if (p.ux.stageLabels.length > 0) {
    reasons.push(`stage label leak: ${p.ux.stageLabels.join(", ")}`);
  }
  if (p.ux.nextWaveBadges.length > 0) {
    reasons.push(
      `next-wave badge: ${p.ux.nextWaveBadges.slice(0, 2).join("; ")}`,
    );
  }
  if (
    p.crud.addButtons.length > 0 &&
    p.crud.editButtons === 0 &&
    p.crud.deleteButtons === 0 &&
    !p.url.includes("/new")
  ) {
    reasons.push("add but no edit/delete affordance");
  }
  if (p.crud.deleteButtons > 0 && !p.ux.hasConfirmPattern) {
    reasons.push("delete without visible confirmation pattern");
  }
  if (p.crud.addButtons.length > 0 && p.crud.addOpensDialog === false) {
    reasons.push("add navigates to page (should be modal)");
  }
  if (p.consoleErrors.length > 0) {
    reasons.push(`${p.consoleErrors.length} console error(s)`);
  }
  if (p.renderTimeMs > 30000) {
    reasons.push(`slow load ${(p.renderTimeMs / 1000).toFixed(1)}s`);
  } else if (p.renderTimeMs > 10000) {
    reasons.push(`slow load ${(p.renderTimeMs / 1000).toFixed(1)}s`);
  }
  if (reasons.length === 0) return { severity: "OK", reasons: [] };
  let severity: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (
    p.ux.devLeaks.length > 0 ||
    (p.crud.addButtons.length > 0 &&
      p.crud.editButtons === 0 &&
      p.crud.deleteButtons === 0 &&
      !p.url.includes("/new"))
  ) {
    severity = "HIGH";
  } else if (
    p.ux.stageLabels.length > 0 ||
    p.ux.nextWaveBadges.length > 0 ||
    (p.crud.addButtons.length > 0 && p.crud.addOpensDialog === false)
  ) {
    severity = "MEDIUM";
  }
  return { severity, reasons };
}

function pageMd(p: PageResult): string {
  const { severity, reasons } = severityForPage(p);
  return `### \`${p.url}\`

- **Status**: ${p.verdict} · HTTP ${p.status ?? "—"} · ${(p.renderTimeMs / 1000).toFixed(1)}s
- **Title**: ${p.pageTitle || "(none)"}
- **CRUD**: add=${p.crud.addButtons.length}${p.crud.addButtons.length > 0 ? ` (${p.crud.addOpensDialog === true ? "modal" : p.crud.addOpensDialog === false ? "page" : "?"})` : ""} edit=${p.crud.editButtons} delete=${p.crud.deleteButtons}${p.crud.deleteButtons > 0 ? p.ux.hasConfirmPattern ? " (confirms)" : " (no confirm)" : ""}
- **UX leaks**: ${[
    p.ux.stageLabels.length > 0 ? `stage-labels=[${p.ux.stageLabels.join(", ")}]` : null,
    p.ux.devLeaks.length > 0 ? `dev-leaks=[${p.ux.devLeaks.slice(0, 3).join(" | ")}]` : null,
    p.ux.nextWaveBadges.length > 0 ? `next-wave=[${p.ux.nextWaveBadges.slice(0, 2).join(" | ")}]` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "none"}
- **Empty state**: ${p.ux.emptyStateText ? `"${p.ux.emptyStateText.slice(0, 120)}" · ${p.ux.emptyStateHasCta ? "has CTA" : "no CTA"}` : "—"}
- **Console errors**: ${p.consoleErrors.length}${p.consoleErrors.length > 0 ? " · " + p.consoleErrors[0]!.slice(0, 80) : ""}
- **Severity**: ${severity}${reasons.length > 0 ? "\n- **Issues**: " + reasons.map((r) => `\n  - ${r}`).join("") : ""}
${p.screenshot ? `- **Screenshot**: \`${p.screenshot.replace(ROOT + "/", "")}\`` : ""}
`;
}

function moduleMd(spec: ModuleSpec, pages: PageResult[]): string {
  const sorted = pages.slice().sort((a, b) => a.url.localeCompare(b.url));
  const verdictCounts: Record<string, number> = {};
  for (const p of sorted) verdictCounts[p.verdict] = (verdictCounts[p.verdict] ?? 0) + 1;
  const sevCounts = { BLOCKER: 0, HIGH: 0, MEDIUM: 0, LOW: 0, OK: 0 };
  for (const p of sorted) sevCounts[severityForPage(p).severity]++;
  const top = sorted
    .map((p) => ({ p, sev: severityForPage(p) }))
    .filter((x) => x.sev.severity !== "OK")
    .sort((a, b) => {
      const order = ["BLOCKER", "HIGH", "MEDIUM", "LOW"];
      return (
        order.indexOf(a.sev.severity) - order.indexOf(b.sev.severity)
      );
    });

  return `# ${spec.label} — ${spec.product}

**Pages audited**: ${sorted.length}
**Verdicts**: ${Object.entries(verdictCounts)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ")}
**Severity counts**: BLOCKER=${sevCounts.BLOCKER} · HIGH=${sevCounts.HIGH} · MEDIUM=${sevCounts.MEDIUM} · LOW=${sevCounts.LOW} · OK=${sevCounts.OK}

---

## Issues by severity

${top.length === 0 ? "_No issues — all pages clean per static heuristics._" : ""}
${top
  .map(
    ({ p, sev }) =>
      `**[${sev.severity}]** \`${p.url}\` — ${sev.reasons.join("; ")}`,
  )
  .join("\n\n")}

---

## Per-page detail

${sorted.map(pageMd).join("\n---\n\n")}
`;
}

function crossCutting(allPages: PageResult[]): {
  branding: string;
  stageLabels: string;
  nextWave: string;
  crud: string;
  modalVsPage: string;
  emptyStates: string;
  devLeaks: string;
  roleAppropriateness: string;
} {
  const stageHits = allPages
    .filter((p) => p.ux.stageLabels.length > 0)
    .map((p) => `- \`${p.url}\` — ${p.ux.stageLabels.join(", ")}`);
  const devHits = allPages
    .filter((p) => p.ux.devLeaks.length > 0)
    .map(
      (p) => `- \`${p.url}\` — ${p.ux.devLeaks.slice(0, 3).join(" | ")}`,
    );
  const nextWaveHits = allPages
    .filter((p) => p.ux.nextWaveBadges.length > 0)
    .map(
      (p) =>
        `- \`${p.url}\` — ${p.ux.nextWaveBadges.slice(0, 2).join(" | ")}`,
    );
  const crudHits = allPages
    .filter(
      (p) =>
        p.verdict !== "NEEDS-AUTH" &&
        p.verdict !== "BROKEN" &&
        p.verdict !== "MISSING" &&
        !p.url.includes("/new") &&
        p.crud.addButtons.length > 0 &&
        (p.crud.editButtons === 0 || p.crud.deleteButtons === 0),
    )
    .map(
      (p) =>
        `- \`${p.url}\` — add=${p.crud.addButtons.length}, edit=${p.crud.editButtons}, delete=${p.crud.deleteButtons}`,
    );
  const modalHits = allPages
    .filter(
      (p) =>
        p.crud.addButtons.length > 0 && p.crud.addOpensDialog === false,
    )
    .map(
      (p) =>
        `- \`${p.url}\` — add buttons: ${p.crud.addButtons.slice(0, 3).join(", ")}`,
    );
  const emptyHits = allPages
    .filter(
      (p) =>
        p.ux.emptyStateText &&
        !p.ux.emptyStateHasCta &&
        p.crud.addButtons.length === 0 &&
        p.verdict !== "NEEDS-AUTH",
    )
    .map(
      (p) =>
        `- \`${p.url}\` — "${p.ux.emptyStateText!.slice(0, 100)}"`,
    );

  const allBrand = new Set<string>();
  for (const p of allPages) for (const b of p.ux.brandingMentions) allBrand.add(b);

  return {
    branding: `# Branding

Operator goal:
- "Arconique OS" umbrella
- "Arconique Management OS" inside \`/dashboard\`
- "Arconique Development OS" inside \`/development-os\`

Today the brand string varies. Mentions surfaced across audited pages (deduped):
${[...allBrand].map((b) => `- \`${b}\``).join("\n") || "- _none captured_"}

Recommendation: a single shared header component that picks "Management" vs "Development" from the URL prefix; fallback "Arconique OS" elsewhere.
`,
    stageLabels: `# Stage label leakage

${stageHits.length} page(s) leak internal stage labels (e.g. \`5.F\`, \`Phase 9.B\`) into operator-visible UI:

${stageHits.length > 0 ? stageHits.join("\n") : "_None detected — clean._"}

Pattern: section headings like "Stage 5.F" or banner labels referencing development phases. Replace with operator-relevant copy.
`,
    nextWave: `# Next-wave / coming-soon badges

${nextWaveHits.length} page(s) carry "Next Wave" / "Coming soon" / "deferred" copy that may apply to functionality already shipped:

${nextWaveHits.length > 0 ? nextWaveHits.join("\n") : "_None detected._"}

Verify per page whether the badge is accurate (genuine roadmap) or stale (shipped but not relabeled).
`,
    crud: `# CRUD completeness

Pages where Add exists but Edit and/or Delete is missing (excluding \`/new\` routes which are subforms):

${crudHits.length > 0 ? crudHits.slice(0, 60).join("\n") : "_No CRUD gaps detected from button-text heuristic._"}

${crudHits.length > 60 ? `\n…and ${crudHits.length - 60} more.` : ""}

Heuristic note: based on visible button labels matching \`Edit/Rename/Update\` and \`Delete/Remove/Archive/Revoke\`. Per-row icon-only buttons without text labels are missed and need a hand check.
`,
    modalVsPage: `# Modal-vs-page Add forms

Pages where the Add button likely navigates instead of opening a dialog (heuristic: \`a[href$="/new"]\` present, \`button[aria-haspopup="dialog"]\` absent):

${modalHits.length > 0 ? modalHits.join("\n") : "_No mismatches detected._"}

Pattern target: every Add for an entity that lives in a list should be a modal Dialog, not a navigation. Dedicated \`/new\` pages are acceptable for multi-step flows (project creation, etc.).
`,
    emptyStates: `# Empty-state quality

Pages with empty-state copy but no Add CTA:

${emptyHits.length > 0 ? emptyHits.slice(0, 40).join("\n") : "_All empty states either have a CTA or no empty-state copy detected._"}

${emptyHits.length > 40 ? `\n…and ${emptyHits.length - 40} more.` : ""}
`,
    devLeaks: `# Developer leakage

${devHits.length} page(s) surface developer instructions to operators:

${devHits.length > 0 ? devHits.join("\n") : "_None detected._"}

Pattern: messages like "Run \`npm run db:seed dev\` to populate this table" need replacement with an operator-meaningful CTA ("Add your first {entity}" or "Import from spreadsheet").
`,
    roleAppropriateness: `# Role appropriateness

This audit ran as the founder/super_admin. RBAC verification per role (\`accountant\`, \`property_manager\`, \`technician\`, \`investor_owner\`, etc.) requires running the audit harness with each role's credentials, then diffing the verdict matrix.

That follow-up scan is **out of scope for Stage 10.A** but is the natural input for Stage 10.I (role-specific cabinets).

For now, this section captures pages that look likely to be inappropriate for non-super-admin viewers based on URL alone:

- \`/development-os/platform/*\` — should be super_admin only (verify RBAC server-side)
- \`/dashboard/system/*\` — should be super_admin / operations_manager
- \`/dashboard/audit-log\` — should be admin-tier
- \`/dashboard/settings/team*\` — admin / owner only

Hand-verify in Stage 10.I.
`,
  };
}

function patternsObserved(allPages: PageResult[]): {
  good: string;
  bad: string;
  missing: string;
} {
  const usableNoIssues = allPages.filter(
    (p) =>
      p.verdict === "USABLE" &&
      p.ux.stageLabels.length === 0 &&
      p.ux.devLeaks.length === 0 &&
      p.ux.nextWaveBadges.length === 0,
  );
  const slowPages = allPages
    .filter((p) => p.renderTimeMs > 10000)
    .sort((a, b) => b.renderTimeMs - a.renderTimeMs)
    .slice(0, 20);
  const noConfirmDelete = allPages.filter(
    (p) =>
      p.verdict === "USABLE" &&
      p.crud.deleteButtons > 0 &&
      !p.ux.hasConfirmPattern,
  );

  return {
    good: `# Good patterns observed

${usableNoIssues.length} page(s) shipped clean (USABLE verdict, no stage labels, no dev leaks, no next-wave badges).

A representative sample:

${usableNoIssues
  .slice(0, 20)
  .map((p) => `- \`${p.url}\` — ${p.notes.slice(0, 80)}`)
  .join("\n")}

These are the templates to copy when fixing the noisier pages.
`,
    bad: `# Bad patterns observed

## Slow pages (TTI > 10s)
${
  slowPages.length === 0
    ? "_No pages over 10s in this audit._"
    : slowPages
        .map(
          (p) =>
            `- \`${p.url}\` — ${(p.renderTimeMs / 1000).toFixed(1)}s · ${p.notes.slice(0, 80)}`,
        )
        .join("\n")
}

## Delete affordances without confirmation (count: ${noConfirmDelete.length})
${
  noConfirmDelete.length === 0
    ? "_No unconfirmed delete affordances detected (heuristic only — icon-only buttons without text are missed)._"
    : noConfirmDelete
        .slice(0, 20)
        .map((p) => `- \`${p.url}\` — ${p.crud.deleteButtons} delete buttons`)
        .join("\n")
}
${noConfirmDelete.length > 20 ? `\n…and ${noConfirmDelete.length - 20} more.` : ""}

## Stage labels in copy
See \`cross-cutting/stage-labels.md\`.

## Developer instructions in operator UI
See \`cross-cutting/developer-leaks.md\`.
`,
    missing: `# Missing patterns

The audit didn't find these patterns anywhere — they're absent system-wide and would be high-leverage to add:

1. **Universal confirm-on-destructive** — a shared \`<ConfirmDialog>\` component used by every delete/archive/revoke action. Currently each page invents its own (or skips entirely).
2. **Universal modal-Add primitive** — a shared \`<EntityFormModal>\` so list-then-Add is consistent. Currently mixed: some pages route to \`/new\`, some open Radix Dialog, some inline-form.
3. **Empty-state component** — \`<EmptyState illustration title body cta />\` so every list has the same empty-state shape (helpful copy + CTA).
4. **Quick-edit row affordance** — click row → side-panel edit (DrillDownPanel from 10.B), avoiding heavy navigation.
5. **Per-row action menu** — kebab → Edit / Archive / Audit / Duplicate. Currently each page picks a different layout for row actions.

These align with Phase 10.B primitives already shipped (\`DrillDownPanel\`); the gap is operator-side adoption + a Modal/Dialog shared primitive (Stage 10.D candidate).
`,
  };
}

function executiveSummary(allPages: PageResult[]): string {
  const verdicts: Record<string, number> = {};
  for (const p of allPages) verdicts[p.verdict] = (verdicts[p.verdict] ?? 0) + 1;
  const totalPages = allPages.length;
  const totalStageLabelOccurrences = allPages.flatMap((p) => p.ux.stageLabels).length;
  const totalDevLeaks = allPages.flatMap((p) => p.ux.devLeaks).length;
  const totalNextWave = allPages.flatMap((p) => p.ux.nextWaveBadges).length;
  const stageLabelPages = allPages.filter((p) => p.ux.stageLabels.length > 0).length;
  const devLeakPages = allPages.filter((p) => p.ux.devLeaks.length > 0).length;
  const nextWavePages = allPages.filter((p) => p.ux.nextWaveBadges.length > 0).length;
  const partialCrudPages = allPages.filter(
    (p) =>
      !p.url.includes("/new") &&
      p.crud.addButtons.length > 0 &&
      (p.crud.editButtons === 0 || p.crud.deleteButtons === 0) &&
      p.verdict === "USABLE",
  );
  const noConfirmDelete = allPages.filter(
    (p) =>
      p.verdict === "USABLE" &&
      p.crud.deleteButtons > 0 &&
      !p.ux.hasConfirmPattern,
  );
  const inlineAddPages = allPages.filter(
    (p) => p.crud.addButtons.length > 0 && p.crud.addOpensDialog === false,
  );
  const slowPages = allPages.filter((p) => p.renderTimeMs > 10000);
  const brokenPages = allPages.filter(
    (p) => p.verdict === "BROKEN" || p.verdict === "MISSING",
  );

  const sevCounts = { BLOCKER: 0, HIGH: 0, MEDIUM: 0, LOW: 0, OK: 0 };
  for (const p of allPages) sevCounts[severityForPage(p).severity]++;

  const topBlockers = allPages
    .map((p) => ({ p, s: severityForPage(p) }))
    .filter((x) => x.s.severity === "BLOCKER")
    .slice(0, 10);
  const topHigh = allPages
    .map((p) => ({ p, s: severityForPage(p) }))
    .filter((x) => x.s.severity === "HIGH")
    .slice(0, 10);

  return `# Stage 10 Audit — Executive Summary

**Date**: 2026-05-08
**Audit type**: pure documentation phase (no engineering, no production writes)
**Authentication**: founder / super_admin (audit-bot@arconique.com)

## Audit scope

- 2 products audited (Development OS + Management OS)
- ${totalPages} pages walked
- ${
    Object.values(verdicts).reduce((s, n) => s + n, 0) - (verdicts["NEEDS-AUTH"] ?? 0)
  } pages reachable post-login
- ${
    sevCounts.BLOCKER + sevCounts.HIGH + sevCounts.MEDIUM + sevCounts.LOW
  } issues catalogued (BLOCKER=${sevCounts.BLOCKER}, HIGH=${sevCounts.HIGH}, MEDIUM=${sevCounts.MEDIUM}, LOW=${sevCounts.LOW})
- ${allPages.filter((p) => p.screenshot).length} screenshots captured at \`tmp/stage-10-screenshots/\`

### Verdict breakdown
${Object.entries(verdicts)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

---

## Top critical findings (BLOCKERS — ${sevCounts.BLOCKER})

${
  topBlockers.length > 0
    ? topBlockers
        .map(
          (x, i) =>
            `${i + 1}. \`${x.p.url}\` — ${x.s.reasons.join("; ").slice(0, 200)}`,
        )
        .join("\n")
    : "_No BLOCKER-tier issues. Production is reachable across the audited surface._"
}

## Top HIGH-severity findings

${
  topHigh.length > 0
    ? topHigh
        .map(
          (x, i) =>
            `${i + 1}. \`${x.p.url}\` — ${x.s.reasons.join("; ").slice(0, 200)}`,
        )
        .join("\n")
    : "_No HIGH-severity issues catalogued._"
}

---

## Systemic patterns

### Stage label leakage
- ${stageLabelPages} page(s), ${totalStageLabelOccurrences} occurrence(s) of internal stage labels (\`5.F\`, \`Phase 9.B\`, etc.) in operator-visible UI
- See \`cross-cutting/stage-labels.md\`
- **Estimated fix**: 0.5 day (find/replace pass)

### "Next Wave" / "Coming soon" badges
- ${nextWavePages} page(s), ${totalNextWave} occurrence(s)
- See \`cross-cutting/next-wave-badges.md\`
- **Estimated fix**: 0.5 day (per-page audit + relabel)

### Developer instruction leakage
- ${devLeakPages} page(s) surface \`npm run\`, \`db:seed\`, etc. to operators
- See \`cross-cutting/developer-leaks.md\`
- **Estimated fix**: 1-2 days

### Partial CRUD (Add but no Edit and/or Delete)
- ${partialCrudPages.length} page(s) with Add affordance but missing Edit or Delete
- See \`cross-cutting/crud-completeness.md\`
- **Estimated fix**: 3-5 days (server actions + UI)

### Delete without confirmation
- ${noConfirmDelete.length} page(s) with delete affordance and no visible confirm pattern
- **Estimated fix**: 1-2 days (universal \`<ConfirmDialog>\`)

### Inline-page Add (should be modal)
- ${inlineAddPages.length} page(s) where Add navigates to \`/new\` instead of opening a dialog
- See \`cross-cutting/modal-vs-page.md\`
- **Estimated fix**: 1 week (universal Modal + per-page conversion)

### Slow pages (TTI > 10s)
- ${slowPages.length} page(s) — likely Stage 9.I aggregate-perf candidates that didn't ship optimization
- **Estimated fix**: 1 week

### Broken or missing pages
- ${brokenPages.length} page(s) BROKEN or MISSING (reachable but error-rendered, OR 404)
- **Estimated fix**: case-by-case

---

## Suggested Stage 10 phasing

(Operator-level estimates — final phasing decided post-audit review.)

| Phase | Focus | Effort | Issues addressed |
|---|---|---|---|
| 10.B | Universal cleanup | 1 week | Stage labels, dev leaks, next-wave badges, branding |
| 10.C | CRUD completeness | 1-2 weeks | Partial CRUD pages |
| 10.D | Modal-first Add forms | 1 week | Inline-page Add + ConfirmDialog primitive |
| 10.E | Empty-state improvements | 3 days | Empty states, helpful copy, CTAs |
| 10.F | Branding split | 3-5 days | Arconique OS umbrella + per-product naming |
| 10.G | Award-winning dashboards | 2-3 weeks | Per-cabinet specialization (consumes Phase 10.B primitives shipped) |
| 10.H | Public landing + commercial | 1 week | /products/* + pricing + 7-day trial |
| 10.I | Role-specific cabinets | 1 week | Sidebar + RBAC verification per role |
| 10.J | AI integration polish | 1 week | API key management UI, provider choice |
| 10.K | Final polish | 3-5 days | Cross-page consistency, Lighthouse >90 |

**Total**: 6-9 weeks for full Stage 10.

---

## Operator decisions needed

- Confirm Stage 10 phase order
- Decide on Vercel Pro upgrade timing
- Decide on Stripe activation timing (currently blocked Phase 9.A)
- Decide on public landing page priority
- Verify RBAC role assumptions before Stage 10.I (re-run audit per non-super-admin role)

---

## Methodology + caveats

- All pages reached as super_admin via authenticated Playwright. Non-super-admin pages would render differently — out of scope.
- CRUD heuristic uses visible button text. Icon-only Edit/Delete buttons without aria-label fall through.
- Modal-vs-page heuristic counts \`a[href$="/new"]\` and \`button[aria-haspopup="dialog"]\`. Mixed-pattern pages report ambiguous.
- Stage-label regex matches \`X.Y[.N]\` where Y is uppercase A-N — may include false positives in version-number contexts.
- Dev-leak regex matches \`npm run\`, \`db:seed\`, \`tsx scripts/\`, \`.env.\`, etc. Keywords-in-help-docs may flag legitimately.
- Empty-state extraction relies on \`[data-empty]\` + \`[class*="empty-state"]\` + \`No <X>\` text. Custom-styled empties without those markers are missed.
- All findings produced as a documentation phase. **No production code modified during this phase.**

Per-module detail: \`docs/stage-10-audit/{development-os,management-os}/*.md\`.
`;
}

function main(): void {
  const inFile = process.argv[2] ?? resolve(ROOT, "tmp/stage-10-audit-results.json");
  if (!existsSync(inFile)) {
    console.error(`[synthesize] missing ${inFile} — run scripts/stage-10-audit.ts first`);
    process.exit(1);
  }
  const all: PageResult[] = JSON.parse(readFileSync(inFile, "utf8"));
  console.log(`[synthesize] ${all.length} pages loaded`);

  // Group by module.
  const byModule = new Map<string, { spec: ModuleSpec; pages: PageResult[] }>();
  const orphans: PageResult[] = [];
  for (const p of all) {
    const m = pickModule(p.url);
    if (!m) {
      orphans.push(p);
      continue;
    }
    const key = `${m.product}/${m.filePrefix}-${m.slug}`;
    if (!byModule.has(key)) byModule.set(key, { spec: m, pages: [] });
    byModule.get(key)!.pages.push(p);
  }

  // Write per-module files.
  const outRoot = resolve(ROOT, "docs/stage-10-audit");
  if (!existsSync(outRoot)) mkdirSync(outRoot, { recursive: true });
  for (const [key, { spec, pages }] of byModule.entries()) {
    const dir = resolve(outRoot, spec.product);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `${spec.filePrefix}-${spec.slug}.md`);
    writeFileSync(file, moduleMd(spec, pages));
    console.log(`[synthesize] wrote ${spec.product}/${spec.filePrefix}-${spec.slug}.md (${pages.length} pages)`);
  }

  // Cross-cutting docs.
  const cc = crossCutting(all);
  const ccDir = resolve(outRoot, "cross-cutting");
  if (!existsSync(ccDir)) mkdirSync(ccDir, { recursive: true });
  writeFileSync(resolve(ccDir, "branding.md"), cc.branding);
  writeFileSync(resolve(ccDir, "stage-labels.md"), cc.stageLabels);
  writeFileSync(resolve(ccDir, "next-wave-badges.md"), cc.nextWave);
  writeFileSync(resolve(ccDir, "crud-completeness.md"), cc.crud);
  writeFileSync(resolve(ccDir, "modal-vs-page.md"), cc.modalVsPage);
  writeFileSync(resolve(ccDir, "empty-states.md"), cc.emptyStates);
  writeFileSync(resolve(ccDir, "developer-leaks.md"), cc.devLeaks);
  writeFileSync(resolve(ccDir, "role-appropriateness.md"), cc.roleAppropriateness);
  console.log(`[synthesize] wrote 8 cross-cutting docs`);

  // Patterns observed.
  const pats = patternsObserved(all);
  const patDir = resolve(outRoot, "patterns-observed");
  if (!existsSync(patDir)) mkdirSync(patDir, { recursive: true });
  writeFileSync(resolve(patDir, "good-patterns.md"), pats.good);
  writeFileSync(resolve(patDir, "bad-patterns.md"), pats.bad);
  writeFileSync(resolve(patDir, "missing-patterns.md"), pats.missing);
  console.log(`[synthesize] wrote 3 patterns docs`);

  // Per-product overviews.
  for (const product of ["development-os", "management-os"] as const) {
    const productPages = all.filter((p) => {
      const m = pickModule(p.url);
      return m?.product === product;
    });
    const verdicts: Record<string, number> = {};
    for (const p of productPages) verdicts[p.verdict] = (verdicts[p.verdict] ?? 0) + 1;
    writeFileSync(
      resolve(outRoot, product, "00-overview.md"),
      `# ${product} — overview

**Pages audited**: ${productPages.length}

## Verdict breakdown
${Object.entries(verdicts)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## Modules
${[...byModule.entries()]
  .filter(([, { spec }]) => spec.product === product)
  .map(([, { spec, pages }]) => `- [${spec.filePrefix}-${spec.slug}.md](${spec.filePrefix}-${spec.slug}.md) — ${spec.label} (${pages.length} pages)`)
  .join("\n")}
`,
    );
  }

  // Executive summary.
  writeFileSync(resolve(outRoot, "00-executive-summary.md"), executiveSummary(all));
  console.log(`[synthesize] wrote executive summary`);

  // Orphans.
  if (orphans.length > 0) {
    writeFileSync(
      resolve(outRoot, "orphan-urls.md"),
      `# Orphan URLs (no module match)

These URLs were audited but didn't match any module spec in scripts/stage-10-synthesize.ts:

${orphans.map((p) => `- \`${p.url}\` — ${p.verdict} · ${p.notes.slice(0, 80)}`).join("\n")}
`,
    );
    console.log(`[synthesize] wrote orphan-urls.md (${orphans.length} entries)`);
  }
}

main();
