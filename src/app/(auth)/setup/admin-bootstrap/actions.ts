"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { headers } from "next/headers";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import { linkSupabaseUserToSuperAdmin } from "@/features/auth/bootstrap";

export type BootstrapResult =
  | { ok: true }
  | { ok: false; error: string };

const schema = z.object({
  fullName: z.string().min(2).max(160),
  secret: z.string().optional(),
});

export async function bootstrapSuperAdminAction(
  _prev: BootstrapResult | null,
  formData: FormData,
): Promise<BootstrapResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Provide your full name (min 2 chars)." };
  }

  const auth = await getCurrentAuthUser();
  if (!auth || !auth.email) {
    return { ok: false, error: "No active Supabase session. Sign in first." };
  }

  const h = await headers();
  const result = await linkSupabaseUserToSuperAdmin({
    authUserId: auth.id,
    email: auth.email,
    fullName: parsed.data.fullName,
    providedSecret: parsed.data.secret ?? null,
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent") ?? null,
  });

  if (!result.ok) {
    const map: Record<string, string> = {
      db_missing: "Database not configured.",
      secret_required: "ADMIN_BOOTSTRAP_SECRET is required — paste it above.",
      secret_invalid: "Bootstrap secret is incorrect.",
      not_configured: "ADMIN_BOOTSTRAP_SECRET is not set on the server.",
      internal: "Internal error. Check server logs.",
    };
    return { ok: false, error: map[result.reason] ?? result.reason };
  }

  revalidatePath("/dashboard");
  redirect(`/setup/admin-bootstrap?ok=1&first=${result.firstAdmin ? "1" : "0"}`);
}
