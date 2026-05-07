/**
 * Stage 7.F.B.2 — Google Workspace OAuth start endpoint.
 *
 * GET → builds the consent-screen URL with all 4 scopes (Calendar /
 * Sheets / Drive / Gmail), embeds a CSRF state token in a short-lived
 * cookie, and 302s to Google.
 *
 * Reuses `buildGoogleAuthorizeUrl` from Stage 6.P5.
 */

import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  buildGoogleAuthorizeUrl,
  GOOGLE_WORKSPACE_SCOPES,
} from "@/lib/google-workspace";
import {
  googleWorkspaceOAuthClientId,
  googleWorkspaceOAuthRedirectUri,
  isGoogleWorkspaceConfigured,
} from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCOPES = [
  GOOGLE_WORKSPACE_SCOPES.calendarEventsReadWrite,
  GOOGLE_WORKSPACE_SCOPES.gmailModify,
  GOOGLE_WORKSPACE_SCOPES.spreadsheetsReadWrite,
  GOOGLE_WORKSPACE_SCOPES.driveFile,
  GOOGLE_WORKSPACE_SCOPES.userinfoEmail,
  GOOGLE_WORKSPACE_SCOPES.userinfoProfile,
];

export async function GET(request: NextRequest) {
  if (!isGoogleWorkspaceConfigured()) {
    return NextResponse.redirect(
      new URL(
        "/development-os/settings/google-workspace?error=not_configured",
        request.url,
      ),
    );
  }

  const clientId = googleWorkspaceOAuthClientId();
  const redirectUri = googleWorkspaceOAuthRedirectUri();
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(
      new URL(
        "/development-os/settings/google-workspace?error=missing_env",
        request.url,
      ),
    );
  }

  // CSRF — random state token persisted in a short-lived HttpOnly cookie.
  const state = randomBytes(24).toString("base64url");

  const authorizeUrl = buildGoogleAuthorizeUrl({
    clientId,
    redirectUri,
    scopes: SCOPES,
    state,
    prompt: "consent",
  });

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  return res;
}
