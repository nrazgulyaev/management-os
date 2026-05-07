"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  autoResponseRules,
  type MessagingChannel,
} from "@/lib/db/schema/messaging";
import {
  isRuleWithinThrottleWindow,
  matchesAfterHoursTrigger,
  matchesKeywordTrigger,
  type AfterHoursTriggerConfig,
  type KeywordTriggerConfig,
} from "./rule-predicates";

/**
 * Stage 6.P2.F — Auto-response rule evaluator.
 *
 * Walks active rules for the org, applies trigger predicates, and
 * (when triggered) increments trigger_count + last_triggered_at.
 * Pure trigger predicates live in `rule-predicates.ts` so tests can
 * exercise the matching logic without pulling in DB / server-only.
 *
 * Inbound entry: `evaluateAutoResponseRules` runs from
 * `MessagingService.handleIncomingMessage` after a new message lands.
 *
 * Time-based triggers (`after_hours`, `no_response_timeout`) also
 * evaluate from the messaging_auto_response_evaluator cron — same
 * predicates, different caller.
 */

export interface EvaluateRulesInput {
  organizationId: string;
  threadId: string;
  messageId: string;
  channel: MessagingChannel;
  contentText: string;
  isFirstMessageInThread: boolean;
  receivedAt: Date;
}

export interface EvaluateRulesResult {
  evaluated: number;
  triggered: number;
  triggeredRuleIds: string[];
}

/**
 * Walk active rules in priority order, fire the first matching rule
 * per category. Single-rule-fires-once-per-window is enforced via
 * `last_triggered_at` + `throttle_window_minutes`.
 */
export async function evaluateAutoResponseRules(
  input: EvaluateRulesInput,
): Promise<EvaluateRulesResult> {
  const db = requireDb();
  const rules = await db
    .select()
    .from(autoResponseRules)
    .where(
      and(
        eq(autoResponseRules.organizationId, input.organizationId),
        eq(autoResponseRules.isActive, true),
        sql`${input.channel} = ANY(${autoResponseRules.channels})`,
      ),
    )
    .orderBy(asc(autoResponseRules.priority));

  let evaluated = 0;
  let triggered = 0;
  const triggeredRuleIds: string[] = [];
  for (const rule of rules) {
    evaluated++;
    if (
      isRuleWithinThrottleWindow(
        rule.lastTriggeredAt,
        rule.throttleWindowMinutes,
        input.receivedAt,
      )
    ) {
      continue;
    }
    let matched = false;
    if (rule.triggerType === "first_message") {
      matched = input.isFirstMessageInThread;
    } else if (rule.triggerType === "keyword") {
      matched = matchesKeywordTrigger(
        (rule.triggerConfig ?? {}) as unknown as KeywordTriggerConfig,
        input.contentText,
      );
    } else if (rule.triggerType === "after_hours") {
      matched = matchesAfterHoursTrigger(
        (rule.triggerConfig ?? {}) as unknown as AfterHoursTriggerConfig,
        input.receivedAt,
      );
    } else if (rule.triggerType === "no_response_timeout") {
      // Time-based — fires from the cron, not from inbound. Skip here.
      continue;
    }
    if (!matched) continue;

    triggered++;
    triggeredRuleIds.push(rule.id);
    await db
      .update(autoResponseRules)
      .set({
        triggerCount: sql`${autoResponseRules.triggerCount} + 1`,
        lastTriggeredAt: input.receivedAt,
        updatedAt: new Date(),
      })
      .where(eq(autoResponseRules.id, rule.id));
  }
  return { evaluated, triggered, triggeredRuleIds };
}
