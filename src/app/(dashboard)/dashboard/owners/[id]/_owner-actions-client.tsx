"use client";

/**
 * mgmt-03 — Owner-detail interactive surface.
 *
 * Owns the three director actions that the mgmt-03 cabinet vocabulary
 * ships as modal shells:
 *   - Edit commission  (header action → EditCommissionModal)
 *   - Invite to portal (header action → InvitePortalModal)
 *   - The rich AI InsightCard with Schedule-call / Dismiss CTAs that
 *     replaces the bare RiskPill on the overview tab.
 *
 * All three resolve through audit-only server actions (commission /
 * portal magic-link / insight model persistence land in the 2.2 data
 * PR). Buttons gate on `canManage` so non-Directors only ever read.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PencilLine, Mail } from "lucide-react";
import { InsightCard, type OwnerInsight } from "@/components/owners/insight-card";
import { EditCommissionModal } from "@/components/owners/edit-commission-modal";
import { InvitePortalModal } from "@/components/owners/invite-portal-modal";
import { DismissInsightModal } from "@/components/owners/dismiss-insight-modal";
import {
  recordCommissionChangeAction,
  recordInsightDecisionAction,
} from "@/features/owners/actions";
import { inviteOwnerToPortalAction } from "@/features/team/actions";

export interface OwnerActionContext {
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  /** Display-only current commission %, derived from the lead share. */
  commissionPct: number;
  canManage: boolean;
}

type InviteOutcome =
  | { kind: "sent"; email: string }
  | { kind: "dry_run"; email: string; acceptUrl: string }
  | { kind: "error"; message: string };

export function OwnerHeaderActions({ ctx }: { ctx: OwnerActionContext }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [inviteOutcome, setInviteOutcome] = React.useState<InviteOutcome | null>(
    null,
  );

  if (!ctx.canManage) return null;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setEditOpen(true)}
        disabled={pending}
      >
        <PencilLine className="w-3.5 h-3.5" strokeWidth={1.75} />
        Edit commission
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setInviteOutcome(null);
          setInviteOpen(true);
        }}
        disabled={pending || !ctx.ownerEmail}
        title={ctx.ownerEmail ? undefined : "Add an email before inviting to the portal"}
      >
        <Mail className="w-3.5 h-3.5" strokeWidth={1.75} />
        Invite to portal
      </Button>

      <EditCommissionModal
        open={editOpen}
        onOpenChange={setEditOpen}
        owner={{ id: ctx.ownerId, name: ctx.ownerName, commissionPct: ctx.commissionPct }}
        onSubmit={(values) =>
          new Promise<void>((resolve) => {
            startTransition(async () => {
              await recordCommissionChangeAction({
                ownerId: values.ownerId,
                commissionPct: values.commissionPct,
                effectiveDate: values.effectiveDate,
                reason: values.reason,
              });
              router.refresh();
              resolve();
            });
          })
        }
      />
      {/* DOMAIN 2 — real owner-portal invitation (replaces the audit-only
          stub). Creates a team_invitation for the owner email + returns the
          accept link. On accept the app_user is provisioned as investor_owner
          + an app_users_owners grant is created. */}
      <InvitePortalModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        ownerName={ctx.ownerName}
        ownerEmail={ctx.ownerEmail ?? ""}
        onConfirm={(note) =>
          new Promise<void>((resolve) => {
            startTransition(async () => {
              const r = await inviteOwnerToPortalAction({
                ownerId: ctx.ownerId,
                note: note || undefined,
              });
              if (!r.ok) {
                setInviteOutcome({ kind: "error", message: r.error });
              } else if (r.emailDelivered) {
                setInviteOutcome({ kind: "sent", email: r.email });
              } else {
                setInviteOutcome({
                  kind: "dry_run",
                  email: r.email,
                  acceptUrl: r.acceptUrl,
                });
              }
              router.refresh();
              resolve();
            });
          })
        }
      />

      {inviteOutcome && (
        <div
          role="status"
          style={{
            flexBasis: "100%",
            marginTop: 8,
            fontSize: 12,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--line-soft)",
            background: "var(--surface)",
            color:
              inviteOutcome.kind === "error" ? "var(--danger)" : "var(--ink-2)",
          }}
        >
          {inviteOutcome.kind === "error" && <span>{inviteOutcome.message}</span>}
          {inviteOutcome.kind === "sent" && (
            <span>Invitation sent to {inviteOutcome.email}.</span>
          )}
          {inviteOutcome.kind === "dry_run" && (
            <>
              <div>
                Invite created for {inviteOutcome.email} — email not sent
                (dry-run). Share this link:
              </div>
              <code
                className="mono"
                style={{ fontSize: 11, wordBreak: "break-all", color: "var(--ink-2)" }}
              >
                {inviteOutcome.acceptUrl}
              </code>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function OwnerInsightPanel({
  ownerId,
  insight,
  canManage,
}: {
  ownerId: string;
  insight: OwnerInsight;
  canManage: boolean;
}) {
  const router = useRouter();
  const [dismissOpen, setDismissOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();

  return (
    <>
      <InsightCard
        insight={insight}
        onSchedule={
          canManage
            ? () =>
                startTransition(async () => {
                  await recordInsightDecisionAction({
                    ownerId,
                    insightId: insight.id,
                    decision: "schedule_call",
                    reason: "",
                    note: "",
                  });
                  router.refresh();
                })
            : undefined
        }
        onDismiss={canManage ? () => setDismissOpen(true) : undefined}
      />
      <DismissInsightModal
        open={dismissOpen}
        onOpenChange={setDismissOpen}
        insight={{ id: insight.id, kind: insight.kind }}
        onConfirm={(values) =>
          new Promise<void>((resolve) => {
            startTransition(async () => {
              await recordInsightDecisionAction({
                ownerId,
                insightId: values.insightId,
                decision: "dismiss",
                reason: values.reason,
                note: values.freeText,
              });
              router.refresh();
              resolve();
            });
          })
        }
      />
    </>
  );
}
