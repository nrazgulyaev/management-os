import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  directBookingDepositEvents,
  directBookingDeposits,
  paymentProviderAccounts,
  paymentWebhookEvents,
  type DirectBookingDeposit,
  type DirectBookingDepositEvent,
  type PaymentProviderAccount,
  type PaymentWebhookEvent,
} from "@/lib/db/schema/payments";
import { directBookingHolds, directBookingRequests } from "@/lib/db/schema/direct-booking";
import {
  buildDepositCode,
  calculateDepositAmount,
  DEFAULT_DEPOSIT_POLICY,
  type DepositPolicy,
  type DepositStatus,
} from "./deposits-pure";
import { selectPaymentProvider } from "@/features/payments/provider-selector";
import type { ProviderKey } from "@/features/payments/provider-types";

// =============================================================================
// Reads
// =============================================================================

export async function getDepositById(
  id: string,
): Promise<DirectBookingDeposit | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(directBookingDeposits)
    .where(eq(directBookingDeposits.id, id))
    .limit(1);
  return row ?? null;
}

export async function getDepositForRequest(
  requestId: string,
): Promise<DirectBookingDeposit | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(directBookingDeposits)
    .where(eq(directBookingDeposits.requestId, requestId))
    .orderBy(desc(directBookingDeposits.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getDepositForHold(
  holdId: string,
): Promise<DirectBookingDeposit | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(directBookingDeposits)
    .where(eq(directBookingDeposits.holdId, holdId))
    .orderBy(desc(directBookingDeposits.createdAt))
    .limit(1);
  return row ?? null;
}

export interface DepositRow {
  deposit: DirectBookingDeposit;
  requestCode: string | null;
  holdCode: string | null;
}

export async function listDirectBookingDeposits(opts?: {
  status?: DepositStatus;
  limit?: number;
}): Promise<DepositRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters: ReturnType<typeof eq>[] = [];
  if (opts?.status)
    filters.push(eq(directBookingDeposits.status, opts.status));
  const rows = await db
    .select({
      deposit: directBookingDeposits,
      requestCode: directBookingRequests.requestCode,
      holdCode: directBookingHolds.holdCode,
    })
    .from(directBookingDeposits)
    .leftJoin(
      directBookingRequests,
      eq(directBookingRequests.id, directBookingDeposits.requestId),
    )
    .leftJoin(
      directBookingHolds,
      eq(directBookingHolds.id, directBookingDeposits.holdId),
    )
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(directBookingDeposits.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    deposit: r.deposit,
    requestCode: r.requestCode ?? null,
    holdCode: r.holdCode ?? null,
  }));
}

export async function listDepositEvents(
  depositId: string,
  limit = 100,
): Promise<DirectBookingDepositEvent[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(directBookingDepositEvents)
    .where(eq(directBookingDepositEvents.depositId, depositId))
    .orderBy(desc(directBookingDepositEvents.createdAt))
    .limit(limit);
}

export async function listPaymentProviderAccounts(): Promise<
  PaymentProviderAccount[]
> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(paymentProviderAccounts)
    .orderBy(paymentProviderAccounts.providerKey);
}

