"use server";

/**
 * Stage 7.F.C.1 — Payment processor connection CRUD actions.
 *
 * Same shape as banking + marketing. Stripe is the only provider that
 * actually fires real API calls today (see Stage 6.P3); Wise Payments,
 * PayPal, and Manual all default to DryRun.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  paymentProcessorConnections,
  type PaymentProviderName,
} from "@/lib/db/schema/payment-processors";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { selectPaymentProvider } from "./select-provider";
import type { PaymentCredentials } from "./types";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const stripeSchema = z.object({
  provider: z.literal("stripe"),
  secretKey: z.string().regex(/^sk_(test|live)_/, "Stripe secret key starts with sk_test_ or sk_live_"),
  publishableKey: z
    .string()
    .regex(/^pk_(test|live)_/, "Publishable key starts with pk_test_ or pk_live_"),
  webhookSecret: z.string().regex(/^whsec_/, "Webhook secret starts with whsec_"),
  accountId: z.string().regex(/^acct_/).optional().or(z.literal("")),
  accountName: z.string().min(2).max(120),
  mode: z.enum(["test", "live"]),
});

const wisePaymentsSchema = z.object({
  provider: z.literal("wise_payments"),
  apiToken: z.string().min(8),
  profileId: z.string().min(2),
  webhookPublicKey: z.string().optional().or(z.literal("")),
  accountName: z.string().min(2).max(120),
  mode: z.enum(["test", "live"]),
});

const paypalSchema = z.object({
  provider: z.literal("paypal"),
  clientId: z.string().min(8),
  clientSecret: z.string().min(8),
  webhookId: z.string().optional().or(z.literal("")),
  accountName: z.string().min(2).max(120),
  mode: z.enum(["test", "live"]),
});

const manualPaymentSchema = z.object({
  provider: z.literal("manual"),
  label: z.string().min(2).max(120),
  accountName: z.string().min(2).max(120),
  mode: z.enum(["test", "live"]).default("live"),
});

const createConnectionSchema = z.discriminatedUnion("provider", [
  stripeSchema,
  wisePaymentsSchema,
  paypalSchema,
  manualPaymentSchema,
]);

export type CreatePaymentConnectionInput = z.infer<typeof createConnectionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function externalAccountIdFor(input: CreatePaymentConnectionInput): string {
  switch (input.provider) {
    case "stripe":
      // Use accountId if provided (Stripe Connect), else publishableKey suffix.
      return input.accountId && input.accountId !== ""
        ? input.accountId
        : input.publishableKey.replace(/^pk_(test|live)_/, "");
    case "wise_payments":
      return input.profileId;
    case "paypal":
      return input.clientId.slice(0, 24);
    case "manual":
      return `manual-${input.label.toLowerCase().replace(/\s+/g, "-")}`;
  }
}

function toCredentials(input: CreatePaymentConnectionInput): PaymentCredentials {
  switch (input.provider) {
    case "stripe":
      return {
        provider: "stripe",
        secretKey: input.secretKey,
        publishableKey: input.publishableKey,
        webhookSecret: input.webhookSecret,
        accountId:
          input.accountId && input.accountId !== "" ? input.accountId : undefined,
        mode: input.mode,
      };
    case "wise_payments":
      return {
        provider: "wise_payments",
        apiToken: input.apiToken,
        profileId: input.profileId,
        webhookPublicKey:
          input.webhookPublicKey && input.webhookPublicKey !== ""
            ? input.webhookPublicKey
            : undefined,
        mode: input.mode,
      };
    case "paypal":
      return {
        provider: "paypal",
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        webhookId:
          input.webhookId && input.webhookId !== "" ? input.webhookId : undefined,
        mode: input.mode,
      };
    case "manual":
      return { provider: "manual", label: input.label, mode: input.mode };
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createPaymentConnectionAction(input: {
  organizationId: string;
  data: CreatePaymentConnectionInput;
}): Promise<{ ok: true; connectionId: string } | { ok: false; error: string }> {
  await requirePermission("payments.write");
  const parsed = createConnectionSchema.safeParse(input.data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid form input",
    };
  }
  const db = requireDb();
  const me = await getCurrentAppUser();

  const credentials = toCredentials(parsed.data);
  const externalAccountId = externalAccountIdFor(parsed.data);

  const [existing] = await db
    .select({ id: paymentProcessorConnections.id })
    .from(paymentProcessorConnections)
    .where(
      and(
        eq(paymentProcessorConnections.organizationId, input.organizationId),
        eq(paymentProcessorConnections.provider, parsed.data.provider),
        eq(paymentProcessorConnections.externalAccountId, externalAccountId),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ok: false,
      error: `A ${parsed.data.provider} connection for ${externalAccountId} already exists.`,
    };
  }

  const [row] = await db
    .insert(paymentProcessorConnections)
    .values({
      organizationId: input.organizationId,
      provider: parsed.data.provider,
      externalAccountId,
      accountName: parsed.data.accountName,
      mode: parsed.data.mode,
      // Plaintext to match service.ts read path. Encryption-at-rest is
      // a coordinated cross-cutting follow-up.
      credentials: credentials as never,
      status: "pending",
      connectedBy: me?.id ?? null,
      connectedAt: new Date(),
    })
    .returning({ id: paymentProcessorConnections.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "payments.connection.create",
    entityType: "payment_processor_connection",
    entityId: row.id,
    after: {
      provider: parsed.data.provider,
      externalAccountId,
      mode: parsed.data.mode,
    },
  });

  revalidatePath("/dashboard/payments/providers");
  return { ok: true, connectionId: row.id };
}

export async function testPaymentConnectionAction(args: {
  connectionId: string;
}): Promise<
  | { ok: true; connected: boolean; details?: Record<string, unknown> }
  | { ok: false; error: string }
> {
  await requirePermission("payments.read");
  const db = requireDb();
  const me = await getCurrentAppUser();

  const [row] = await db
    .select()
    .from(paymentProcessorConnections)
    .where(eq(paymentProcessorConnections.id, args.connectionId))
    .limit(1);
  if (!row) return { ok: false, error: "Connection not found." };

  const credentials = (row.credentials as PaymentCredentials | null) ?? null;
  const provider = selectPaymentProvider(
    row.provider as PaymentProviderName,
    credentials,
  );

  let result;
  try {
    result = await provider.testConnection();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(paymentProcessorConnections)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(paymentProcessorConnections.id, args.connectionId));
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "payments.connection.test_failed",
      entityType: "payment_processor_connection",
      entityId: args.connectionId,
      after: { error: msg },
    });
    revalidatePath(`/dashboard/payments/providers/${args.connectionId}`);
    return { ok: false, error: msg };
  }

  await db
    .update(paymentProcessorConnections)
    .set({
      status: result.connected ? "active" : "error",
      updatedAt: new Date(),
    })
    .where(eq(paymentProcessorConnections.id, args.connectionId));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "payments.connection.test",
    entityType: "payment_processor_connection",
    entityId: args.connectionId,
    after: { connected: result.connected, details: result.details },
  });

  revalidatePath(`/dashboard/payments/providers/${args.connectionId}`);
  return {
    ok: true,
    connected: result.connected,
    details: result.details ?? undefined,
  };
}

export async function disconnectPaymentConnectionAction(args: {
  connectionId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("payments.write");
  const db = requireDb();
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(paymentProcessorConnections)
    .where(eq(paymentProcessorConnections.id, args.connectionId))
    .limit(1);
  if (!before) return { ok: false, error: "Connection not found." };
  if (before.status === "archived") {
    return { ok: false, error: "Already archived." };
  }

  await db
    .update(paymentProcessorConnections)
    .set({
      status: "archived",
      archivedAt: new Date(),
      archiveReason: args.reason ?? "operator-initiated",
      updatedAt: new Date(),
    })
    .where(eq(paymentProcessorConnections.id, args.connectionId));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "payments.connection.disconnect",
    entityType: "payment_processor_connection",
    entityId: args.connectionId,
    before: { status: before.status },
    after: { status: "archived", reason: args.reason ?? null },
  });

  revalidatePath("/dashboard/payments/providers");
  return { ok: true };
}
