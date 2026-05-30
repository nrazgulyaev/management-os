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
import { streamText, generateText, stepCountIs, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireDb, rowsOf } from "@/lib/db/client";
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
import { getToolsForAgent, type AgentExecutionContext } from "./tools";

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
  /**
   * P5.4.POLISH.1 — super_admin "test mode" bypass. When true:
   *   · subscription gate is skipped (super_admin can chat with ANY
   *     agent regardless of org subscription state)
   *   · budget gate is skipped (test traffic doesn't burn live budget)
   *   · run telemetry is still recorded (visible in the agent's runs
   *     tab so super_admin can see what they cost)
   * The route handler is responsible for ensuring this flag is only
   * ever true for a verified super_admin context.
   */
  testMode?: boolean;
}

export async function streamAgentResponse(
  params: StreamAgentParams,
): Promise<Response> {
  assertAgentEnvReady();

  const { agentId, organizationId, userId, threadId: incomingThreadId } = params;
  const testMode = params.testMode === true;
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

  if (!testMode && (!sub || !sub.isEnabled)) {
    throw new AgentInferenceError(
      "NOT_SUBSCRIBED",
      "Your organization is not subscribed to this agent.",
    );
  }

  const systemPrompt = sub?.customSystemPrompt ?? agent.systemPrompt;
  const monthlyBudgetUsdMinor =
    sub?.customBudgetUsdMinor ?? agent.budgetMonthlyUsdMinor;

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
    rowsOf<{ spent: string }>(spentRow);
  const spentUsdMinor = Number(spentRows[0]?.spent ?? "0");

  if (!testMode && spentUsdMinor >= monthlyBudgetUsdMinor) {
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

  if (!testMode && spentUsdMinor + worstCaseCost > monthlyBudgetUsdMinor) {
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

// ---------------------------------------------------------------------------
// DAILY-DIGEST-SPRINT-1 P2.2 — non-streaming tool-loop runner
// ---------------------------------------------------------------------------
//
// `runAgentWithTools` is the cron-side / digest-side counterpart to
// `streamAgentResponse`. Key differences:
//   · Non-streaming — caller gets the final text once the loop settles.
//     The cron handler doesn't have a client to stream to.
//   · Tool-calling enabled via getToolsForAgent(agent_code, ctx). The
//     AI SDK's generateText handles tool_use → tool_result automatically
//     when `stopWhen: stepCountIs(N)` is set.
//   · No thread persistence — digests are stateless one-shots, not
//     conversational. Skips agentThreads + agentMessages writes.
//   · No RAG retrieval — context comes from tool calls, not chunks.
//   · Still enforces the budget gate + writes an agent_runs row with
//     run_type='scheduled', scheduled_for=<date>, plus a metadata
//     blob recording every tool_call name+input+output_summary.

const MAX_TOOL_STEPS = 10;

export interface RunAgentWithToolsParams {
  agentId: string;
  organizationId: string;
  userId: string;
  /** ISO YYYY-MM-DD — the date the digest covers. */
  scheduledFor: string;
  /** IANA timezone of the recipient (forwarded into AgentExecutionContext). */
  timezone?: string;
  /**
   * The user-facing message the agent sees. For Daily Digest this is
   * a brief "Generate the digest for <date>" prompt — the system
   * prompt does the heavy structural work.
   */
  userMessage: string;
}

export interface RunAgentWithToolsResult {
  runId: string;
  text: string;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  costUsdMinor: number;
  latencyMs: number;
}

interface ToolCallTrace {
  name: string;
  /** Stringified input (capped at 500 chars). */
  input: string;
  /** Stringified output preview (capped at 500 chars). */
  output_preview: string;
}

export async function runAgentWithTools(
  params: RunAgentWithToolsParams,
): Promise<RunAgentWithToolsResult> {
  assertAgentEnvReady();
  const db = requireDb();

  // ---- Load agent + subscription overrides ------------------------------
  const [agent] = await db
    .select()
    .from(platformAgentConfigs)
    .where(eq(platformAgentConfigs.id, params.agentId))
    .limit(1);
  if (!agent) {
    throw new AgentInferenceError("AGENT_NOT_FOUND", `Agent ${params.agentId} not found.`);
  }
  if (!agent.isActive) {
    throw new AgentInferenceError("AGENT_INACTIVE", "Agent disabled.");
  }

  const [sub] = await db
    .select()
    .from(orgAgentSubscriptions)
    .where(
      and(
        eq(orgAgentSubscriptions.agentId, params.agentId),
        eq(orgAgentSubscriptions.organizationId, params.organizationId),
      ),
    )
    .limit(1);

  // Subscriptions are an explicit gate even for cron runs. A cron
  // shouldn't generate a digest for an org that has unsubscribed.
  if (!sub || !sub.isEnabled) {
    throw new AgentInferenceError(
      "NOT_SUBSCRIBED",
      "Organization is not subscribed to this agent.",
    );
  }

  const systemPrompt = sub.customSystemPrompt ?? agent.systemPrompt;
  const monthlyBudgetUsdMinor =
    sub.customBudgetUsdMinor ?? agent.budgetMonthlyUsdMinor;

  // ---- Budget gate ------------------------------------------------------
  const spentRows = await db.execute<{ spent: string }>(sql`
    SELECT COALESCE(SUM(cost_usd_minor), 0)::text AS spent
      FROM agent_runs
     WHERE agent_id = ${params.agentId}::uuid
       AND organization_id = ${params.organizationId}::uuid
       AND started_at >= date_trunc('month', now())
  `);
  const spentUsdMinor = Number(
    rowsOf<{ spent: string }>(spentRows)[0]
      ?.spent ?? "0",
  );
  if (spentUsdMinor >= monthlyBudgetUsdMinor) {
    const runRow = await openRun(db, params, "budget_exceeded", "monthly budget already exceeded");
    throw new BudgetExceededError(
      `Run ${runRow.id} not started — monthly budget already exceeded for this agent.`,
    );
  }

  // ---- Tool map for this run -------------------------------------------
  const ctx: AgentExecutionContext = {
    orgId: params.organizationId,
    userId: params.userId,
    date: params.scheduledFor,
    timezone: params.timezone,
  };
  const tools = getToolsForAgent(agent.agentCode, ctx);

  // ---- API key + provider ----------------------------------------------
  const apiKey = await retrieveAgentApiKey(params.agentId);
  if (!apiKey) {
    const runRow = await openRun(db, params, "error", "no API key configured");
    throw new AgentInferenceError(
      "MISSING_API_KEY",
      `Run ${runRow.id} not started — agent has no API key.`,
    );
  }
  const model = buildLanguageModel(agent.provider, agent.model, apiKey);

  // ---- Open in-progress run row ----------------------------------------
  const [run] = await db
    .insert(agentRuns)
    .values({
      agentId: params.agentId,
      organizationId: params.organizationId,
      userId: params.userId,
      status: "in_progress",
      // P1.1 columns
      runType: "scheduled",
      scheduledFor: params.scheduledFor,
    } as never)
    .returning({ id: agentRuns.id });

  const startedAt = Date.now();
  const toolCallTraces: ToolCallTrace[] = [];

  // ---- Run + handle tool-loop -----------------------------------------
  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: params.userMessage,
      tools,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      temperature: Number(agent.temperature),
      maxOutputTokens: agent.maxTokens,
      onStepFinish: (step) => {
        // Capture each tool call's input + a preview of the result so
        // metadata gives operators visibility into what the agent
        // actually fetched. AI SDK provides `step.toolCalls` and
        // `step.toolResults` for the step that just settled.
        for (const tc of step.toolCalls ?? []) {
          const inputStr = safeJson(tc.input).slice(0, 500);
          const match = (step.toolResults ?? []).find(
            (tr) => tr.toolCallId === tc.toolCallId,
          );
          const outputStr = safeJson(match?.output).slice(0, 500);
          toolCallTraces.push({
            name: tc.toolName,
            input: inputStr,
            output_preview: outputStr,
          });
        }
      },
    });

    const tokensIn = result.usage?.inputTokens ?? countTokens(systemPrompt + params.userMessage);
    const tokensOut =
      result.usage?.outputTokens ?? countTokens(result.text ?? "");
    const costUsdMinor = computeCostUsdMinor({
      provider: agent.provider,
      model: agent.model,
      tokensIn,
      tokensOut,
    });
    const latencyMs = Date.now() - startedAt;

    await db
      .update(agentRuns)
      .set({
        status: "success",
        tokensIn,
        tokensOut,
        costUsdMinor,
        latencyMs,
        completedAt: sql`now()`,
        metadata: { tool_calls: toolCallTraces, steps: result.steps?.length ?? 1 } as never,
      })
      .where(eq(agentRuns.id, run.id));

    return {
      runId: run.id,
      text: result.text ?? "",
      toolCalls: toolCallTraces.length,
      tokensIn,
      tokensOut,
      costUsdMinor,
      latencyMs,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(agentRuns)
      .set({
        status: "error",
        errorMessage: msg.slice(0, 500),
        latencyMs: Date.now() - startedAt,
        completedAt: sql`now()`,
        metadata: { tool_calls: toolCallTraces } as never,
      })
      .where(eq(agentRuns.id, run.id));
    throw e;
  }
}

async function openRun(
  db: ReturnType<typeof requireDb>,
  params: RunAgentWithToolsParams,
  status: "error" | "budget_exceeded",
  reason: string,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(agentRuns)
    .values({
      agentId: params.agentId,
      organizationId: params.organizationId,
      userId: params.userId,
      status,
      errorMessage: reason,
      runType: "scheduled",
      scheduledFor: params.scheduledFor,
      completedAt: sql`now()` as never,
    } as never)
    .returning({ id: agentRuns.id });
  return row;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Imports unused so far in the file body but required by the new code above.
void desc;
