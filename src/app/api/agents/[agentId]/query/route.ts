/**
 * P5.4.6 AGENT-RAG-API — POST /api/agents/[agentId]/query
 *
 * Streaming endpoint subscribed-org users hit to ask an agent a
 * question. Returns a text/plain stream produced by `streamText()`
 * inside `streamAgentResponse`. The body is whatever the LLM produces,
 * chunked progressively; X-Thread-Id and X-Run-Id headers carry the
 * thread + run identifiers for the UI to persist + link to audit.
 *
 * Auth chain:
 *   - getCurrentAppUser() — required (401 if anon)
 *   - inference module re-checks the (agent, org) subscription
 *     (403 if not subscribed / disabled)
 *   - inference module enforces the monthly budget (429 if exceeded)
 *
 * Node runtime explicitly — the OpenAI / Anthropic SDKs + our
 * postgres-js DB client both need real Node APIs, and Vercel's edge
 * runtime has request-time limits that would chop long streams.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getCurrentUserContext } from "@/features/auth/permissions";
import {
  streamAgentResponse,
  AgentInferenceError,
  BudgetExceededError,
} from "@/lib/agents/inference";
import { AgentEnvNotReadyError } from "@/lib/agents/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueryBody {
  message?: unknown;
  threadId?: unknown;
  testMode?: unknown;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agentId: string }> },
): Promise<Response> {
  const { agentId } = await context.params;

  const me = await getCurrentAppUser();
  if (!me) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: QueryBody;
  try {
    body = (await request.json()) as QueryBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const message = typeof body.message === "string" ? body.message : "";
  const threadId = typeof body.threadId === "string" ? body.threadId : null;

  // Test mode is requested by the caller but only honored when the
  // session is a verified super_admin. Anyone else asking for
  // testMode=true gets it silently flipped back to false.
  let testMode = false;
  if (body.testMode === true) {
    const ctx = await getCurrentUserContext();
    testMode = ctx.isSuperAdmin === true;
  }

  if (!message.trim()) {
    return NextResponse.json(
      { error: "`message` is required." },
      { status: 400 },
    );
  }
  if (message.length > 8000) {
    return NextResponse.json(
      { error: "`message` exceeds 8000 characters." },
      { status: 400 },
    );
  }

  try {
    return await streamAgentResponse({
      agentId,
      organizationId: me.organizationId,
      userId: me.id,
      threadId,
      userMessage: message,
      testMode,
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 429 },
      );
    }
    if (err instanceof AgentInferenceError) {
      const status = inferenceCodeToStatus(err.code);
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status },
      );
    }
    if (err instanceof AgentEnvNotReadyError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : "Inference failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function inferenceCodeToStatus(code: string): number {
  switch (code) {
    case "AGENT_NOT_FOUND":
      return 404;
    case "AGENT_INACTIVE":
    case "NOT_SUBSCRIBED":
      return 403;
    case "MISSING_API_KEY":
    case "UNSUPPORTED_PROVIDER":
      return 503;
    case "EMPTY_MESSAGE":
      return 400;
    default:
      return 500;
  }
}
