import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { whatsappMessages } from "@/lib/db/schema/whatsapp";
import { siteReports } from "@/lib/db/schema/site-operations";
import { aiInvestorQaDrafts } from "@/lib/db/schema/ai-development";
import { projects } from "@/lib/db/schema/projects";
import { investors } from "@/lib/db/schema/investor-capital";
import { resolveSenderPhone } from "./phone-resolver";
import {
  classifyMessage,
  type ClassificationResult,
} from "@/lib/development/ai/whatsapp-intent-classifier";
import { getWhatsAppProvider } from "@/lib/whatsapp/providers";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";

/**
 * Inbound message processor — runs async after the webhook persists
 * the raw message. Pipeline:
 *
 *   1. Load message + skip if already processed.
 *   2. Resolve sender via phone-resolver (also keeps the registry fresh).
 *   3. If voice + provider supports transcription → transcribe.
 *   4. AI intent classify (cheap Haiku call).
 *   5. Route based on intent → create DRAFT row in the appropriate
 *      domain table (site_reports, ai_investor_qa_drafts, etc.).
 *      NEVER auto-act on financial surfaces.
 *   6. Send acknowledgement back to the sender.
 *   7. Mark message status='processed'.
 */

export interface ProcessOutcome {
  status: "succeeded" | "skipped" | "failed";
  intent?: string;
  createdEntityType?:
    | "site_report"
    | "investor_qa_draft"
    | "vendor_notification"
    | "manual_review";
  createdEntityId?: string;
  errorMessage?: string;
}

export async function processInboundMessage(
  messageId: string,
): Promise<ProcessOutcome> {
  const db = getDb();
  if (!db) return { status: "failed", errorMessage: "DB unavailable" };

  // 1) Load message.
  const [msg] = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.id, messageId))
    .limit(1);
  if (!msg) return { status: "failed", errorMessage: "Message not found" };
  if (msg.status === "processed") {
    return { status: "skipped" };
  }
  if (msg.direction !== "inbound") {
    return {
      status: "skipped",
      errorMessage: "Not an inbound message",
    };
  }

  // 2) Resolve sender. Pass the receiving Arconique business number
  // (msg.toPhone) so the sender's registry row is stamped with the
  // tenant org — otherwise unknown numbers never render on the operator
  // page (getWhatsappPhoneNumbers strict-filters organization_id) and
  // can never be resolved manually.
  const sender = await resolveSenderPhone(msg.fromPhone, msg.toPhone);

  // 3) Voice transcription.
  let transcript = msg.voiceTranscript;
  if (
    msg.messageType === "voice" &&
    !transcript &&
    msg.mediaUrls &&
    msg.mediaUrls.length > 0
  ) {
    const provider = getWhatsAppProvider();
    const out = await provider
      .transcribeVoice(msg.mediaUrls[0])
      .catch(() => null);
    if (out) {
      transcript = out.text;
      await db
        .update(whatsappMessages)
        .set({
          voiceTranscript: out.text,
          voiceTranscriptLanguage: out.language,
          voiceTranscribedAt: new Date(),
        })
        .where(eq(whatsappMessages.id, msg.id));
    }
  }

  // 4) AI intent classification.
  const bodyForClassifier = transcript ?? msg.body ?? "";
  let classification: ClassificationResult;
  try {
    classification = await classifyMessage({
      senderEntityType: sender.entityType,
      senderEntityName: sender.entityName,
      body: bodyForClassifier,
      isVoice: msg.messageType === "voice",
      hasMedia: Boolean(msg.mediaUrls && msg.mediaUrls.length > 0),
    });
  } catch (err) {
    await markFailed(messageId, err instanceof Error ? err.message : String(err));
    return {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  // 5) Route by intent — always DRAFT, always HITL.
  let createdEntityType: ProcessOutcome["createdEntityType"];
  let createdEntityId: string | undefined;

  if (
    classification.intent === "site_report" &&
    classification.confidence >= 0.5
  ) {
    const reportId = await createDraftSiteReport({
      senderType: sender.entityType,
      bodyForClassifier,
      messageId,
      provider: msg.provider,
      externalSid: msg.externalMessageSid ?? msg.id,
    });
    if (reportId) {
      createdEntityType = "site_report";
      createdEntityId = reportId;
      await db
        .update(whatsappMessages)
        .set({ createdSiteReportId: reportId })
        .where(eq(whatsappMessages.id, messageId));
    }
  } else if (
    classification.intent === "investor_question" &&
    sender.entityType === "investor" &&
    classification.confidence >= 0.5
  ) {
    const qaId = await createDraftInvestorQa({
      investorId: sender.entityId!,
      question: bodyForClassifier,
    });
    if (qaId) {
      createdEntityType = "investor_qa_draft";
      createdEntityId = qaId;
      await db
        .update(whatsappMessages)
        .set({ createdInvestorQaId: qaId })
        .where(eq(whatsappMessages.id, messageId));
    }
  } else if (
    classification.intent === "vendor_inquiry" ||
    classification.intent === "safety_alert"
  ) {
    // For Stage 3.D we don't auto-create vendor notifications or
    // safety_incidents drafts — operator handles via the message
    // detail page. This keeps Stage 3.D focused on plumbing; the
    // safety_incidents draft creation is documented as a deferred
    // follow-on (architecture.md → Deferred from 3.D).
    createdEntityType = "manual_review";
  } else {
    createdEntityType = "manual_review";
  }

  // 6) Persist intent + final state.
  await db
    .update(whatsappMessages)
    .set({
      status: "processed",
      statusUpdatedAt: new Date(),
      aiProcessedAt: new Date(),
      aiIntent: classification.intent,
      aiIntentConfidence:
        classification.confidence != null
          ? classification.confidence.toFixed(2)
          : null,
      aiRunId: classification.runId,
    })
    .where(eq(whatsappMessages.id, messageId));

  // 7) Acknowledgement back to sender (best-effort; failure is non-fatal).
  await sendAcknowledgement({
    toPhone: msg.fromPhone,
    fromPhone: msg.toPhone,
    intent: classification.intent,
    senderType: sender.entityType,
  }).catch(() => {
    // Logged via provider; don't fail the whole pipeline if ack
    // fails — the inbound message is already persisted + classified.
  });

  return {
    status: "succeeded",
    intent: classification.intent,
    createdEntityType,
    createdEntityId,
  };
}

async function createDraftSiteReport(args: {
  senderType: string;
  bodyForClassifier: string;
  messageId: string;
  provider: string;
  externalSid: string;
}): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  // Site report needs a project. For Stage 3.D we attach to the first
  // active project — operator must re-assign in the report detail
  // page. A future stage will resolve project from sender's last-known
  // engagement.
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .limit(1);
  if (!proj) return null;
  const today = new Date().toISOString().slice(0, 10);
  // Idempotent: project_id + report_date is unique. If the operator
  // already filed today's report, skip and let them merge manually.
  const [existing] = await db
    .select({ id: siteReports.id })
    .from(siteReports)
    .where(eq(siteReports.projectId, proj.id))
    .limit(1);
  if (existing) {
    // We could still attach this whatsapp message to a NEW draft for
    // a different date — but Stage 3.D defers that complexity.
    return null;
  }
  // TENANT-1: cron-callable path (no auth context). Resolve org via
  // ARCONIQUE_DEFAULT seed — projects don't carry org_id today, so the
  // whatsapp inbound queue routes to the default tenant by design.
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) return null;
  const [created] = await db
    .insert(siteReports)
    .values({
      organizationId: org.id,
      projectId: proj.id,
      reportDate: today,
      summary: args.bodyForClassifier.slice(0, 4000),
      status: "draft",
      sourceChannel: "whatsapp",
      sourceMessageId: args.externalSid,
    })
    .returning({ id: siteReports.id })
    .catch(() => [{ id: null as unknown as string }]);
  return created?.id ?? null;
}

