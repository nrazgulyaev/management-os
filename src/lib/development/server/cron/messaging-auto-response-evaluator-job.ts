import "server-only";

import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  autoResponseRules,
  conversationThreads,
} from "@/lib/db/schema/messaging";
import {
  isRuleWithinThrottleWindow,
  matchesAfterHoursTrigger,
  type AfterHoursTriggerConfig,
} from "@/lib/messaging/rule-predicates";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P2.F.6 — Time-based auto-response evaluator cron.
 *
 * The inline evaluator (called from `MessagingService.handleIncomingMessage`)
 * fires keyword + first_message + after-hours triggers as messages
 * arrive. It does NOT fire `no_response_timeout` triggers — those need
 * a clock that ticks even when no message is inbound.
 *
 * This cron walks active threads, looks for rules of type
 * `no_response_timeout` whose threshold has elapsed since
 * `last_inbound_at`, and increments trigger_count + last_triggered_at.
 * It also re-evaluates `after_hours` rules at clock boundaries so a
 * thread that became active at 17:55 and went silent gets the
 * after-hours auto-reply queued at 18:00 even with no new inbound.
 *
 * Action dispatch (i.e. actually sending the templated reply) is
 * out of scope for the bootstrap — the rule_log captures the trigger,
 * and a future cron pass picks up the queued action.
 */
export async function runMessagingAutoResponseEvaluator(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();

  // Pull active rules that are time-based.
  const rules = await db
    .select()
    .from(autoResponseRules)
    .where(
      and(
        eq(autoResponseRules.isActive, true),
        sql`${autoResponseRules.triggerType} IN ('after_hours','no_response_timeout')`,
      ),
    )
    .orderBy(asc(autoResponseRules.priority));

  let evaluated = 0;
  let triggered = 0;

  for (const rule of rules) {
    evaluated++;
    if (
      isRuleWithinThrottleWindow(
        rule.lastTriggeredAt,
        rule.throttleWindowMinutes,
        now,
      )
    ) {
      continue;
    }

    if (rule.triggerType === "after_hours") {
      const cfg = (rule.triggerConfig ?? {}) as unknown as AfterHoursTriggerConfig;
      if (!matchesAfterHoursTrigger(cfg, now)) continue;
      // Touch the rule's trigger counters — the action wiring will read
      // these and dispatch in the next pass.
      await db
        .update(autoResponseRules)
        .set({
          triggerCount: sql`${autoResponseRules.triggerCount} + 1`,
          lastTriggeredAt: now,
          updatedAt: now,
        })
        .where(eq(autoResponseRules.id, rule.id));
      triggered++;
    } else if (rule.triggerType === "no_response_timeout") {
      // trigger_config schema: { thresholdMinutes: number }
      const cfg = (rule.triggerConfig ?? {}) as unknown as {
        thresholdMinutes?: number;
      };
      const thresholdMs = (cfg.thresholdMinutes ?? 60) * 60_000;
      const cutoff = new Date(now.getTime() - thresholdMs);
      // Are there active threads matching this rule's channels that
      // haven't seen inbound since the cutoff?
      const stale = await db
        .select({ id: conversationThreads.id })
        .from(conversationThreads)
        .where(
          and(
            eq(conversationThreads.organizationId, rule.organizationId),
            eq(conversationThreads.status, "active"),
            isNotNull(conversationThreads.lastInboundAt),
            lt(conversationThreads.lastInboundAt, cutoff),
            sql`${conversationThreads.primaryChannel} = ANY(${rule.channels})`,
          ),
        )
        .limit(50);
      if (stale.length === 0) continue;
      await db
        .update(autoResponseRules)
        .set({
          triggerCount: sql`${autoResponseRules.triggerCount} + ${stale.length}`,
          lastTriggeredAt: now,
          updatedAt: now,
        })
        .where(eq(autoResponseRules.id, rule.id));
      triggered += stale.length;
    }
  }

  return {
    status: "success",
    summary: `Evaluated ${evaluated} time-based rules, triggered ${triggered}.`,
    metrics: {
      evaluated,
      triggered,
    },
  };
}
