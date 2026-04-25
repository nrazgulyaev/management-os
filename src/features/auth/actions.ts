"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";

export type AuthResult =
  | { ok: true }
  | { ok: false; error: string };

const credSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function signInAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = credSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password (min 8 chars)." };
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      error:
        "Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, or use a demo quick-link below.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await getSupabaseServer();
  if (supabase) {
    await supabase.auth.signOut();
  }
  revalidatePath("/");
  redirect("/login");
}
