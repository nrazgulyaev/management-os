/**
 * Pure weekly-report assembly (no DB, no `server-only`) — unit-testable.
 *
 * The server composer (weekly-report-composer.ts) reads the persisted
 * facts for the week window and delegates to `assembleWeeklyReport()`
 * here for the deterministic structured summary + markdown body.
 *
 * Deterministic by design: an investor-facing weekly brief must be
 * reproducible and explainable. The optional LLM polish is layered on
 * top in the server module and degrades gracefully to this output when
 * AI is unconfigured — so this module is the source of truth.
 *
 * Pattern mirror: src/features/finance/statement-anomaly-rules.ts.
 */

/** A milestone that progressed (status change / completion) in the week. */
export interface WeeklyMilestoneFact {
  id: string;
  name: string;
  /** design | permit | site_prep | foundation | frame | mep | finishes | handover | other */
  kind: string;
  /** planned | in_progress | done | at_risk | slipped */
  status: string;
  targetDate: string;
  actualDate: string | null;
  /** True when this milestone was completed inside the window. */
  completedThisWeek: boolean;
}

/**
 * A BOQ cost movement in the window. `totalMinor` is BIGINT minor units
 * (cents) per the codebase money contract. `deltaMinor` is vs the prior
 * revision (positive = cost grew).
 */
export interface WeeklyBoqFact {
  /** Revision version number. */
  version: number;
  totalMinor: bigint;
  /** Null for the first revision (no prior to diff against). */
  deltaMinor: bigint | null;
  note: string | null;
  snapshotAt: string;
}

/** An RFI opened and/or closed (responded/resolved) in the window. */
export interface WeeklyRfiFact {
  ref: string;
  discipline: string;
  priority: string;
  openedThisWeek: boolean;
  closedThisWeek: boolean;
}

/** A daily site report submitted in the window. */
export interface WeeklySiteReportFact {
  reportDate: string;
  totalWorkersPresent: number;
  hasBlocker: boolean;
  status: string;
  summary: string | null;
}

export interface WeeklyReportFacts {
  projectName: string;
  /** Inclusive week-start ISO date (YYYY-MM-DD). */
  weekStart: string;
  /** Inclusive week-ending ISO date (YYYY-MM-DD). */
  weekEnding: string;
  /** Project operating currency for the BOQ figures (e.g. "IDR", "USD"). */
  boqCurrency: string;
  milestones: WeeklyMilestoneFact[];
  boqMovements: WeeklyBoqFact[];
  rfis: WeeklyRfiFact[];
  siteReports: WeeklySiteReportFact[];
}

export interface WeeklyReportHighlight {
  label: string;
  value: string;
}

export interface WeeklyReportSection {
  heading: string;
  /** Pre-rendered, human-readable lines. Empty array when nothing moved. */
  lines: string[];
}

export interface WeeklyReportAssembly {
  /** Markdown body of the deterministic draft. */
  markdown: string;
  /** Highlights surfaced in the agent output card. */
  highlights: WeeklyReportHighlight[];
  /** Structured sections (so the UI can render without re-parsing markdown). */
  sections: WeeklyReportSection[];
  /** Compact, model-friendly digest — the prompt seed for optional LLM polish. */
  promptContext: string;
  /** True when nothing of substance happened in the window. */
  isQuiet: boolean;
}

const abs = (n: bigint): bigint => (n < 0n ? -n : n);

/**
 * Format a minor-unit (cents) money figure for human display. Whole
 * units only — weekly briefs don't need sub-unit precision. No locale
 * dependency so the output is deterministic across environments.
 */
