/**
 * Pure response parsing for the guest concierge. The model is asked
 * for plain text (no JSON envelope) — much cleaner UX for chat. This
 * module is the seam where we apply final normalization.
 */

export interface ParsedAssistantResponse {
  text: string;
  /** Word count after normalization. Used to enforce the soft cap. */
  wordCount: number;
}

export function parseAssistantResponse(
  raw: string,
): ParsedAssistantResponse {
  const text = (raw ?? "").trim();
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/).length;
  return { text, wordCount };
}