export async function getActiveProviderAccount(
  providerKey: ProviderKey,
): Promise<PaymentProviderAccount | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(paymentProviderAccounts)
    .where(
      and(
        eq(paymentProviderAccounts.providerKey, providerKey),
        eq(paymentProviderAccounts.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listPaymentWebhookEvents(opts?: {
  limit?: number;
}): Promise<PaymentWebhookEvent[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(paymentWebhookEvents)
    .orderBy(desc(paymentWebhookEvents.createdAt))
    .limit(opts?.limit ?? 200);
}

// =============================================================================
// Writes — small primitives reused by actions + public API
// =============================================================================

export async function appendDepositEvent(args: {
  depositId: string;
  eventType: string;
  actorType: "guest" | "internal" | "system" | "provider";
  actorUserId?: string | null;
  message?: string | null;
  metadataJson?: Record<string, unknown> | null;
  /** Org of the parent deposit; resolved from the deposit row when omitted. */
  organizationId?: string | null;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  // TENANCY-FINANCE-DOCS — child event copies the parent deposit's org.
  let organizationId = args.organizationId ?? null;
  if (!organizationId) {
    const parent = await getDepositById(args.depositId);
    organizationId = parent?.organizationId ?? null;
  }
  await db.insert(directBookingDepositEvents).values({
    organizationId,
    depositId: args.depositId,
    eventType: args.eventType,
    actorType: args.actorType,
    actorUserId: args.actorUserId ?? null,
    message: args.message ?? null,
    metadataJson: args.metadataJson ?? null,
  });
}

export async function patchDepositStatus(
  id: string,
  status: DepositStatus,
  patch?: Partial<DirectBookingDeposit>,
): Promise<DirectBookingDeposit | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .update(directBookingDeposits)
    .set({ status, updatedAt: new Date(), ...(patch ?? {}) })
    .where(eq(directBookingDeposits.id, id))
    .returning();
  return row ?? null;
}

// =============================================================================
// Ensure deposit — called from submit + approve flows
// =============================================================================

export interface EnsureDepositInput {
  holdId: string;
  requestId: string;
  totalMinor: bigint;
  currency: string;
  holdToken?: string;
  policy?: DepositPolicy;
  providerKey?: ProviderKey;
  createdBy?: string | null;
}

export interface EnsureDepositResult {
  deposit: DirectBookingDeposit;
  isNew: boolean;
}

/**
 * Idempotently create a deposit for a (hold, request) pair. If an
 * active deposit already exists, returns it. Otherwise computes the
 * amount, asks the provider for a session, and persists.
 */
export async function ensureDepositForRequest(
  input: EnsureDepositInput,
): Promise<EnsureDepositResult | null> {
  const db = getDb();
  if (!db) return null;
  const existing = await getDepositForRequest(input.requestId);
  if (existing && existing.status !== "cancelled" && existing.status !== "failed") {
    return { deposit: existing, isNew: false };
  }
  const policy = input.policy ?? DEFAULT_DEPOSIT_POLICY;
  const amount = calculateDepositAmount(input.totalMinor, policy);
  const providerKey: ProviderKey = input.providerKey ?? "manual_stub";
  const providerAccount = await getActiveProviderAccount(providerKey);
  const code = await pickUniqueDepositCode(db);

  // TENANCY-FINANCE-DOCS — copy the parent request's org onto the deposit
  // (guest/public flow has no operator session; the request row is the anchor).
  const [parentRequest] = await db
    .select({ organizationId: directBookingRequests.organizationId })
    .from(directBookingRequests)
    .where(eq(directBookingRequests.id, input.requestId))
    .limit(1);
  const organizationId = parentRequest?.organizationId ?? null;

  // Create the deposit row first so the provider has a stable id.
  const [inserted] = await db
    .insert(directBookingDeposits)
    .values({
      organizationId,
      holdId: input.holdId,
      requestId: input.requestId,
      providerAccountId: providerAccount?.id ?? null,
      depositCode: code,
      providerKey,
      amountMinor: amount,
      currency: input.currency,
      status: "pending",
      createdBy: input.createdBy ?? null,
    })
    .returning();
  if (!inserted) return null;

  const provider = selectPaymentProvider(providerKey);
  let session;
  try {
    session = await provider.createSession({
      depositId: inserted.id,
      amountMinor: amount,
      currency: input.currency,
      returnUrl: input.holdToken
        ? `/book/hold/${input.holdToken}/payment`
        : `/book/hold/`,
      metadata: input.holdToken
        ? { holdToken: input.holdToken }
        : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "session_failed";
    await patchDepositStatus(inserted.id, "failed", {
      failedAt: new Date(),
    });
    await appendDepositEvent({
      depositId: inserted.id,
      eventType: "provider_failed",
      actorType: "system",
      message,
    });
    return null;
  }

  const updated = await patchDepositStatus(inserted.id, "pending", {
    providerSessionId: session.sessionId,
    paymentUrl: session.paymentUrl,
    expiresAt: session.expiresAt,
  });
  await appendDepositEvent({
    depositId: inserted.id,
    eventType: "session_created",
    actorType: "system",
    message: "Provider session created",
    metadataJson: {
      providerKey,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt?.toISOString() ?? null,
    },
  });
  return { deposit: updated ?? inserted, isNew: true };
}

async function pickUniqueDepositCode(
  db: NonNullable<ReturnType<typeof getDb>>,
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 10; i++) {
    const [{ count = 0 } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(directBookingDeposits)
      .where(
        sql`${directBookingDeposits.depositCode} LIKE ${"DEP-" + today.replaceAll("-", "") + "-%"}`,
      );
    const candidate = buildDepositCode(today, count + 1 + i);
    const [existing] = await db
      .select({ id: directBookingDeposits.id })
      .from(directBookingDeposits)
      .where(eq(directBookingDeposits.depositCode, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return `DEP-${today.replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
}

// =============================================================================
// Hub metrics
// =============================================================================

export interface DepositMetrics {
  pending: number;
  paid: number;
  manuallyMarkedPaid: number;
  failed: number;
  totalCollectedMinor: bigint;
  currency: string | null;
}

export async function getDepositMetrics(): Promise<DepositMetrics> {
  const db = getDb();
  if (!db) {
    return {
      pending: 0,
      paid: 0,
      manuallyMarkedPaid: 0,
      failed: 0,
      totalCollectedMinor: 0n,
      currency: null,
    };
  }
  // Stage 9.I — was 2 queries with the second one fetching every "paid"
  // / "manually_marked_paid" row to sum amounts in JS. The aggregate
  // belongs in SQL: SUM is a single scalar, no rows over the wire.
  // Both queries collapse into one with FILTER clauses.
  const [agg] = await db
    .select({
      pending: sql<number>`COUNT(*) FILTER (WHERE ${directBookingDeposits.status} IN ('pending','draft','requires_action'))::int`,
      paid: sql<number>`COUNT(*) FILTER (WHERE ${directBookingDeposits.status} = 'paid')::int`,
      manuallyMarkedPaid: sql<number>`COUNT(*) FILTER (WHERE ${directBookingDeposits.status} = 'manually_marked_paid')::int`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${directBookingDeposits.status} IN ('failed','expired'))::int`,
      totalMinor: sql<string | null>`SUM(${directBookingDeposits.amountMinor}) FILTER (WHERE ${directBookingDeposits.status} IN ('paid','manually_marked_paid'))::text`,
      currency: sql<string | null>`MIN(${directBookingDeposits.currency}) FILTER (WHERE ${directBookingDeposits.status} IN ('paid','manually_marked_paid'))`,
    })
    .from(directBookingDeposits);

  const total = agg?.totalMinor ? BigInt(agg.totalMinor) : 0n;
  return {
    pending: agg?.pending ?? 0,
    paid: agg?.paid ?? 0,
    manuallyMarkedPaid: agg?.manuallyMarkedPaid ?? 0,
    failed: agg?.failed ?? 0,
    totalCollectedMinor: total,
    currency: agg?.currency ?? null,
  };
}
