import "server-only";

/**
 * P5.4.4–P5.4.5 AGENT-INFERENCE — RAG-grounded streaming inference with
 * budget enforcement + per-call telemetry.
 *
 * Pipeline:
 *   1. Load `platform_agent_configs` row + decrypt Vault API key.
 *   2. Resolve org overrides from `org_agent_subscriptions`
 *      (custom_system_prompt, custom_budget_usd_minor).
 *   3. Budget gate: SUM(cost_usd_minor) FROM agent_runs this month;
 *      reject if already over OR if worst-case estimate would push us
 *      over.
 *   4. Retrieve top-K chunks (P5.4.3 retrieval module).
 *   5. Load last N messages from thread (if threadId provided).
 *   6. Build prompt: system + context block + history + user.
 *   7. Open agent_runs row (status='in_progress').
 *   8. Stream via Vercel AI SDK `streamText()`. The provider is
 *      selected by `agent.provider` → openai('…') | anthropic('…').
 *   9. On finish: persist agent_messages (user + assistant), close
 *      the agent_run row with tokens + cost + latency.
 *  10. On error: close run with status='error', surface to caller.
 *
 * Returns a `Response` object the API route hands straight back to the
 * client — streaming happens off the SDK's `toTextStreamResponse()`.
 */

import { sql, eq, and, desc } from "drizzle-orm";
import { streamText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireDb } from "@/lib/db/client";
import {
  platformAgentConfigs,
  orgAgentSubscriptions,
  agentThreads,
  agentMessages,
  agentRuns,
} from "@/lib/db/schema/agents";
import { retrieveAgentApiKey } from "./vault";
import { assertAgentEnvReady } from "./env";
import { retrieveRelevantChunks, formatChunksAsContext } from "./retrieval";
import { computeCostUsdMinor, estimateCostUsdMinor } from "./pricing";
import { countTokens } from "./openai-client";

const HISTORY_TURN_LIMIT = 10;
const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.7;

export class AgentInferenceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class BudgetExceededError extends AgentInferenceError {
  constructor(message = "Monthly budget exceeded for this agent.") {
    super("BUDGET_EXCEEDED", message);
  }
}

export interface StreamAgentParams {
  agentId: string;
  organizationId: string;
  userId: string;
  threadId: string | null;
  userMessage: string;
}

