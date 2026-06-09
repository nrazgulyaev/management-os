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
  recordPortalInviteAction,
  recordInsightDecisionAction,
} from "@/features/owners/actions";

export interface OwnerActionContext {
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  /** Display-only current commission %, derived from the lead share. */
  commissionPct: number;
  canManage: boolean;
}

export function OwnerHeaderActions({ ctx }: { ctx: OwnerActionContext }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

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
        onClick={() => setInviteOpen(true)}
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
      <InvitePortalModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        ownerName={ctx.ownerName}
        ownerEmail={ctx.ownerEmail ?? ""}
        onConfirm={(note) =>
          new Promise<void>((resolve) => {
            startTransition(async () => {
              await recordPortalInviteAction({ ownerId: ctx.ownerId, note });
              router.refresh();
              resolve();
            });
          })
        }
      />
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
