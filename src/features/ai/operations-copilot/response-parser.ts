/**
 * Pure parser for the model's structured response. No `server-only`,
 * no DB. Imported by both the (server-only) provider and tests.
 *
 * The system prompt asks for a single JSON object with no fences, but
 * be defensive: strip common decorations before parsing.
 */

import { copilotResponseSchema, type CopilotResponse } from "./types";

export type ParseResult =
  | { ok: true; response: CopilotResponse }
  | { ok: false; errorMessage: string };

export function parseStructuredResponse(text: string): ParseResult {
  if (!text || text.trim().length === 0) {
    return { ok: false, errorMessage: "model returned no text" };
  }
  let candidate = text.trim();
  // Strip markdown fences if the model added them anyway.
  candidate = candidate.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  // Take from first `{` to last `}` so trailing notes don't break parse.
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return { ok: false, errorMessage: "no JSON object found in model output" };
  }
  candidate = candidate.slice(first, last + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (e) {
    return {
      ok: false,
      errorMessage: `model output was not valid JSON: ${
        e instanceof Error ? e.message : "parse error"
      }`,
    };
  }
  const result = copilotResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      errorMessage: `model output failed schema validation: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    };
  }
  return { ok: true, response: result.data };
}
