"use server";

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";

import { hashStayToken, hashIpForLog } from "@/features/guest-stays/token";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { recordSecurityEvent } from "@/features/guest-stays/security";
import { queueNotification } from "@/features/notifications/services";

import { buildGuestConciergeContext, contextKeys } from "./context";
import { GUEST_AI_SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import {
  assertNoSecretLeak,
  buildCitationsFromContext,
  sanitizeGuestAIResponse,
  shouldRefuseGuestAI,
} from "./safety";
import { callGuestConcierge } from "./provider";
import { buildFallbackAnswer } from "./fallback";
import {
  appendMessage,
  ensureActiveSession,
  listMessagesForSession,
  recordRun,
  userMessageCount,
} from "./services";
import { rateLimitConciergeMessage } from "./rate-limit";
import { isAiConfigured, isAiDryRun } from "@/lib/env";
import { parseAssistantResponse } from "./response-parser";

const submitSchema = z.object({
  token: z.string().min(16),
  message: z.string().trim().min(1).max(800),
});

const MAX_USER_MESSAGES_PER_SESSION = 12;

export type ConciergeActionState =
  | null
  | { ok: true; reply: string; safetyStatus: "ok" | "refused" | "redacted" }
  | { ok: false; error: string };

export async function submitConciergeMessageAction(
  _prev: ConciergeActionState | null,
  formData: FormData,
): Promise<ConciergeActionState> {
  const parsed = submitSchema.safeParse({
    token: formData.get("token"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please type a question.",
    };
  }
  const { token, message } = parsed.data;
  const tokenPrefix = token.slice(0, 8);

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  // Reuse the v9G stay-token rate limiter so concierge traffic counts
  // against the same per-IP envelope as page views.
  const generalRl = await rateLimitStayTokenAccess({
    tokenPrefix,
    ip,
  });
  if (!generalRl.allowed) {
    return {
      ok: false,
      error: "Too many requests. Please wait a few minutes and try again.",
    };
  }

  // Token must resolve and be verified.
  const resolved = await getStayByToken(token);
  if (!resolved.ok) {
    return { ok: false, error: "We couldn't verify your stay link." };
  }
  const stay = resolved.stay;
  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) {
    return {
      ok: false,
      error: "Please verify your stay first to use the concierge.",
    };
  }

  // Concierge-specific rate limiter (5/min, 20/hour per token).
  const conciergeRl = await rateLimitConciergeMessage({
    guestStayTokenId: stay.tokenId,
  });
  if (!conciergeRl.allowed) {
    return {
      ok: false,
      error:
        conciergeRl.kind === "minute"
          ? "Whoa — too many messages in a row. Wait a minute and try again."
          : "You've used the concierge a lot today. Try again in an hour.",
    };
  }

  // Session housekeeping.
  const sessionId = await ensureActiveSession({
    guestStayTokenId: stay.tokenId,
    bookingId: stay.bookingId,
  });
  if (!sessionId) {
    return { ok: false, error: "Concierge is unavailable right now." };
  }
  const userMsgs = await userMessageCount(sessionId);
  if (userMsgs >= MAX_USER_MESSAGES_PER_SESSION) {
    return {
      ok: false,
      error:
        "You've reached this conversation's limit. Use the Concierge & services form for anything else and we'll follow up directly.",
    };
  }

  const startedAt = new Date();

  // Pre-LLM safety check.
  const decision = shouldRefuseGuestAI(message);
  if (decision.refuse && decision.intent) {
    await appendMessage({
      sessionId,
      role: "user",
      content: message,
      safetyStatus: "ok",
    });
    await appendMessage({
      sessionId,
      role: "assistant",
      content: decision.message,
      safetyStatus: "refused",
      toolContextJson: { refusalIntent: decision.intent },
      model: "safety-guard",
    });
    await recordRun({
      sessionId,
      status: "refused",
      model: "safety-guard",
      promptHash: hashPrompt(message),
      safetyFlags: { intent: decision.intent, reason: decision.reason },
      allowedContextKeys: null,
      errorMessage: null,
      startedAt,
      finishedAt: new Date(),
    });
    await recordSecurityEvent({
      eventType: "suspicious_access",
      severity:
        decision.intent === "unsafe_activity" ||
        decision.intent === "owner_finance" ||
        decision.intent === "camera_access"
          ? "high"
          : "medium",
      guestStayTokenId: stay.tokenId,
      bookingId: stay.bookingId,
      ipHash: hashIpForLog(ip) ?? null,
      userAgent: ua,
      metadata: { intent: decision.intent, source: "guest_ai" },
    });
    if (
      decision.intent === "unsafe_activity" ||
      decision.intent === "ai_call_staff"
    ) {
      try {
        await queueNotification({
          recipientType: "role",
          organizationId: stay.organizationId,
          channel: "in_app",
          templateKey: "guest_ai.safety_attention",
          title: "Concierge AI flagged a safety-related question",
          body: `Token ${stay.bookingCode} · intent: ${decision.intent}`,
          payload: {
            recipientRole: "concierge",
            sessionId,
            intent: decision.intent,
          },
          priority: "high",
          dedupeKey: `guest_ai_safety:${sessionId}:${decision.intent}`,
        });
      } catch {
        // best-effort
      }
    }
    return {
      ok: true,
      reply: decision.message,
      safetyStatus: "refused",
    };
  }

  // Build context + prompt.
  const ctxBuild = await buildGuestConciergeContext(token);
  if (!ctxBuild.ok || !ctxBuild.context) {
    return { ok: false, error: "We couldn't load your villa info right now." };
  }
  const context = ctxBuild.context;
  const usedKeys = contextKeys(context);

  const recent = (await listMessagesForSession(sessionId, 20))
    .filter((m) => m.role !== "system")
    .slice(-6)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  await appendMessage({
    sessionId,
    role: "user",
    content: message,
    safetyStatus: "ok",
  });

  // Try the live model first; if it's not configured / errors, deterministic
  // fallback. Either way: sanitize + leak-check before persisting.
  let modelLabel: string;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let rawText: string | null = null;
  let errorMessage: string | null = null;

  if (isAiConfigured() && !isAiDryRun()) {
    const userPrompt = buildUserPrompt(context, message, recent);
    const llm = await callGuestConcierge(GUEST_AI_SYSTEM_PROMPT, userPrompt);
    if (llm.ok && llm.text) {
      rawText = llm.text;
      inputTokens = llm.inputTokens ?? null;
      outputTokens = llm.outputTokens ?? null;
      modelLabel = llm.model ?? "anthropic";
    } else {
      errorMessage = llm.errorMessage ?? "anthropic call failed";
      const fb = buildFallbackAnswer(message, context);
      rawText = fb.text;
      modelLabel = "deterministic-fallback";
    }
  } else {
    const fb = buildFallbackAnswer(message, context);
    rawText = fb.text;
    modelLabel = "deterministic-fallback";
  }

  const parsed2 = parseAssistantResponse(rawText ?? "");
  const sanitized = sanitizeGuestAIResponse(parsed2.text);

  // Defence-in-depth — though the context never contained these, we
  // still scan the output for forbidden literals.
  try {
    assertNoSecretLeak(sanitized.text, [
      tokenHash,
      tokenPrefix,
      // Any future known-secret literal can be added here.
    ]);
  } catch {
    // Swallow the leak: replace with a generic deferral.
    sanitized.text =
      "I had trouble answering that safely. Open the relevant page from your stay menu (Wi-Fi, Check-in, Concierge & services) or use the Emergency page if it's urgent.";
    sanitized.redacted = true;
  }

  const finishedAt = new Date();
  const latencyMs = finishedAt.getTime() - startedAt.getTime();

  const safetyStatus: "ok" | "redacted" | "error" = errorMessage
    ? "error"
    : sanitized.redacted
      ? "redacted"
      : "ok";

  const citations = buildCitationsFromContext({
    sectionsCount: context.sections.length,
    neighborhoodCount: context.neighborhood.length,
    servicesCount: context.services.length,
    emergencyCount: context.emergency.length,
    serviceOrdersCount: context.serviceOrders.length,
  });

  await appendMessage({
    sessionId,
    role: "assistant",
    content: sanitized.text,
    safetyStatus,
    citationsJson: citations,
    toolContextJson: { contextKeys: usedKeys },
    model: modelLabel,
    inputTokens,
    outputTokens,
    latencyMs,
  });

  await recordRun({
    sessionId,
    status: errorMessage ? "failed" : "succeeded",
    model: modelLabel,
    promptHash: hashPrompt(message),
    safetyFlags:
      sanitized.redacted || errorMessage
        ? { redacted: sanitized.redacted, errored: Boolean(errorMessage) }
        : null,
    allowedContextKeys: usedKeys,
    errorMessage: errorMessage,
    startedAt,
    finishedAt,
  });

  return {
    ok: true,
    reply: sanitized.text,
    safetyStatus: safetyStatus === "error" ? "redacted" : safetyStatus,
  };
}

function hashPrompt(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}
