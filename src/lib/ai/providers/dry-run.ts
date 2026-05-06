import "server-only";

import {
  type AICompletionRequest,
  type AICompletionResponse,
  type AIProvider,
} from "./types";

/**
 * Deterministic AI provider used when AI_DRY_RUN=1 (default in tests
 * and dev) or when the API key is missing.
 *
 * Returns a synthetic response that mirrors the JSON / text shape the
 * real provider would emit, so callers exercising the agent loop end
 * to end can run without a live key. Token counts are estimated from
 * input length × 0.25 (rough chars-to-tokens ratio for English).
 *
 * Photo Analyst calls — keyed by `responseFormat='json'` AND a known
 * marker in the system prompt — get a richer stub so HITL UI can be
 * exercised in dev. All other calls get a generic acknowledgement.
 */

const PHOTO_ANALYST_MARKER = "DEV_OS_PHOTO_ANALYST_V1";

export class DryRunProvider implements AIProvider {
  readonly name = "dry-run";
  readonly defaultModel = "dry-run-stub";

  isAvailable(): boolean {
    return true;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    const inputChars = req.messages.reduce((n, m) => n + m.content.length, 0);
    const promptTokens = Math.max(1, Math.ceil(inputChars / 4));

    const isPhotoAnalyst = req.messages.some(
      (m) => m.role === "system" && m.content.includes(PHOTO_ANALYST_MARKER),
    );

    const content = isPhotoAnalyst
      ? JSON.stringify({
          caption: "Workers pouring concrete on the ground floor slab.",
          detected_objects: ["worker", "concrete_pump", "rebar", "scaffold"],
          progress_inferred_pct: 12,
          safety_concerns: [],
          quality_concerns: [],
          confidence: 0.5,
          dry_run: true,
        })
      : req.responseFormat === "json"
        ? JSON.stringify({ acknowledged: true, dry_run: true })
        : "[dry-run AI response — set AI_DRY_RUN=0 and provide ANTHROPIC_API_KEY for live calls]";

    return {
      content,
      usage: {
        promptTokens,
        completionTokens: Math.ceil(content.length / 4),
        totalTokens: promptTokens + Math.ceil(content.length / 4),
      },
      model: req.model ?? this.defaultModel,
      finishReason: "end_turn",
    };
  }
}

export const PHOTO_ANALYST_PROMPT_MARKER = PHOTO_ANALYST_MARKER;