export function formatMinor(minor: bigint, currency: string): string {
  const negative = minor < 0n;
  const whole = abs(minor) / 100n;
  const digits = whole.toString();
  // Group thousands with commas without Intl (deterministic).
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${currency} ${grouped}`;
}

function signedMinor(minor: bigint, currency: string): string {
  const sign = minor > 0n ? "+" : minor < 0n ? "−" : "±";
  return `${sign}${formatMinor(abs(minor), currency)}`;
}

const KIND_LABEL: Record<string, string> = {
  design: "Design",
  permit: "Permit",
  site_prep: "Site prep",
  foundation: "Foundation",
  frame: "Frame",
  mep: "MEP",
  finishes: "Finishes",
  handover: "Handover",
  other: "Other",
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.replace(/_/g, " ");
}

/**
 * Assemble the deterministic weekly report from the week's facts.
 *
 * Sections, in fixed order:
 *   1. Milestones — completed this week + status of in-flight ones.
 *   2. Cost (BOQ) — revision movement + net delta over the window.
 *   3. RFIs — opened vs closed.
 *   4. Site activity — reports filed, workforce, blockers.
 */
export function assembleWeeklyReport(
  facts: WeeklyReportFacts,
): WeeklyReportAssembly {
  const completed = facts.milestones.filter((m) => m.completedThisWeek);
  const progressed = facts.milestones.filter((m) => !m.completedThisWeek);
  const atRisk = facts.milestones.filter(
    (m) => m.status === "at_risk" || m.status === "slipped",
  );

  // --- Milestones section ---
  const milestoneLines: string[] = [];
  for (const m of completed) {
    milestoneLines.push(
      `Completed: ${m.name} (${kindLabel(m.kind)})${
        m.actualDate ? ` on ${m.actualDate}` : ""
      }.`,
    );
  }
  for (const m of progressed) {
    const flag =
      m.status === "at_risk"
        ? " — at risk"
        : m.status === "slipped"
          ? " — slipped"
          : "";
    milestoneLines.push(
      `${m.name} (${kindLabel(m.kind)}) is ${m.status.replace(/_/g, " ")}, target ${m.targetDate}${flag}.`,
    );
  }

  // --- Cost (BOQ) section ---
  const netBoqDelta = facts.boqMovements.reduce(
    (sum, b) => sum + (b.deltaMinor ?? 0n),
    0n,
  );
  const boqLines: string[] = [];
  for (const b of facts.boqMovements) {
    const deltaPart =
      b.deltaMinor === null
        ? "first issue"
        : `${signedMinor(b.deltaMinor, facts.boqCurrency)} vs prior`;
    boqLines.push(
      `Rev ${b.version}: ${formatMinor(b.totalMinor, facts.boqCurrency)} (${deltaPart})${
        b.note ? ` — ${b.note}` : ""
      }.`,
    );
  }
  if (facts.boqMovements.length > 1) {
    boqLines.push(
      `Net BOQ movement this week: ${signedMinor(netBoqDelta, facts.boqCurrency)}.`,
    );
  }

  // --- RFIs section ---
  const opened = facts.rfis.filter((r) => r.openedThisWeek);
  const closed = facts.rfis.filter((r) => r.closedThisWeek);
  const stillOpen = facts.rfis.filter(
    (r) => r.openedThisWeek && !r.closedThisWeek,
  );
  const rfiLines: string[] = [];
  if (opened.length > 0) {
    rfiLines.push(
      `${opened.length} RFI(s) opened: ${opened
        .map((r) => `${r.ref} (${r.discipline}${r.priority === "critical" || r.priority === "high" ? `, ${r.priority}` : ""})`)
        .join(", ")}.`,
    );
  }
  if (closed.length > 0) {
    rfiLines.push(
      `${closed.length} RFI(s) closed: ${closed.map((r) => r.ref).join(", ")}.`,
    );
  }

  // --- Site activity section ---
  const reportCount = facts.siteReports.length;
  const blockerReports = facts.siteReports.filter((r) => r.hasBlocker);
  const avgWorkers =
    reportCount > 0
      ? Math.round(
          facts.siteReports.reduce((s, r) => s + r.totalWorkersPresent, 0) /
            reportCount,
        )
      : 0;
  const siteLines: string[] = [];
  if (reportCount > 0) {
    siteLines.push(
      `${reportCount} daily report(s) filed; average ${avgWorkers} workers on site.`,
    );
  }
  if (blockerReports.length > 0) {
    siteLines.push(
      `${blockerReports.length} report(s) flagged a blocker (${blockerReports
        .map((r) => r.reportDate)
        .join(", ")}).`,
    );
  }

  const sections: WeeklyReportSection[] = [
    { heading: "Milestones", lines: milestoneLines },
    { heading: "Cost (BOQ)", lines: boqLines },
    { heading: "RFIs", lines: rfiLines },
    { heading: "Site activity", lines: siteLines },
  ];

  const isQuiet = sections.every((s) => s.lines.length === 0);

  // --- Highlights (card chips) ---
  const highlights: WeeklyReportHighlight[] = [
    {
      label: "Milestones closed",
      value: completed.length > 0 ? String(completed.length) : "—",
    },
    {
      label: "BOQ delta",
      value:
        facts.boqMovements.length === 0
          ? "—"
          : signedMinor(netBoqDelta, facts.boqCurrency),
    },
    {
      label: "RFIs opened / closed",
      value:
        opened.length === 0 && closed.length === 0
          ? "—"
          : `${opened.length} / ${closed.length}`,
    },
    {
      label: "Site reports",
      value: reportCount > 0 ? String(reportCount) : "—",
    },
  ];

  // --- Markdown body ---
  const mdParts: string[] = [
    `# Weekly update · ${facts.projectName}`,
    "",
    `_Week ${facts.weekStart} → ${facts.weekEnding}._`,
    "",
  ];
  if (isQuiet) {
    mdParts.push(
      "No milestone, cost, RFI, or site-report movement was recorded this week.",
    );
  } else {
    if (atRisk.length > 0) {
      mdParts.push(
        `> ${atRisk.length} milestone(s) need attention: ${atRisk
          .map((m) => m.name)
          .join(", ")}.`,
        "",
      );
    }
    for (const s of sections) {
      mdParts.push(`## ${s.heading}`);
      if (s.lines.length === 0) {
        mdParts.push("_Nothing to report._");
      } else {
        for (const line of s.lines) mdParts.push(`- ${line}`);
      }
      mdParts.push("");
    }
  }
  const markdown = mdParts.join("\n").trimEnd();

  // --- Prompt context (LLM polish seed; compact, no markdown noise) ---
  const promptContext = [
    `Project: ${facts.projectName}`,
    `Window: ${facts.weekStart} to ${facts.weekEnding}`,
    `Milestones completed: ${completed.length}; in-flight progressed: ${progressed.length}; at risk: ${atRisk.length}`,
    `BOQ revisions this week: ${facts.boqMovements.length}; net delta minor: ${netBoqDelta.toString()} ${facts.boqCurrency}`,
    `RFIs opened: ${opened.length}; closed: ${closed.length}; still open from this week: ${stillOpen.length}`,
    `Site reports: ${reportCount}; avg workers: ${avgWorkers}; blockers: ${blockerReports.length}`,
    "",
    "Detail:",
    ...sections.flatMap((s) =>
      s.lines.length > 0 ? [`${s.heading}:`, ...s.lines.map((l) => `  - ${l}`)] : [],
    ),
  ].join("\n");

  return { markdown, highlights, sections, promptContext, isQuiet };
}