export async function streamAgentResponse(
  params: StreamAgentParams,
): Promise<Response> {
  assertAgentEnvReady();

  const { agentId, organizationId, userId, threadId: incomingThreadId } = params;
  const userMessage = params.userMessage.trim();
  if (!userMessage) {
    throw new AgentInferenceError("EMPTY_MESSAGE", "User message is empty.");
  }

  const db = requireDb();

  // -------------------------------------------------------------------
  // 1. Load agent config
  // -------------------------------------------------------------------
  const [agent] = await db
    .select()
    .from(platformAgentConfigs)
    .where(eq(platformAgentConfigs.id, agentId))
    .limit(1);
  if (!agent) {
    throw new AgentInferenceError("AGENT_NOT_FOUND", `Agent ${agentId} not found.`);
  }
  if (!agent.isActive) {
    throw new AgentInferenceError(
      "AGENT_INACTIVE",
      "This agent is currently disabled by the platform.",
    );
  }

  // -------------------------------------------------------------------
  // 2. Resolve org subscription overrides
  // -------------------------------------------------------------------
  const [sub] = await db
    .select()
    .from(orgAgentSubscriptions)
    .where(
      and(
        eq(orgAgentSubscriptions.agentId, agentId),
        eq(orgAgentSubscriptions.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!sub || !sub.isEnabled) {
    throw new AgentInferenceError(
      "NOT_SUBSCRIBED",
      "Your organization is not subscribed to this agent.",
    );
  }

  const systemPrompt = sub.customSystemPrompt ?? agent.systemPrompt;
  const monthlyBudgetUsdMinor =
    sub.customBudgetUsdMinor ?? agent.budgetMonthlyUsdMinor;

  // -------------------------------------------------------------------
  // 3. Budget gate
  // -------------------------------------------------------------------
  const spentRow = await db.execute<{ spent: string }>(sql`
    SELECT COALESCE(SUM(cost_usd_minor), 0)::text AS spent
      FROM agent_runs
     WHERE agent_id = ${agentId}::uuid
       AND organization_id = ${organizationId}::uuid
       AND started_at >= date_trunc('month', now())
  `);
  const spentRows =
    (spentRow as unknown as { rows?: Array<{ spent: string }> }).rows ?? [];
  const spentUsdMinor = Number(spentRows[0]?.spent ?? "0");

  if (spentUsdMinor >= monthlyBudgetUsdMinor) {
    await recordRun(db, {
      agentId,
      organizationId,
      userId,
      threadId: incomingThreadId,
      status: "budget_exceeded",
      tokensIn: 0,
      tokensOut: 0,
      costUsdMinor: 0,
      latencyMs: 0,
      errorMessage: `Monthly budget already exceeded (${spentUsdMinor}¢ / ${monthlyBudgetUsdMinor}¢).`,
    });
    throw new BudgetExceededError();
  }

  // -------------------------------------------------------------------
  // 4. Retrieve relevant chunks
  // -------------------------------------------------------------------
  const chunks = await retrieveRelevantChunks({
    agentId,
    organizationId,
    query: userMessage,
    topK: DEFAULT_TOP_K,
    minSimilarity: DEFAULT_MIN_SIMILARITY,
  });
  const { contextBlock } = formatChunksAsContext(chunks);
  const retrievedChunkIds = chunks.map((c) => c.id);

  // -------------------------------------------------------------------
  // 5. Resolve / create thread + load history
  // -------------------------------------------------------------------
  let threadId = incomingThreadId;
  if (!threadId) {
    const [created] = await db
      .insert(agentThreads)
      .values({
        agentId,
        organizationId,
        userId,
        title: userMessage.slice(0, 80),
      })
      .returning({ id: agentThreads.id });
    threadId = created.id;
  }

  const history = await db
    .select({
      role: agentMessages.role,
      content: agentMessages.content,
      createdAt: agentMessages.createdAt,
    })
    .from(agentMessages)
    .where(eq(agentMessages.threadId, threadId))
    .orderBy(desc(agentMessages.createdAt))
    .limit(HISTORY_TURN_LIMIT);

  const historyMessages = history
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // -------------------------------------------------------------------
  // 6. Build composed system prompt + estimate input tokens
  // -------------------------------------------------------------------
  const composedSystem = contextBlock
    ? `${systemPrompt}\n\n--- Retrieved context ---\n${contextBlock}\n\nUse the context above when it answers the user's question. Cite sources by their "Source N" label. If the context does not cover the question, say so before answering from general knowledge.`
    : systemPrompt;

  const tokensInEstimate =
    countTokens(composedSystem) +
    countTokens(userMessage) +
    historyMessages.reduce((acc, m) => acc + countTokens(m.content), 0);

  const worstCaseCost = estimateCostUsdMinor({
    provider: agent.provider,
    model: agent.model,
    tokensIn: tokensInEstimate,
    maxOutputTokens: agent.maxTokens,
  });

  if (spentUsdMinor + worstCaseCost > monthlyBudgetUsdMinor) {
    await recordRun(db, {
      agentId,
      organizationId,
      userId,
      threadId,
      status: "budget_exceeded",
      tokensIn: 0,
      tokensOut: 0,
      costUsdMinor: 0,
      latencyMs: 0,
      errorMessage: `Worst-case estimate (${worstCaseCost}¢) would exceed monthly budget (${spentUsdMinor + worstCaseCost}¢ / ${monthlyBudgetUsdMinor}¢).`,
    });
    throw new BudgetExceededError(
      "This question would push the agent over its monthly budget. Please try again next month or contact your administrator.",
    );
  }

  // -------------------------------------------------------------------
  // 7. Open run row + persist user message
  // -------------------------------------------------------------------
  const [run] = await db
    .insert(agentRuns)
    .values({
      agentId,
      organizationId,
      userId,
      threadId,
      status: "in_progress",
    })
    .returning({ id: agentRuns.id });

  await db.insert(agentMessages).values({
    threadId,
    role: "user",
    content: userMessage,
    retrievedChunkIds,
  });

  // -------------------------------------------------------------------
  // 8. Resolve API key from Vault + build provider model
  // -------------------------------------------------------------------
  const apiKey = await retrieveAgentApiKey(agentId);
  if (!apiKey) {
    await closeRun(db, run.id, {
      status: "error",
      tokensIn: 0,
      tokensOut: 0,
      costUsdMinor: 0,
      latencyMs: 0,
      errorMessage: "No API key configured. Add one via the platform admin UI.",
    });
    throw new AgentInferenceError(
      "MISSING_API_KEY",
      "This agent has no API key configured.",
    );
  }

  const model = buildLanguageModel(agent.provider, agent.model, apiKey);

  // -------------------------------------------------------------------
  // 9. Stream + telemetry close-out via onFinish
  // -------------------------------------------------------------------
  const startedAt = Date.now();

  const result = streamText({
    model,
    system: composedSystem,
    messages: [
      ...historyMessages,
      { role: "user" as const, content: userMessage },
    ],
    temperature: Number(agent.temperature),
    maxOutputTokens: agent.maxTokens,
    onFinish: async (event) => {
      try {
        const tokensIn = event.usage?.inputTokens ?? tokensInEstimate;
        const tokensOut = event.usage?.outputTokens ?? countTokens(event.text);
        const costUsdMinor = computeCostUsdMinor({
          provider: agent.provider,
          model: agent.model,
          tokensIn,
          tokensOut,
        });

        await db.insert(agentMessages).values({
          threadId: threadId!,
          role: "assistant",
          content: event.text,
          tokensIn,
          tokensOut,
          costUsdMinor,
          retrievedChunkIds,
        });

        await closeRun(db, run.id, {
          status: "success",
          tokensIn,
          tokensOut,
          costUsdMinor,
          latencyMs: Date.now() - startedAt,
          errorMessage: null,
        });
      } catch (err) {
        // Telemetry failure should not corrupt the user's stream;
        // log + swallow.
        console.error("[agent-inference] onFinish persistence failed:", err);
      }
    },
    onError: async ({ error }) => {
      const msg = error instanceof Error ? error.message : String(error);
      await closeRun(db, run.id, {
        status: "error",
        tokensIn: 0,
        tokensOut: 0,
        costUsdMinor: 0,
        latencyMs: Date.now() - startedAt,
        errorMessage: msg.slice(0, 500),
      });
    },
  });

  // Plain SSE-style text stream. The client reads via fetch().body
  // and renders progressively.
  const response = result.toTextStreamResponse();
  response.headers.set("X-Thread-Id", threadId);
  response.headers.set("X-Run-Id", run.id);
  return response;
}

// ---------------------------------------------------------------------------
// Telemetry helpers
// ---------------------------------------------------------------------------

interface RunCloseInput {
  status: "success" | "error" | "budget_exceeded" | "rate_limited";
  tokensIn: number;
  tokensOut: number;
  costUsdMinor: number;
  latencyMs: number;
  errorMessage: string | null;
}

async function recordRun(
  db: ReturnType<typeof requireDb>,
  input: {
    agentId: string;
    organizationId: string;
    userId: string;
    threadId: string | null;
  } & RunCloseInput,
): Promise<void> {
  await db.insert(agentRuns).values({
    agentId: input.agentId,
    organizationId: input.organizationId,
    userId: input.userId,
    threadId: input.threadId,
    status: input.status,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    costUsdMinor: input.costUsdMinor,
    latencyMs: input.latencyMs,
    errorMessage: input.errorMessage,
    completedAt: sql`now()` as never,
  });
}

async function closeRun(
  db: ReturnType<typeof requireDb>,
  runId: string,
  input: RunCloseInput,
): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      status: input.status,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costUsdMinor: input.costUsdMinor,
      latencyMs: input.latencyMs,
      errorMessage: input.errorMessage,
      completedAt: sql`now()`,
    })
    .where(eq(agentRuns.id, runId));
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

function buildLanguageModel(
  provider: string,
  model: string,
  apiKey: string,
): LanguageModel {
  switch (provider.toLowerCase()) {
    case "openai": {
      const client = createOpenAI({ apiKey });
      return client(model);
    }
    case "anthropic": {
      const client = createAnthropic({ apiKey });
      return client(model);
    }
    default:
      throw new AgentInferenceError(
        "UNSUPPORTED_PROVIDER",
        `Provider '${provider}' is not yet wired into the inference module.`,
      );
  }
}
