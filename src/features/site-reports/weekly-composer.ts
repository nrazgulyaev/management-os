/**
 * Phase 2.4 dev-01 — Weekly report composer.
 *
 * Picks 3 hero frames + drafts a summary for the construction
 * weekly report. Composition is deterministic so unit tests can
 * snapshot it; the cron just invokes the function and writes the
 * draft into `weekly_reports`.
 *
 * Selection priority:
 *   1. P1 incidents with photos (always shown if any)
 *   2. Milestones completed this week
 *   3. Progress frames with the highest "spotlight score"
 *
 * Critical UX rule 5: frames without GPS coords are excluded.
 */

export interface ComposerFrame {
  id: string;
  kind: "milestone" | "incident" | "qa" | "progress";
  severity?: "p1" | "p2" | "p3" | "info";
  caption: string;
  takenAt: string;
  gps?: { lat: number; lng: number } | null;
  /** Engagement / spotlight signal, 0..1. */
  spotlightScore?: number;
}

export interface WeeklyComposerInput {
  projectId: string;
  isoWeek: string;
  frames: ComposerFrame[];
  /** Pre-computed KPIs from the project; passed through to the draft payload. */
  kpis: { label: string; value: string; tone?: "ok" | "warn" | "danger" }[];
}

export interface WeeklyComposerDraft {
  isoWeek: string;
  projectId: string;
  heroFrameIds: string[];
  summaryDraft: string;
  excluded: { id: string; reason: string }[];
  kpis: WeeklyComposerInput["kpis"];
}

export function composeWeeklyReport(input: WeeklyComposerInput): WeeklyComposerDraft {
  const eligible: ComposerFrame[] = [];
  const excluded: { id: string; reason: string }[] = [];
  for (const f of input.frames) {
    if (!f.gps) {
      excluded.push({ id: f.id, reason: "no-gps" });
      continue;
    }
    eligible.push(f);
  }

  const p1 = eligible.filter((f) => f.severity === "p1" && f.kind === "incident");
  const milestones = eligible.filter((f) => f.kind === "milestone");
  const progress = [...eligible.filter((f) => f.kind === "progress")].sort(
    (a, b) => (b.spotlightScore ?? 0) - (a.spotlightScore ?? 0),
  );

  const picked: string[] = [];
  for (const f of p1) {
    if (picked.length >= 3) break;
    picked.push(f.id);
  }
  for (const f of milestones) {
    if (picked.length >= 3) break;
    if (!picked.includes(f.id)) picked.push(f.id);
  }
  for (const f of progress) {
    if (picked.length >= 3) break;
    if (!picked.includes(f.id)) picked.push(f.id);
  }

  const lines: string[] = [];
  lines.push(`Week ${input.isoWeek} — ${eligible.length} eligible frames captured.`);
  if (p1.length) lines.push(`${p1.length} P1 incident(s) require follow-up.`);
  if (milestones.length) lines.push(`${milestones.length} milestone(s) completed.`);
  if (excluded.length) lines.push(`${excluded.length} frame(s) excluded for missing GPS.`);

  return {
    isoWeek: input.isoWeek,
    projectId: input.projectId,
    heroFrameIds: picked,
    summaryDraft: lines.join(" "),
    excluded,
    kpis: input.kpis,
  };
}
