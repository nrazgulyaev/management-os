"use server";

/**
 * AI-agents cabinet — digest detail co-located adapters.
 *
 * The underlying digest-actions are org-scoped + import "server-only",
 * so a client island cannot import them directly. These thin adapters:
 *   · derive the approving user server-side (never trust the client),
 *   · add revalidatePath so the detail + list pages refresh,
 *   · keep the underlying tenancy (requireOrgId) untouched.
 */

import { revalidatePath } from "next/cache";
import {
  approveDigest,
  distributeDigest,
  editDigestSection,
} from "@/lib/development/server/executive-digest/digest-actions";
import { getCurrentAppUser } from "@/features/auth/current-user";

type Result = { ok: boolean; error?: string };

function revalidate(code: string) {
  revalidatePath(`/development-os/digests/${code}`);
  revalidatePath("/development-os/digests");
}

export async function approveDigestForUI(code: string): Promise<Result> {
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const r = await approveDigest({ digestCode: code, userId: me.id });
  if (r.ok) revalidate(code);
  return r;
}

export async function distributeDigestForUI(
  code: string,
  recipients: Array<{ recipientType: string; recipientId: string }>,
): Promise<Result> {
  const r = await distributeDigest({ digestCode: code, recipients });
  if (r.ok) revalidate(code);
  return r;
}

export async function editDigestSectionForUI(
  code: string,
  section:
    | "executiveSummary"
    | "cashPosition"
    | "projectProgress"
    | "sales"
    | "investor"
    | "operations"
    | "risks",
  content: string,
): Promise<Result> {
  const r = await editDigestSection({ digestCode: code, section, content });
  if (r.ok) revalidate(code);
  return r;
}
