"use server";

/**
 * Buyer "Pay online" — Xendit checkout for a contract installment.
 *
 * Flow: buyer clicks "Pay online" on /buyer-portal/payments → this action
 * re-validates ownership (the same session → assignment → contract-group →
 * milestone chain the manual mark-paid uses), finds the org's ACTIVE Xendit
 * connection, creates a Xendit Invoice (hosted checkout covering QRIS /
 * e-wallets / Virtual Accounts / cards in one URL), persists a
 * `payment_intents` row (external id + checkout URL + milestone link), and
 * returns the checkout URL for redirect. The Xendit webhook
 * (/api/webhooks/xendit) later settles the milestone through the SAME
 * settlement core the manual flow uses.
 *
 * Currency: milestones are USD-denominated but Xendit's Indonesia-local
 * channels (QRIS / e-wallets / VA) only run in IDR, so the invoice is
 * issued in IDR using the milestone's contract-fixed IDR amount
 * (expected_amount_idr_minor), scaled proportionally when part of the
 * milestone was already paid. Settlement records the full remaining USD
 * balance — exactly what manual mark-paid records.
 *
 * When the org has NO active Xendit connection this action refuses with an
 * honest error (the UI doesn't render the button in that case) — the manual
 * flow stays the only path, untouched.
 */

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyers, buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { contractGroups, contractMilestones } from "@/lib/db/schema/sales";
import {
  paymentIntents,
  paymentProcessorConnections,
} from "@/lib/db/schema/payment-processors";
import { recordAuditEvent } from "@/features/audit/services";
import { openCredentials } from "@/lib/secure-connection-credentials";
import { selectPaymentProvider } from "@/lib/payment-processors/select-provider";
import type { PaymentCredentials } from "@/lib/payment-processors/types";

const checkoutSchema = z.object({ milestoneId: z.string().uuid() });

const PAYABLE_STATUSES = new Set([
  "pending",
  "pre_invoiced",
  "invoiced",
  "partially_paid",
  "overdue",
]);

const OPEN_LIFECYCLES = ["created", "processing", "requires_action"] as const;

export type StartCheckoutResult =
  | { ok: true; checkoutUrl: string; resumed: boolean }
  | { ok: false; error: string };

