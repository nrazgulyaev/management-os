/**
 * Stage 7.F.B.2 — Google Workspace OAuth callback endpoint.
 *
 * GET → verifies state cookie, exchanges code for tokens, persists
 * the grant to `oauth_connections` (via `persistGoogleOAuthGrant`).
 * Redirects to the settings page with success/error feedback.
 */

import { type NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/google-workspace";
import { persistGoogleOAuthGrant } from "@/lib/google-workspace/service";
import {
  googleWorkspaceOAuthClientId,
  googleWorkspaceOAuthClientSecret,
  googleWorkspaceOAuthRedirectUri,
} from "@/lib/env";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redirect(url: string, base: URL): NextResponse {
  const target = new URL(url, base);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirect(
      `/development-os/settings/google-workspace?error=${encodeURIComponent(error)}`,
      url,
    );
  }
  if (!code || !state) {
    return redirect(
      "/development-os/settings/google-workspace?error=missing_code",
      url,
    );
  }

  const cookieState = request.cookies.get("google_oauth_state")?.value ?? "";
  if (!cookieState || cookieState !== state) {
    return redirect(
      "/development-os/settings/google-workspace?error=state_mismatch",
      url,
    );
  }

  const clientId = googleWorkspaceOAuthClientId();
  const clientSecret = googleWorkspaceOAuthClientSecret();
  const redirectUri = googleWorkspaceOAuthRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) {
    return redirect(
      "/development-os/settings/google-workspace?error=missing_env",
      url,
    );
  }

  let tokens;
  try {
    tokens = await exchangeGoogleCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "exchange_failed";
    return redirect(
      `/development-os/settings/google-workspace?error=${encodeURIComponent(msg)}`,
      url,
    );
  }

  // Resolve current user + org for the grant via the authenticated
  // session (TENANT-1 read-side migration).
  const me = await getCurrentAppUser();
  if (!me) {
    return redirect(
      "/development-os/settings/google-workspace?error=not_signed_in",
      url,
    );
  }
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return redirect(
      "/development-os/settings/google-workspace?error=no_org",
      url,
    );
  }

  // Account email is best-effort — we don't have userinfo without a
  // separate call. Use the user's email as the placeholder; the next
  // workflow run can patch it via the userinfo endpoint.
  const accountEmail = me.email ?? `${me.id}@unknown`;

  try {
    await persistGoogleOAuthGrant({
      organizationId: orgId,
      userId: me.id,
      accountEmail,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(tokens.expiresAt),
      scopes: tokens.scopes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "persist_failed";
    return redirect(
      `/development-os/settings/google-workspace?error=${encodeURIComponent(msg)}`,
      url,
    );
  }

  // Clear the state cookie + redirect with success.
  const res = redirect(
    "/development-os/settings/google-workspace?ok=connected",
    url,
  );
  res.cookies.delete("google_oauth_state");
  return res;
}
