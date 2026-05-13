/**
 * Stage 10.6.E.2.5 — Impersonation banner overlay.
 *
 * Server component — reads the impersonation cookie + renders an
 * unmissable banner across the top of every page when active.
 * Client-side End Session button calls endImpersonationAction.
 *
 * v1 scoping caveat: the cookie is set + audit-logged + this banner
 * renders, but the org_id resolution swap in middleware/RLS is NOT
 * yet wired. So while the banner says "viewing as X", every
 * /dashboard/* request still loads the operator's own org. The
 * affordance + audit trail exist; the data-view swap is a follow-up.
 *
 * Mount this in the ROOT layout once the data-view swap is wired.
 * For 10.6.E.2.5 it's mountable into any layout that wants to
 * surface the operator's impersonation state.
 */

import * as React from "react";
import { readImpersonationCookie } from "@/lib/subscription-os/actions";
import { ImpersonationEndButton } from "./impersonation-end-button";

export async function ImpersonationBanner() {
  const cookie = await readImpersonationCookie();
  if (!cookie) return null;

  const startedAt = new Date(cookie.startedAt);
  const elapsedMin = Math.floor((Date.now() - cookie.startedAt) / 60_000);

  return (
    <div className="sticky top-0 z-50 bg-warning text-ink-inverse border-b border-warning/60 shadow-soft-card">
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] tracking-[0.18em] uppercase font-medium bg-ink text-ink-inverse rounded-full px-3 py-1">
            Impersonating
          </span>
          <span className="text-sm font-medium truncate">
            Viewing as <span className="font-mono">{cookie.asOrgCode}</span>
            {" · "}
            <span className="opacity-80">read-only scaffold</span>
          </span>
          <span className="text-xs opacity-70 hidden md:inline">
            started {startedAt.toISOString().slice(11, 16)}Z (~{elapsedMin}m
            ago) by {cookie.byOperatorEmail}
          </span>
        </div>
        <ImpersonationEndButton />
      </div>
    </div>
  );
}
