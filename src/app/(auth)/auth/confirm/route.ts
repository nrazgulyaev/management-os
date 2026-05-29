/**
 * Auth email-link confirmation handler.
 *
 * Single landing for any Supabase auth email link (password recovery
 * today; reusable for email-change / magic-link later). It establishes a
 * session from whichever token shape the link carries, then forwards to
 * `next` (a same-origin path).
 *
 * Two token shapes are supported so the flow works regardless of the
 * Supabase project's email-template config:
 *
 *   - `token_hash` + `type` → `verifyOtp(...)`. Cross-device safe (no
 *     local PKCE verifier needed). Enable by setting the "Reset Password"
 *     email template to:
 *       {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 *
 *   - `code` → `exchangeCodeForSession(code)`. The default PKCE template;
 *     requires the recovery to be opened in the same browser that
 *     requested it (the code_verifier cookie lives there).
 *
 * On success the SSR Supabase client writes the session cookie onto this
 * route's response (route handlers can mutate cookies), so the subsequent
 * `/reset-password` render sees an authenticated user.
 */

import { type NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Only allow same-origin relative redirects (no `//host` open-redirect). */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/reset-password";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.redirect(
      new URL("/login?error=auth_unconfigured", request.url),
    );
  }

  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (ok) {
    return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(
    new URL("/forgot-password?error=link_invalid", request.url),
  );
}
