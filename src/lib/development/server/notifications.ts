import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  devNotificationDeliveryLog,
  devNotificationRules,
  devNotificationTemplates,
  type DevNotificationDelivery,
  type DevNotificationRule,
  type DevNotificationTemplate,
} from "@/lib/db/schema/sales";
import type {
  NotificationDeliveryRecord,
  NotificationDeliveryStatus,
  NotificationRecipientType,
  NotificationRuleData,
  NotificationTemplateData,
  NotificationTriggerEvent,
  NotificationChannel,
} from "@/lib/development/types/notifications";

export type {
  NotificationDeliveryRecord,
  NotificationRuleData,
  NotificationTemplateData,
} from "@/lib/development/types/notifications";

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === "string" ? d : d.toISOString();
}

function ruleToData(r: DevNotificationRule): NotificationRuleData {
  return {
    id: r.id,
    ruleName: r.ruleName,
    description: r.description,
    triggerEvent: r.triggerEvent as NotificationTriggerEvent,
    triggerOffsetDays: r.triggerOffsetDays,
    recipientType: r.recipientType as NotificationRecipientType,
    recipientRoleKey: r.recipientRoleKey,
    recipientUserId: r.recipientUserId,
    channel: r.channel as NotificationChannel,
    templateName: r.templateName,
    isActive: r.isActive,
  };
}

function templateToData(
  t: DevNotificationTemplate,
): NotificationTemplateData {
  return {
    id: t.id,
    templateName: t.templateName,
    subject: t.subject,
    bodyHtml: t.bodyHtml,
    bodyText: t.bodyText,
    language: t.language,
    description: t.description,
  };
}

function deliveryToRecord(
  d: DevNotificationDelivery,
): NotificationDeliveryRecord {
  return {
    id: d.id,
    ruleId: d.ruleId,
    triggerEntityType: d.triggerEntityType,
    triggerEntityId: d.triggerEntityId,
    recipientContactId: d.recipientContactId,
    recipientUserId: d.recipientUserId,
    recipientAddress: d.recipientAddress,
    channel: d.channel as NotificationChannel,
    templateName: d.templateName,
    subject: d.subject,
    body: d.body,
    status: d.status as NotificationDeliveryStatus,
    sentAt: toIso(d.sentAt),
    deliveredAt: toIso(d.deliveredAt),
    errorReason: d.errorReason,
    externalMessageId: d.externalMessageId,
    createdAt: toIso(d.createdAt) ?? new Date().toISOString(),
  };
}

export async function getNotificationRules(
  filter: { activeOnly?: boolean } = {},
): Promise<NotificationRuleData[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const conds = [eq(devNotificationRules.organizationId, organizationId)];
  if (filter.activeOnly) conds.push(eq(devNotificationRules.isActive, true));
  const rows = await db
    .select()
    .from(devNotificationRules)
    .where(and(...conds))
    .orderBy(desc(devNotificationRules.createdAt));
  return rows.map(ruleToData);
}

export async function getNotificationRulesForTrigger(
  triggerEvent: NotificationTriggerEvent,
): Promise<NotificationRuleData[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(devNotificationRules)
    .where(
      and(
        eq(devNotificationRules.triggerEvent, triggerEvent),
        eq(devNotificationRules.isActive, true),
      ),
    );
  return rows.map(ruleToData);
}

export async function getNotificationTemplates(): Promise<
  NotificationTemplateData[]
> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(devNotificationTemplates)
    .where(eq(devNotificationTemplates.organizationId, organizationId))
    .orderBy(devNotificationTemplates.templateName);
  return rows.map(templateToData);
}

export async function getNotificationTemplateByName(
  templateName: string,
  organizationId: string | null = null,
): Promise<NotificationTemplateData | null> {
  const db = getDb();
  if (!db) return null;
  const orgId = organizationId ?? (await requireOrgId());
  const rows = await db
    .select()
    .from(devNotificationTemplates)
    .where(
      and(
        eq(devNotificationTemplates.templateName, templateName),
        eq(devNotificationTemplates.organizationId, orgId),
      ),
    )
    .limit(1);
  return rows[0] ? templateToData(rows[0]) : null;
}

export interface DeliveryFilters {
  status?: NotificationDeliveryStatus;
  channel?: NotificationChannel;
  triggerEntityType?: string;
  triggerEntityId?: string;
  limit?: number;
}

export async function getNotificationDeliveryLog(
  filters: DeliveryFilters = {},
): Promise<NotificationDeliveryRecord[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const conds = [eq(devNotificationDeliveryLog.organizationId, organizationId)];
  if (filters.status) conds.push(eq(devNotificationDeliveryLog.status, filters.status));
  if (filters.channel) conds.push(eq(devNotificationDeliveryLog.channel, filters.channel));
  if (filters.triggerEntityType)
    conds.push(eq(devNotificationDeliveryLog.triggerEntityType, filters.triggerEntityType));
  if (filters.triggerEntityId)
    conds.push(eq(devNotificationDeliveryLog.triggerEntityId, filters.triggerEntityId));

  const rows = await db
    .select()
    .from(devNotificationDeliveryLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(devNotificationDeliveryLog.createdAt))
    .limit(filters.limit ?? 200);
  return rows.map(deliveryToRecord);
}

/**
 * Pure helper: substitute `{{variable}}` placeholders in template strings.
 * Exported for use in actions and tests.
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
