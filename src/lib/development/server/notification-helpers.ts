/**
 * Pure helpers for notification-template variable interpolation.
 *
 * Lives outside the server module so node:test specs can exercise it
 * without dragging the database client.
 */

export interface InterpolationContext {
  [key: string]: string | number | bigint | null | undefined;
}

/**
 * Replaces `{{variable}}` placeholders with values from the context.
 *
 * - Unknown variables become empty strings (no throw — templates should
 *   never fail dispatch because a field is missing).
 * - `bigint` values are converted to string.
 * - Whitespace inside the braces is tolerated: `{{ name }}` works.
 */
export function interpolateTemplate(
  template: string,
  context: InterpolationContext,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, name) => {
    const value = context[name as string];
    if (value === null || value === undefined) return "";
    if (typeof value === "bigint") return value.toString();
    return String(value);
  });
}

/** Lists every `{{variable}}` reference in a template, deduped. */
export function extractTemplateVariables(template: string): string[] {
  const set = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
    set.add(m[1]);
  }
  return [...set];
}
