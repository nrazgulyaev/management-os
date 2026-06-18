import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyers } from "@/lib/db/schema/buyers";

/**
 * Buyer-portal KYC read.
 *
 * The DB connection runs NO row-level security (src/lib/db/client.ts is a plain
 * postgres-js client), so every buyer read MUST filter explicitly by the
 * authenticated buyer id resolved server-side from the session. We only ever
 * read the SESSION buyer's own row here — never a client-supplied id.
 */

export type BuyerKycStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "verified"
  | "rejected"
  | "expired";

export interface BuyerKycState {
  status: BuyerKycStatus;
  completedAt: Date | null;
  /** Buyer can move not_started / in_progress → submitted from the portal. */
  canSubmit: boolean;
}

const SUBMITTABLE: ReadonlySet<string> = new Set(["not_started", "in_progress"]);

function normalizeStatus(raw: string): BuyerKycStatus {
  switch (raw) {
    case "not_started":
    case "in_progress":
    case "submitted":
    case "verified":
    case "rejected":
    case "expired":
      return raw;
    default:
      return "not_started";
  }
}

/** The SESSION buyer's own KYC state. Returns null only when DB is unavailable. */
export async function getBuyerKyc(buyerId: string): Promise<BuyerKycState | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      kycStatus: buyers.kycStatus,
      kycCompletedAt: buyers.kycCompletedAt,
    })
    .from(buyers)
    .where(eq(buyers.id, buyerId))
    .limit(1);
  if (!row) return null;
  const status = normalizeStatus(row.kycStatus);
  return {
    status,
    completedAt: row.kycCompletedAt ?? null,
    canSubmit: SUBMITTABLE.has(status),
  };
}
