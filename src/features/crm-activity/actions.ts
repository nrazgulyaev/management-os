"use server";

/**
 * CRM ACTIVITY TIMELINE — write-side composer action (#172 follow-on).
 *
 * Until now the `crm_activities` stream was populated only by automatic events
 * (status changes, system notes). This action lets an operator MANUALLY log a
 * note / call / email against any CRM record (owner / contact / lead / buyer)
 * so the timeline reflects off-platform touchpoints too.
 *
 * Permission-gated (`crm_activity.write`, internal users) + org-scoped (the
 * underlying `recordCrmActivity` stamps organizationId via requireOrgId) +
 * audit-logged (recordCrmActivity emits `crm.activity.record`). On success we
 * revalidate the subject's detail route so the freshly-logged entry appears.
 *
 * BUILD-SAFETY (#168): this is a "use server" module — every export is async.
 * The sync kind list / href map live in ./composer (NON-"use server").
 */

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/features/auth/permissions";
import { recordCrmActivity } from "./services";
import { isCrmSubjectType, type CrmSubjectType } from "./types";
import {
  isComposerKind,
  activitySubjectHref,
  type ComposerKind,
} from "./composer";

export type LogActivityResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export interface LogActivityInput {
  subjectType: CrmSubjectType;
  subjectId: string;
  kind: ComposerKind;
  title: string;
  body?: string | null;
}

/**
 * Manually append one operator-logged activity (note / call / email) to the
 * unified stream. Validates the subject + kind, requires `crm_activity.write`,
 * then delegates the org-scoped + audit-logged insert to `recordCrmActivity`.
 */
export async function logCrmActivity(
  input: LogActivityInput,
): Promise<LogActivityResult> {
  if (!isCrmSubjectType(input.subjectType)) {
    return { ok: false, error: "Unknown record type." };
  }
  if (!isComposerKind(input.kind)) {
    return { ok: false, error: "Pick note, call, or email." };
  }
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "A summary is required." };
  if (title.length > 280) {
    return { ok: false, error: "Keep the summary under 280 characters." };
  }

  await requirePermission("crm_activity.write");

  const id = await recordCrmActivity({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    kind: input.kind,
    title,
    body: input.body?.trim() ? input.body.trim() : null,
  });

  const href = activitySubjectHref(input.subjectType, input.subjectId);
  if (href) revalidatePath(href);

  return { ok: true, id };
}
