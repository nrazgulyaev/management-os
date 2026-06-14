/**
 * Keystone first-run org setup (P0 design-live gap).
 *
 * Empty-system welcome + a 3-step guided wizard (villas → projects → team)
 * that reuses the existing create flows. Progress is persisted per-org in
 * `onboarding_progress` (migration 0128) so an admin can leave and resume.
 *
 * Gated to org admins via the `users.write` capability — the same gate the
 * team-invite + bootstrap surfaces use. Non-admins get a clear notice
 * rather than a thrown authorization error.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import {
  getCurrentUserContext,
  hasPermission,
} from "@/features/auth/permissions";
import { getSetupCounts, getOnboardingProgress } from "@/features/keystone/services";
import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = { title: "Set up your workspace" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-8">
        <div className="page-header">
          <div className="left">
            <h1>Set up your workspace</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to run first-run setup."
        />
      </div>
    );
  }

  const ctx = await getCurrentUserContext();
  if (!hasPermission(ctx, "users.write")) {
    return (
      <div className="flex flex-col gap-8">
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/dashboard">Dashboard</Link> / <span>Setup</span>
            </div>
            <h1>Set up your workspace</h1>
          </div>
        </div>
        <EmptyState
          title="Admin access required"
          description="Only an organisation admin can run first-run setup. Ask an admin to invite you or to complete onboarding."
          action={
            <Link href="/dashboard" className="btn btn-secondary btn-sm">
              Back to dashboard
            </Link>
          }
        />
      </div>
    );
  }

  const orgId = ctx.appUser?.organizationId ?? "";
  const [counts, progress] = await Promise.all([
    getSetupCounts(),
    orgId
      ? getOnboardingProgress(orgId)
      : Promise.resolve({ currentStep: 0, dismissed: false, completedAt: null }),
  ]);

  const allDone =
    counts.villas > 0 && counts.projects > 0 && counts.teamMembers > 1;

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Setup</span>
          </div>
          <h1>Set up your workspace</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            A guided start. Create your projects, add villas under them, invite
            your team, then set how each role works — resume any time.
          </p>
        </div>
      </div>

      {progress.dismissed && (
        <div className="rounded-md border border-info/30 bg-info-weak/40 px-4 py-3 text-sm text-ink-secondary">
          You marked setup as {progress.completedAt ? "complete" : "skipped"}.
          You can still walk back through the steps below at any time.
        </div>
      )}

      {allDone && !progress.dismissed && (
        <div className="rounded-md border border-success/30 bg-success-weak/40 px-4 py-3 text-sm text-ink-secondary">
          Looks like your workspace already has villas, projects, and a team.
          Step through to confirm, or finish setup.
        </div>
      )}

      <SetupWizard counts={counts} initialStep={progress.currentStep} />
    </div>
  );
}
