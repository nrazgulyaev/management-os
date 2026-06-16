import "server-only";

import { env, aiModel, isAiConfigured, isAiDryRun } from "@/lib/env";
import type { CopilotResponse } from "./types";
import { ALLOWED_TOOLS, executeTool, TOOL_DEFINITIONS } from "./tools";
import { SYSTEM_PROMPT } from "./prompt";
import { parseStructuredResponse } from "./response-parser";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TURNS = 4;
const MAX_OUTPUT_TOKENS = 1500;

export interface CallCopilotResult {
  ok: boolean;
  response?: CopilotResponse;
  errorMessage?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  toolCalls: Array<{
    toolName: string;
    input: unknown;
    status: "success" | "blocked" | "failed";
    errorMessage?: string;
  }>;
  /** Captured raw text for the final assistant turn — used only for
   *  populating `output_summary` (truncated). Never persisted whole. */
  rawText?: string;
}

interface AnthropicResponse {
  id?: string;
  model?: string;
  stop_reason?: string;
  content?: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

/**
 * Call Anthropic with a tightly-scoped tool-use loop. Returns either a
 * validated structured response or `ok: false` + reason. The caller
 * decides whether to fall back; we never throw on model error.
 */
export async function callOperationsCopilot(
  userPrompt: string,
  // TENANCY: the resolved run org (or `null` for the session-less cron run,
  // which is the all-orgs sentinel). Threaded into executeTool so the
  // org-scoped read tools (listServiceRequests / listMaintenanceTickets) see
  // the same org the snapshot was built with, instead of re-resolving (and
  // throwing) via requireOrgId() in a session-less context.
  organizationId: string | null = null,
): Promise<CallCopilotResult> {
  const toolCalls: CallCopilotResult["toolCalls"] = [];

  if (!isAiConfigured() || isAiDryRun()) {
    return {
      ok: false,
      errorMessage: !isAiConfigured()
        ? "ANTHROPIC_API_KEY not configured"
        : "AI_DRY_RUN=1",
      toolCalls,
    };
  }

  const apiKey = env.server.ANTHROPIC_API_KEY!;
  const model = aiModel();

  type Message = {
    role: "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | {
              type: "tool_result";
              tool_use_id: string;
              content: string;
              is_error?: boolean;
            }
          | {
              type: "tool_use";
              id: string;
              name: string;
              input: Record<string, unknown>;
            }
        >;
  };

  const messages: Message[] = [{ role: "user", content: userPrompt }];

  let promptTokens = 0;
  let completionTokens = 0;
  let lastText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: SYSTEM_PROMPT,
          tools: TOOL_DEFINITIONS,
          messages,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      const isAbort = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        errorMessage: isAbort
          ? `Anthropic request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : e instanceof Error
            ? e.message
            : "anthropic fetch failed",
        toolCalls,
      };
    }
    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        ok: false,
        errorMessage: `Anthropic HTTP ${resp.status}: ${text.slice(0, 200)}`,
        toolCalls,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
    }

    const json = (await resp.json().catch(() => ({}))) as AnthropicResponse;
    if (json.error?.message) {
      return {
        ok: false,
        errorMessage: json.error.message,
        toolCalls,
      };
    }
    promptTokens += json.usage?.input_tokens ?? 0;
    completionTokens += json.usage?.output_tokens ?? 0;

    const blocks = json.content ?? [];
    const toolUses = blocks.filter(
      (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        b.type === "tool_use",
    );
    const textBlocks = blocks.filter(
      (b): b is { type: "text"; text: string } => b.type === "text",
    );
    if (textBlocks.length > 0) {
      lastText = textBlocks.map((t) => t.text).join("\n").trim();
    }

    if (toolUses.length === 0) {
      // Final turn — model is done. Validate JSON.
      const parsed = parseStructuredResponse(lastText);
      if (!parsed.ok) {
        return {
          ok: false,
          errorMessage: parsed.errorMessage,
          toolCalls,
          rawText: lastText.slice(0, 1200),
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        };
      }
      return {
        ok: true,
        response: parsed.response,
        toolCalls,
        rawText: lastText.slice(0, 1200),
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
    }

    // Tool-use round — execute each, append assistant message + tool_results.
    messages.push({
      role: "assistant",
      content: blocks.map((b) =>
        b.type === "tool_use"
          ? { type: "tool_use" as const, id: b.id, name: b.name, input: b.input }
          : { type: "text" as const, text: b.text },
      ),
    });

    const toolResults: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];
    for (const tu of toolUses) {
      if (!ALLOWED_TOOLS.includes(tu.name as (typeof ALLOWED_TOOLS)[number])) {
        toolCalls.push({
          toolName: tu.name,
          input: tu.input,
          status: "blocked",
          errorMessage: "tool not on allowlist",
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify({ error: "tool not allowed" }),
          is_error: true,
        });
        continue;
      }
      const result = await executeTool(tu.name, tu.input, organizationId);
      toolCalls.push({
        toolName: tu.name,
        input: tu.input,
        status: result.ok ? "success" : "failed",
        errorMessage: result.errorMessage,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: result.ok
          ? truncate(JSON.stringify(result.output ?? null), 8_000)
          : JSON.stringify({ error: result.errorMessage ?? "tool failed" }),
        is_error: !result.ok,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    ok: false,
    errorMessage: `model exceeded ${MAX_TURNS} tool-use turns without producing a final answer`,
    toolCalls,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…(truncated)";
}
