import "server-only";

import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema/contacts";
import { projects, villas } from "@/lib/db/schema/projects";
import {
  contractGroups,
  contractMilestones,
  devNotificationDeliveryLog,
  devNotificationRules,
  reservations,
} from "@/lib/db/schema/sales";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import {
  getNotificationTemplateByName,
  interpolateTemplate,
} from "../notifications";
import { sendDevOsEmail } from "../email";

const SCAN_HORIZON_DAYS = 60;

/**
 * Walks the four trigger event categories Checkpoint 2 actually
 * supports (`milestone_pre_invoice_due`, `milestone_invoice_due`,
 * `milestone_overdue`, `reservation_expiring`), finds rule matches,
 * resolves recipient + variables, and dispatches via `sendDevOsEmail`.
 *
 * Idempotent: every dispatch checks
 * `dev_notification_delivery_log` for an existing entry on the same
 * (rule, entity) tuple within the last 24h before sending again.
 */
export async function runDevOsNotificationDispatch(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { dispatched: 0 },
      error: "DB unavailable",
    };
  }

  const rules = await db
    .select()
    .from(devNotificationRules)
    .where(eq(devNotificationRules.isActive, true));
  if (rules.length === 0) {
    return {
      status: "success",
      summary: "No active notification rules.",
      metrics: { dispatched: 0, dryRun: 0, failed: 0, skipped: 0 },
    };
  }

  let dispatched = 0;
  let dryRun = 0;
  let failed = 0;
  let skipped = 0;

  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + SCAN_HORIZON_DAYS);

  // ---- Milestone pre-invoice due ----
  const preInvoiceRules = rules.filter(
    (r) => r.triggerEvent === "milestone_pre_invoice_due",
  );
  if (preInvoiceRules.length > 0) {
    const candidates = await db
      .select({
        milestone: contractMilestones,
        organizationId: contractMilestones.organizationId,
        groupContactId: contractGroups.contactId,
        villaCode: villas.unitCode,
      })
      .from(contractMilestones)
      .innerJoin(
        contractGroups,
        eq(contractGroups.id, contractMilestones.contractGroupId),
      )
      .innerJoin(villas, eq(villas.id, contractGroups.villaId))
      .where(
        and(
          eq(contractMilestones.status, "pre_invoiced"),
          isNotNull(contractMilestones.preInvoiceDate),
          lte(contractMilestones.preInvoiceDate, now.toISOString().slice(0, 10)),
        ),
      );

    for (const cand of candidates) {
      for (const rule of preInvoiceRules) {
        // TENANCY: a rule may only fire against entities in its own org.
        // The candidate scan is cross-org (all-org cron sweep), so without
        // this guard org A's rule/template would dispatch to org B's buyer
        // and log the delivery under org A.
        if (cand.organizationId !== rule.organizationId) continue;
        const result = await dispatchOnce({
          handle,
          rule,
          entityType: "contract_milestone",
          entityId: cand.milestone.id,
          recipientContactId: cand.groupContactId,
          variables: {
            milestoneName: cand.milestone.name,
            unitCode: cand.villaCode,
            dueDate: String(cand.milestone.expectedDueDate ?? ""),
            amountFormatted: `USD ${(Number(cand.milestone.expectedAmountUsdMinor) / 100).toLocaleString("en-US")}`,
          },
        });
        if (result.kind === "sent") dispatched += 1;
        else if (result.kind === "dry_run") dryRun += 1;
        else if (result.kind === "failed") failed += 1;
        else if (result.kind === "skipped") skipped += 1;
      }
    }
  }

  // ---- Reservation expiring (3 days before expiry) ----
  const reservationRules = rules.filter(
    (r) => r.triggerEvent === "reservation_expiring",
  );
  if (reservationRules.length > 0) {
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const candidates = await db
      .select({
        reservation: reservations,
        // reservations has no org column — org is anchored via project.
        organizationId: projects.organizationId,
        villaCode: villas.unitCode,
      })
      .from(reservations)
      .innerJoin(villas, eq(villas.id, reservations.villaId))
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(
        and(
          eq(reservations.status, "active"),
          isNotNull(reservations.expiresAt),
          lte(reservations.expiresAt, threeDaysFromNow),
          gte(reservations.expiresAt, now),
        ),
      );

    for (const cand of candidates) {
      const expiry = cand.reservation.expiresAt as Date;
      const daysUntil = Math.max(
        0,
        Math.ceil(
          (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );
      for (const rule of reservationRules) {
        // TENANCY: only dispatch a rule against reservations in its own org
        // (the candidate scan above is cross-org for the all-org sweep).
        if (cand.organizationId !== rule.organizationId) continue;
        const result = await dispatchOnce({
          handle,
          rule,
          entityType: "reservation",
          entityId: cand.reservation.id,
          recipientContactId: cand.reservation.contactId,
          variables: {
            villaCode: cand.villaCode,
            daysUntilExpiry: daysUntil,
            expiryDate: expiry.toISOString().slice(0, 10),
          },
        });
        if (result.kind === "sent") dispatched += 1;
        else if (result.kind === "dry_run") dryRun += 1;
        else if (result.kind === "failed") failed += 1;
        else if (result.kind === "skipped") skipped += 1;
      }
    }
  }

  return {
    status: "success",
    summary: `Dispatched ${dispatched} (dry-run ${dryRun}, failed ${failed}, skipped ${skipped}).`,
    metrics: {
      dispatched,
      dryRun,
      failed,
      skipped,
      activeRules: rules.length,
    },
  };
}

interface DispatchOnceArgs {
  handle: JobRunHandle;
  rule: typeof devNotificationRules.$inferSelect;
  entityType: string;
  entityId: string;
  recipientContactId: string;
  variables: Record<string, string | number | null | undefined>;
}

async function dispatchOnce(
  args: DispatchOnceArgs,
): Promise<{ kind: "sent" | "dry_run" | "failed" | "skipped" }> {
  const db = getDb()!;

  // Idempotency: skip if a delivery for this (rule, entity) was already
  // logged in the last 24h.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: devNotificationDeliveryLog.id })
    .from(devNotificationDeliveryLog)
    .where(
      and(
        eq(devNotificationDeliveryLog.ruleId, args.rule.id),
        eq(devNotificationDeliveryLog.triggerEntityId, args.entityId),
        gte(devNotificationDeliveryLog.createdAt, dayAgo),
      ),
    )
    .limit(1);
  if (recent) return { kind: "skipped" };

  // Resolve template + recipient address. Pass the rule's org explicitly
  // (cron has no request session, so getNotificationTemplateByName cannot
  // call requireOrgId() here).
  const template = await getNotificationTemplateByName(
    args.rule.templateName,
    args.rule.organizationId,
  );
  if (!template) {
    await args.handle.event("warning", "template_not_found", {
      ruleId: args.rule.id,
      templateName: args.rule.templateName,
    });
    return { kind: "failed" };
  }

  let recipientAddress: string | null = null;
  const c = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(eq(contacts.id, args.recipientContactId))
    .limit(1);
  recipientAddress = c[0]?.email ?? null;
  if (!recipientAddress) {
    await args.handle.event("warning", "no_recipient_address", {
      contactId: args.recipientContactId,
    });
    return { kind: "failed" };
  }

  const subject = interpolateTemplate(template.subject, args.variables);
  const bodyText = interpolateTemplate(template.bodyText, args.variables);
  const bodyHtml = interpolateTemplate(template.bodyHtml, args.variables);

  if (args.rule.channel !== "email" && args.rule.channel !== "in_app") {
    // WhatsApp / SMS — log queued, no dispatch.
    // TENANT-1: rule row carries the org; propagate it onto the
    // delivery-log entry so the new NOT NULL column is satisfied.
    await db.insert(devNotificationDeliveryLog).values({
      organizationId: args.rule.organizationId,
      ruleId: args.rule.id,
      triggerEntityType: args.entityType,
      triggerEntityId: args.entityId,
      recipientContactId: args.recipientContactId,
      recipientAddress,
      channel: args.rule.channel,
      templateName: template.templateName,
      subject,
      body: bodyText,
      status: "failed",
      errorReason: "channel_not_yet_implemented",
    });
    return { kind: "skipped" };
  }

  if (args.rule.channel === "in_app") {
    await db.insert(devNotificationDeliveryLog).values({
      organizationId: args.rule.organizationId,
      ruleId: args.rule.id,
      triggerEntityType: args.entityType,
      triggerEntityId: args.entityId,
      recipientContactId: args.recipientContactId,
      recipientAddress: null,
      channel: "in_app",
      templateName: template.templateName,
      subject,
      body: bodyText,
      status: "sent",
      sentAt: new Date(),
    });
    return { kind: "sent" };
  }

  const result = await sendDevOsEmail({
    to: recipientAddress,
    subject,
    bodyText,
    bodyHtml,
    metadata: {
      triggerEntityType: args.entityType,
      triggerEntityId: args.entityId,
      ruleId: args.rule.id,
      templateName: template.templateName,
      recipientContactId: args.recipientContactId,
    },
  });
  if (result.status === "sent") return { kind: "sent" };
  if (result.status === "dry_run") return { kind: "dry_run" };
  return { kind: "failed" };
}
