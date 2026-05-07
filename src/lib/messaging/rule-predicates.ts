/**
 * Stage 6.P2.F — Pure auto-response rule predicates.
 *
 * Lives in its own file (no `"use server"`, no DB imports) so the
 * test infrastructure can import it without dragging in the full
 * service module + `server-only` chain. The DB-touching evaluator
 * in `rule-evaluator.ts` re-exports these helpers and adds the
 * service-layer walk.
 */

export interface KeywordTriggerConfig {
  keywords: string[];
  matchType?: "any" | "all";
  caseSensitive?: boolean;
}

export function matchesKeywordTrigger(
  config: KeywordTriggerConfig,
  text: string,
): boolean {
  if (!config.keywords || config.keywords.length === 0) return false;
  const matchType = config.matchType ?? "any";
  const caseSensitive = config.caseSensitive ?? false;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const checks = config.keywords.map((k) => {
    const needle = caseSensitive ? k : k.toLowerCase();
    return haystack.includes(needle);
  });
  return matchType === "all" ? checks.every(Boolean) : checks.some(Boolean);
}

export interface AfterHoursTriggerConfig {
  /** IANA timezone — e.g. "Asia/Jakarta". */
  timezone: string;
  /** Hour at which off-hours starts (24h). */
  startHour: number;
  /** Hour at which on-hours resumes (24h). */
  endHour: number;
}

/**
 * After-hours predicate: true when `at` falls inside the configured
 * off-hours window in the given timezone.
 *
 * Window semantics:
 *   - startHour > endHour (typical: 18→9): wraps midnight.
 *   - startHour < endHour (e.g. 9→18): daytime window — useful for
 *     "out for lunch" inverse cases.
 *   - startHour === endHour: always after-hours.
 */
export function matchesAfterHoursTrigger(
  config: AfterHoursTriggerConfig,
  at: Date,
): boolean {
  const localHour = getLocalHour(at, config.timezone);
  if (localHour === null) return false;
  if (config.startHour === config.endHour) return true;
  if (config.startHour > config.endHour) {
    return localHour >= config.startHour || localHour < config.endHour;
  }
  return localHour >= config.startHour && localHour < config.endHour;
}

/**
 * Extract hour-of-day in a given timezone. Returns null when the
 * timezone is unknown to the runtime.
 */
export function getLocalHour(at: Date, timezone: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(at);
    const hourPart = parts.find((p) => p.type === "hour");
    if (!hourPart) return null;
    const h = Number(hourPart.value);
    if (!Number.isInteger(h)) return null;
    return h === 24 ? 0 : h;
  } catch {
    return null;
  }
}

/**
 * Returns true when the rule should be skipped (it's still inside
 * the throttle window). Pure helper.
 */
export function isRuleWithinThrottleWindow(
  lastTriggeredAt: Date | null,
  throttleWindowMinutes: number,
  now: Date,
): boolean {
  if (!lastTriggeredAt) return false;
  const windowMs = throttleWindowMinutes * 60_000;
  return now.getTime() - lastTriggeredAt.getTime() < windowMs;
}