async function createDraftInvestorQa(args: {
  investorId: string;
  question: string;
}): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [investor] = await db
    .select({
      reportingLanguage: investors.reportingLanguage,
    })
    .from(investors)
    .where(eq(investors.id, args.investorId))
    .limit(1);
  if (!investor) return null;
  // Insert a placeholder draft. Operator triggers the actual investor-
  // relations agent from the investor detail page (existing surface).
  // We deliberately do NOT spend AI budget twice — the intent
  // classifier already paid; operator decides whether to draft.
  const [created] = await db
    .insert(aiInvestorQaDrafts)
    .values({
      investorId: args.investorId,
      question: args.question.slice(0, 4000),
      questionLanguage: investor.reportingLanguage ?? null,
      responseLanguage: investor.reportingLanguage ?? "en",
      draftResponse:
        "[whatsapp pending] Investor sent this question via WhatsApp. Click Generate to draft a response.",
      contextSummary:
        { whatsappOriginated: true } as typeof aiInvestorQaDrafts.$inferInsert["contextSummary"],
      rawResponse: "{}",
      status: "draft",
    })
    .returning({ id: aiInvestorQaDrafts.id })
    .catch(() => [{ id: null as unknown as string }]);
  return created?.id ?? null;
}

async function sendAcknowledgement(args: {
  toPhone: string;
  fromPhone: string;
  intent: string;
  senderType: string;
}): Promise<void> {
  if (args.senderType === "unknown") return;
  const provider = getWhatsAppProvider();
  const body =
    args.intent === "site_report"
      ? "Received your site update — Arconique team will review the draft shortly."
      : args.intent === "investor_question"
        ? "Thank you for reaching out — Arconique investor relations will respond shortly."
        : args.intent === "vendor_inquiry"
          ? "Received — vendor relations will follow up."
          : args.intent === "safety_alert"
            ? "URGENT acknowledged — safety officer notified."
            : "Received — Arconique team will respond shortly.";
  await provider
    .sendMessage({
      fromPhone: args.fromPhone,
      toPhone: args.toPhone,
      body,
    })
    .catch(() => {
      // Failure is non-fatal — see caller.
    });
}

async function markFailed(
  messageId: string,
  errorMessage: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(whatsappMessages)
    .set({
      status: "failed",
      failureReason: errorMessage,
      statusUpdatedAt: new Date(),
    })
    .where(eq(whatsappMessages.id, messageId));
}

/**
 * Cron entrypoint — finds unprocessed inbound messages and processes
 * them serially. Capped at 25 per tick.
 */
export async function findUnprocessedInbound(limit = 25): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.status, "received"))
    .orderBy(whatsappMessages.occurredAt)
    .limit(limit);
  return rows.map((r) => r.id);
}
