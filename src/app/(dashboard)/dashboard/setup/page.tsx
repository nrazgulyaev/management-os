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
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
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
        <PageHeader title="Set up your workspace" />
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
        <PageHeader
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Setup" }]}
          title="Set up your workspace"
        />
        <EmptyState
          title="Admin access required"
          description="Only an organisation admin can run first-run setup. Ask an admin to invite you or to complete onboarding."
          action={
            <Button asChild variant="secondary">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
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
      <PageHeader
        eyebrow="Getting started"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Setup" }]}
        title="Set up your workspace"
        description="A guided, three-step start. Add villas, group them into projects, and invite your team — resume any time."
      />

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
