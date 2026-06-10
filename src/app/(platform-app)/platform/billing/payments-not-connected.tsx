/**
 * Platform Billing — PSP connection state band.
 *
 * Originally a static "payments not connected" notice. Now that the
 * Xendit rails exist in code (provider adapter + webhook + buyer
 * installment checkout), this band reads REAL state: how many orgs have
 * a configured + ACTIVE payment processor connection (Xendit / Stripe —
 * manual rails don't count, and DryRun providers can never reach
 * "active"). Zero orgs → the honest "not connected" copy; N orgs → an
 * equally honest "configured, billing surfaces still locked" state,
 * because the platform-billing invoice ledger / dunning / refunds
 * consoles are not built yet. Read-only count (super-admin surface),
 * zero interactivity on purpose.
 */

import { CreditCard } from "lucide-react";
import { and, countDistinct, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { paymentProcessorConnections } from "@/lib/db/schema/payment-processors";
import { safeQuery } from "@/lib/development/safe-query";

const LOCKED_CAPABILITIES: Array<{ label: string; detail: string }> = [
  {
    label: "Invoice ledger",
    detail: "Per-org invoices with status, amounts and PSP references",
  },
  {
    label: "Failed-payments triage",
    detail: "Decline reasons, retry history and at-risk MRR queue",
  },
  {
    label: "Refunds & credits",
    detail: "Operator-issued refunds with a full audit trail",
  },
  {
    label: "Dunning",
    detail: "Automated retry / reminder sequences on payment failure",
  },
];

/** Real PSPs only — manual rails are not a payment provider, and Wise /
 *  PayPal route through DryRun so they can never reach "active". */
const REAL_PSP_PROVIDERS = ["xendit", "stripe"] as const;

async function countConfiguredPspOrgs(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const rows = await safeQuery(
    "platform-billing.countConfiguredPspOrgs",
    db
      .select({
        orgs: countDistinct(paymentProcessorConnections.organizationId),
      })
      .from(paymentProcessorConnections)
      .where(
        and(
          eq(paymentProcessorConnections.status, "active"),
          inArray(paymentProcessorConnections.provider, [
            ...REAL_PSP_PROVIDERS,
          ]),
        ),
      ),
    [{ orgs: 0 }],
  );
  return rows[0]?.orgs ?? 0;
}

export async function PaymentsNotConnectedBand() {
  const configuredOrgs = await countConfiguredPspOrgs();
  const connected = configuredOrgs > 0;

  return (
    <section
      aria-label={
        connected ? "Payment provider status" : "Payments not connected"
      }
      className="rounded-3xl border border-dashed border-line-soft bg-muted/30 p-6 md:p-7 flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-soft bg-surface">
          <CreditCard
            className={
              connected ? "h-4 w-4 text-success" : "h-4 w-4 text-ink-tertiary"
            }
            strokeWidth={1.75}
          />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-ink">
            {connected
              ? `Payment provider configured — ${configuredOrgs} ${configuredOrgs === 1 ? "organization" : "organizations"}`
              : "Payments not connected"}
          </h2>
          <p className="text-xs text-ink-secondary leading-relaxed max-w-[72ch]">
            {connected ? (
              <>
                {configuredOrgs === 1
                  ? "1 organization has"
                  : `${configuredOrgs} organizations have`}{" "}
                an active PSP connection (Xendit — QRIS, e-wallets, virtual
                accounts; verified by a live test call). Org-level money now
                moves through those rails, but the platform-billing surfaces
                below are still being built — this console keeps tracking
                subscription billing only: plan assignments, comp grants and
                MRR derived from the plan catalog.
              </>
            ) : (
              <>
                The Xendit integration (QRIS, e-wallets, virtual accounts) is
                live in code, but no organization has configured an active
                provider connection yet — add API keys under Payments →
                Providers to unlock online collection. Until then this console
                tracks subscription billing only: plan assignments, comp
                grants and MRR derived from the plan catalog. Nothing on this
                page represents money actually collected.
              </>
            )}
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {LOCKED_CAPABILITIES.map((cap) => (
          <li
            key={cap.label}
            className="rounded-2xl border border-line-soft bg-surface px-4 py-3 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">
                {cap.label}
              </span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary border border-line-soft rounded-full px-2 py-0.5">
                {connected ? "not built yet" : "locked"}
              </span>
            </div>
            <span className="text-xs text-ink-tertiary leading-relaxed">
              {cap.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
