/**
 * Stage 5.D — AI Daily Construction Digest pure helpers.
 */

export interface DailyDigestInput {
  date: Date;
  projectName: string;
  whatsappMessageCount: number;
  siteReportCount: number;
  photoCount: number;
  photosFlaggedByAi: number;
  transactionCount: number;
  transactionTotalMinor: number;
  deliveryCount: number;
  qaQcOpenedToday: number;
  qaQcResolvedToday: number;
  workforcePresent: number;
  workforceExpected: number;
}

export interface DailyDigestOutput {
  summary: string;
  progressSummary: string;
  materialsSummary: string;
  workforceSummary: string;
  risksSummary: string;
  recommendedActionsForTomorrow: string[];
}

export function buildDailyDigest(input: DailyDigestInput): DailyDigestOutput {
  const dateStr = input.date.toISOString().slice(0, 10);
  const attendancePct =
    input.workforceExpected > 0
      ? (input.workforcePresent / input.workforceExpected) * 100
      : 0;

  const progressSummary = [
    `### Progress (${dateStr})`,
    `- Site reports filed: ${input.siteReportCount}`,
    `- Photos uploaded: ${input.photoCount} (${input.photosFlaggedByAi} flagged by AI vision)`,
    `- WhatsApp messages: ${input.whatsappMessageCount}`,
  ].join("\n");

  const materialsSummary = [
    `### Materials`,
    `- Deliveries today: ${input.deliveryCount}`,
    `- Spend today: ${(input.transactionTotalMinor / 100).toLocaleString()} (${input.transactionCount} txn)`,
  ].join("\n");

  const workforceSummary = [
    `### Workforce`,
    `- Present: ${input.workforcePresent}/${input.workforceExpected} (${attendancePct.toFixed(0)}%)`,
  ].join("\n");

  const risksSummary = [
    `### Risks`,
    `- QA/QC opened today: ${input.qaQcOpenedToday}`,
    `- QA/QC resolved today: ${input.qaQcResolvedToday}`,
    input.photosFlaggedByAi > 0
      ? `- ⚠ ${input.photosFlaggedByAi} photo(s) flagged by AI vision — review`
      : "- No AI-flagged issues",
  ].join("\n");

  const recommendedActionsForTomorrow: string[] = [];
  if (input.photosFlaggedByAi > 0) {
    recommendedActionsForTomorrow.push(
      `Review ${input.photosFlaggedByAi} AI-flagged photos before tomorrow's site walk.`,
    );
  }
  if (attendancePct < 80 && input.workforceExpected > 0) {
    recommendedActionsForTomorrow.push(
      `Confirm tomorrow's headcount — today's attendance was ${attendancePct.toFixed(0)}%.`,
    );
  }
  if (input.qaQcOpenedToday > input.qaQcResolvedToday) {
    recommendedActionsForTomorrow.push(
      "Allocate inspector time to clear backlog — more QA/QC opened than resolved today.",
    );
  }
  if (recommendedActionsForTomorrow.length === 0) {
    recommendedActionsForTomorrow.push("Carry forward planned schedule — no exceptions.");
  }

  const summary = `${input.projectName} ${dateStr}: ${input.photoCount} photos, ${input.deliveryCount} deliveries, ${input.workforcePresent}/${input.workforceExpected} present. ${input.qaQcOpenedToday > 0 ? `⚠ ${input.qaQcOpenedToday} QA/QC opened.` : "Clean."}`;

  return {
    summary,
    progressSummary,
    materialsSummary,
    workforceSummary,
    risksSummary,
    recommendedActionsForTomorrow,
  };
}