export async function startBuyerInstallmentCheckout(input: {
  milestoneId: string;
}): Promise<StartCheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "Not authenticated." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // Ownership chain — identical to the manual mark-paid gate.
  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, session.buyerId));
  const unitIds = assignments.map((a) => a.unitId);
  if (unitIds.length === 0) return { ok: false, error: "No villas assigned." };

  const groups = await db
    .select({ id: contractGroups.id })
    .from(contractGroups)
    .where(inArray(contractGroups.villaId, unitIds));
  const groupIds = groups.map((g) => g.id);
  if (groupIds.length === 0) {
    return { ok: false, error: "No contract found for your villas." };
  }

  const [milestone] = await db
    .select()
    .from(contractMilestones)
    .where(
      and(
        eq(contractMilestones.id, parsed.data.milestoneId),
        inArray(contractMilestones.contractGroupId, groupIds),
      ),
    )
    .limit(1);
  if (!milestone) return { ok: false, error: "Installment not found." };
  if (!PAYABLE_STATUSES.has(milestone.status)) {
    return { ok: false, error: "This installment cannot be paid online." };
  }

  const remainingUsdMinor =
    milestone.expectedAmountUsdMinor - milestone.paidAmountUsdMinor;
  if (remainingUsdMinor <= 0n) {
    return { ok: false, error: "Nothing left to pay on this installment." };
  }

  // The org's ACTIVE Xendit connection. "active" is only set by a passed
  // real test-connection — a saved-but-untested connection does not unlock
  // online payment.
  const [connection] = await db
    .select()
    .from(paymentProcessorConnections)
    .where(
      and(
        eq(
          paymentProcessorConnections.organizationId,
          milestone.organizationId,
        ),
        eq(paymentProcessorConnections.provider, "xendit"),
        eq(paymentProcessorConnections.status, "active"),
      ),
    )
    .limit(1);
  if (!connection) {
    return {
      ok: false,
      error:
        "Online payment is not configured for this project yet. Please transfer manually and confirm with “Mark as paid”.",
    };
  }

  // Resume an open checkout for this milestone if one exists and its
  // invoice has not expired — avoids stacking duplicate Xendit invoices.
  const openIntents = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.linkedContractMilestoneId, milestone.id),
        eq(paymentIntents.processorConnectionId, connection.id),
        inArray(paymentIntents.lifecycleState, [...OPEN_LIFECYCLES]),
      ),
    )
    .limit(5);
  for (const intent of openIntents) {
    const raw = (intent.rawPayload ?? {}) as Record<string, unknown>;
    const url = typeof raw["invoice_url"] === "string" ? raw["invoice_url"] : null;
    const expiry =
      typeof raw["expiry_date"] === "string"
        ? Date.parse(raw["expiry_date"])
        : NaN;
    if (url && Number.isFinite(expiry) && expiry > Date.now()) {
      return { ok: true, checkoutUrl: url, resumed: true };
    }
  }

  const credentials = openCredentials<PaymentCredentials>(
    connection.credentials,
  );
  if (!credentials || credentials.provider !== "xendit") {
    return { ok: false, error: "Payment provider credentials are missing." };
  }
  const provider = selectPaymentProvider("xendit", credentials);

  // IDR amount: contract-fixed expected_amount_idr_minor, scaled by the
  // unpaid USD proportion (bigint math; rounds down a sen at most).
  const idrAmountMinor =
    milestone.expectedAmountUsdMinor > 0n
      ? (milestone.expectedAmountIdrMinor * remainingUsdMinor) /
        milestone.expectedAmountUsdMinor
      : 0n;
  if (idrAmountMinor <= 0n) {
    return { ok: false, error: "Could not determine the IDR amount." };
  }

  const [buyerRow] = await db
    .select({ primaryEmail: buyers.primaryEmail })
    .from(buyers)
    .where(eq(buyers.id, session.buyerId))
    .limit(1);

  const origin = await requestOrigin();
  const externalRef = `apsi_${randomUUID()}`;

  let created;
  try {
    created = await provider.createPaymentIntent({
      amountMinor: idrAmountMinor,
      currency: "IDR",
      purpose: "buyer_installment",
      customerEmail: buyerRow?.primaryEmail ?? undefined,
      customerName: session.displayName,
      description: `Installment ${String(milestone.sequence).padStart(2, "0")} — ${milestone.name}`,
      metadata: {
        externalRef,
        milestoneId: milestone.id,
        buyerId: session.buyerId,
        buyerCode: session.buyerCode,
      },
      successUrl: `${origin}/buyer-portal/payments?checkout=success`,
      cancelUrl: `${origin}/buyer-portal/payments?checkout=cancelled`,
      linkedBuyerId: session.buyerId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordAuditEvent({
      actorUserId: null,
      action: "payments.checkout.create_failed",
      entityType: "contract_milestone",
      entityId: milestone.id,
      after: { provider: "xendit", error: msg },
      metadata: { buyerId: session.buyerId, channel: "buyer_portal" },
    });
    return {
      ok: false,
      error:
        "The payment provider rejected the request. Please try again or pay manually.",
    };
  }

  if (!created.paymentUrl) {
    return {
      ok: false,
      error: "The payment provider did not return a checkout link.",
    };
  }

  const [intentRow] = await db
    .insert(paymentIntents)
    .values({
      organizationId: milestone.organizationId,
      processorConnectionId: connection.id,
      externalIntentId: created.externalIntentId,
      externalStatus: created.status,
      amountMinor: created.amountMinor,
      currency: created.currency,
      purpose: "buyer_installment",
      linkedBuyerId: session.buyerId,
      linkedContractMilestoneId: milestone.id,
      customerEmail: buyerRow?.primaryEmail ?? null,
      customerName: session.displayName,
      lifecycleState: "created",
      rawPayload: created.rawPayload as never,
    })
    .returning({ id: paymentIntents.id });

  await recordAuditEvent({
    actorUserId: null,
    action: "payments.checkout.created",
    entityType: "payment_intent",
    entityId: intentRow.id,
    after: {
      provider: "xendit",
      externalIntentId: created.externalIntentId,
      amountMinor: created.amountMinor.toString(),
      currency: created.currency,
      milestoneId: milestone.id,
    },
    metadata: {
      buyerId: session.buyerId,
      buyerCode: session.buyerCode,
      channel: "buyer_portal",
    },
  });

  return { ok: true, checkoutUrl: created.paymentUrl, resumed: false };
}

/** Origin of the current request (proxy-aware) for redirect URLs. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "arconique.com";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}
