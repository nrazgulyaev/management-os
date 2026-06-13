"use server";

/**
 * Stage 7.F.B.3 — Banking connection CRUD actions.
 *
 * Per the Stage 7.F constraints: NO new providers, NO new schema,
 * NO new migrations. The `bank_connections` table + the 5 supported
 * providers (Revolut / Wise / Mandiri / BCA / manual) all ship from
 * Stage 6.P3. This module plumbs them into the operator UI.
 *
 * Same encryption-at-rest situation as marketing — `service.ts` reads
 * the JSONB blob directly via `(conn.credentials as BankCredentials)`.
 * Stored plaintext to match the existing read path; encryption-at-rest
 * is a coordinated cross-cutting follow-up.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  bankConnections,
  type BankProviderName,
} from "@/lib/db/schema/banking";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { selectBankProvider } from "./select-provider";
import {
  sealCredentials,
  openCredentials,
} from "@/lib/secure-connection-credentials";
import type { BankCredentials } from "./types";

// ---------------------------------------------------------------------------
// Schemas — discriminated by provider field
// ---------------------------------------------------------------------------

const revolutSchema = z.object({
  provider: z.literal("revolut"),
  apiKey: z.string().min(8),
  environment: z.enum(["sandbox", "production"]),
  webhookSecret: z.string().min(8).optional().or(z.literal("")),
  accountName: z.string().min(2).max(120),
  externalAccountId: z.string().min(2).max(120),
  currency: z.string().length(3).toUpperCase(),
});

const wiseSchema = z.object({
  provider: z.literal("wise"),
  apiToken: z.string().min(8),
  profileId: z.string().min(2),
  environment: z.enum(["sandbox", "production"]),
  webhookPublicKey: z.string().optional().or(z.literal("")),
  accountName: z.string().min(2).max(120),
  externalAccountId: z.string().min(2).max(120),
  currency: z.string().length(3).toUpperCase(),
});

const mandiriSchema = z.object({
  provider: z.literal("mandiri"),
  accountNumber: z.string().min(4).max(40),
  partnerApiToken: z.string().min(8).optional().or(z.literal("")),
  accountName: z.string().min(2).max(120),
  currency: z.string().length(3).toUpperCase().default("IDR"),
});

const bcaSchema = z.object({
  provider: z.literal("bca"),
  accountNumber: z.string().min(4).max(40),
  partnerApiToken: z.string().min(8).optional().or(z.literal("")),
  accountName: z.string().min(2).max(120),
  currency: z.string().length(3).toUpperCase().default("IDR"),
});

const manualSchema = z.object({
  provider: z.literal("manual"),
  label: z.string().min(2).max(120),
  accountName: z.string().min(2).max(120),
  externalAccountId: z.string().min(2).max(120),
  currency: z.string().length(3).toUpperCase(),
});

const createConnectionSchema = z.discriminatedUnion("provider", [
  revolutSchema,
  wiseSchema,
  mandiriSchema,
  bcaSchema,
  manualSchema,
]);

export type CreateBankConnectionInput = z.infer<typeof createConnectionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function externalAccountIdFor(input: CreateBankConnectionInput): string {
  switch (input.provider) {
    case "revolut":
    case "wise":
    case "manual":
      return input.externalAccountId;
    case "mandiri":
    case "bca":
      return input.accountNumber;
  }
}

function toCredentials(input: CreateBankConnectionInput): BankCredentials {
  switch (input.provider) {
    case "revolut":
      return {
        provider: "revolut",
        apiKey: input.apiKey,
        environment: input.environment,
        webhookSecret:
          input.webhookSecret && input.webhookSecret !== ""
            ? input.webhookSecret
            : undefined,
      };
    case "wise":
      return {
        provider: "wise",
        apiToken: input.apiToken,
        profileId: input.profileId,
        environment: input.environment,
        webhookPublicKey:
          input.webhookPublicKey && input.webhookPublicKey !== ""
            ? input.webhookPublicKey
            : undefined,
      };
    case "mandiri":
      return {
        provider: "mandiri",
        accountNumber: input.accountNumber,
        partnerApiToken:
          input.partnerApiToken && input.partnerApiToken !== ""
            ? input.partnerApiToken
            : undefined,
      };
    case "bca":
      return {
        provider: "bca",
        accountNumber: input.accountNumber,
        partnerApiToken:
          input.partnerApiToken && input.partnerApiToken !== ""
            ? input.partnerApiToken
            : undefined,
      };
    case "manual":
      return { provider: "manual", label: input.label };
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createBankConnectionAction(input: {
  organizationId: string;
  data: CreateBankConnectionInput;
}): Promise<{ ok: true; connectionId: string } | { ok: false; error: string }> {
  await requirePermission("banking.write");
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
    .select({ id: bankConnections.id })
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.organizationId, input.organizationId),
        eq(bankConnections.provider, parsed.data.provider),
        eq(bankConnections.externalAccountId, externalAccountId),
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
    .insert(bankConnections)
    .values({
      organizationId: input.organizationId,
      provider: parsed.data.provider,
      externalAccountId,
      accountName: parsed.data.accountName,
      currency:
        "currency" in parsed.data ? parsed.data.currency : "IDR",
      // Encrypted at rest (AES-256-GCM via STAY_LINK_KMS_SECRET). Read
      // back through openCredentials() which also handles legacy rows.
      credentials: sealCredentials(credentials) as never,
      status: "pending",
      connectedBy: me?.id ?? null,
      connectedAt: new Date(),
    })
    .returning({ id: bankConnections.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "banking.connection.create",
    entityType: "bank_connection",
    entityId: row.id,
    after: {
      provider: parsed.data.provider,
      externalAccountId,
    },
  });

  revalidatePath("/development-os/banking");
  return { ok: true, connectionId: row.id };
}

export async function testBankConnectionAction(args: {
  connectionId: string;
}): Promise<
  | {
      ok: true;
      connected: boolean;
      mode?: "live" | "dry_run";
      details?: Record<string, unknown>;
    }
  | { ok: false; error: string }
> {
  await requirePermission("banking.read");
  const orgId = await requireOrgId();
  const db = requireDb();
  const me = await getCurrentAppUser();

  const [row] = await db
    .select()
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.id, args.connectionId),
        eq(bankConnections.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: "Connection not found." };

  const credentials = openCredentials<BankCredentials>(row.credentials);
  const provider = selectBankProvider(
    row.provider as BankProviderName,
    credentials,
  );

  let result;
  try {
    result = await provider.testConnection();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(bankConnections)
      .set({
        status: "error",
        lastSyncStatus: "error",
        lastSyncError: msg,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bankConnections.id, args.connectionId),
          eq(bankConnections.organizationId, orgId),
        ),
      );
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "banking.connection.test_failed",
      entityType: "bank_connection",
      entityId: args.connectionId,
      after: { error: msg },
    });
    revalidatePath(`/development-os/banking/${args.connectionId}`);
    return { ok: false, error: msg };
  }

  // A dry-run provider (Plaid/manual today) is not a live feed — record
  // it as "dry_run", never "active".
  const isDryRun = result.mode === "dry_run";
  const nextStatus = isDryRun
    ? "dry_run"
    : result.connected
      ? "active"
      : "error";

  await db
    .update(bankConnections)
    .set({
      status: nextStatus,
      lastSyncStatus: result.connected ? "success" : isDryRun ? "idle" : "error",
      lastSyncError: result.connected
        ? null
        : isDryRun
          ? "dry-run — no live bank API configured"
          : "testConnection returned false",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bankConnections.id, args.connectionId),
        eq(bankConnections.organizationId, orgId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "banking.connection.test",
    entityType: "bank_connection",
    entityId: args.connectionId,
    after: {
      connected: result.connected,
      mode: result.mode ?? "live",
      details: result.details,
    },
  });

  revalidatePath(`/development-os/banking/${args.connectionId}`);
  return {
    ok: true,
    connected: result.connected,
    mode: result.mode,
    details: result.details ?? undefined,
  };
}

export async function disconnectBankConnectionAction(args: {
  connectionId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("banking.write");
  const orgId = await requireOrgId();
  const db = requireDb();
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.id, args.connectionId),
        eq(bankConnections.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Connection not found." };
  if (before.status === "archived") {
    return { ok: false, error: "Already archived." };
  }

  await db
    .update(bankConnections)
    .set({
      status: "archived",
      archivedAt: new Date(),
      archiveReason: args.reason ?? "operator-initiated",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bankConnections.id, args.connectionId),
        eq(bankConnections.organizationId, orgId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "banking.connection.disconnect",
    entityType: "bank_connection",
    entityId: args.connectionId,
    before: { status: before.status },
    after: { status: "archived", reason: args.reason ?? null },
  });

  revalidatePath("/development-os/banking");
  return { ok: true };
}

export async function syncBankConnectionNowAction(args: {
  connectionId: string;
}): Promise<
  | { ok: true; transactionsPulled: number }
  | { ok: false; error: string }
> {
  await requirePermission("banking.write");
  const me = await getCurrentAppUser();
  try {
    const { syncTransactionsForConnection } = await import("./service");
    const result = await syncTransactionsForConnection(args.connectionId);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "sync failed",
      };
    }
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "banking.connection.manual_sync",
      entityType: "bank_connection",
      entityId: args.connectionId,
      after: {
        inserted: result.inserted,
        duplicates: result.duplicates,
        failed: result.failed,
      },
    });
    revalidatePath(`/development-os/banking/${args.connectionId}`);
    return {
      ok: true,
      transactionsPulled: result.inserted,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
