import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { contractGroups } from "@/lib/db/schema/sales";
import { contractSignatures } from "@/lib/db/schema/contract-signatures";
import { villas } from "@/lib/db/schema/projects";

/**
 * Buyer-portal contract / e-sign data layer.
 *
 * Surfaces the buyer's contract groups (one per villa they are purchasing)
 * with their signing state + whether THIS buyer has already e-signed. Scoped
 * to the authenticated buyer through their assigned villas.
 */

export type BuyerContractSignState =
  | "awaiting_signature"
  | "signed_by_you"
  | "fully_signed"
  | "not_signable";

export interface BuyerContract {
  contractGroupId: string;
  villaId: string;
  villaLabel: string;
  status: string;
  totalContractValueUsdMinor: bigint;
  contractDate: string;
  firstSignedAt: Date | null;
  fullySignedAt: Date | null;
  /** Whether THIS buyer has a recorded signature on the group. */
  signedByYou: boolean;
  signedByYouAt: Date | null;
  signerName: string | null;
  signState: BuyerContractSignState;
}

function signStateFor(args: {
  status: string;
  fullySignedAt: Date | null;
  signedByYou: boolean;
}): BuyerContractSignState {
  if (args.status === "cancelled" || args.status === "breached") {
    return "not_signable";
  }
  if (args.fullySignedAt || args.status === "fully_signed") {
    return "fully_signed";
  }
  if (args.signedByYou) return "signed_by_you";
  return "awaiting_signature";
}

export async function getBuyerContracts(
  buyerId: string,
): Promise<BuyerContract[]> {
  const db = getDb();
  if (!db) return [];

  // 1. The buyer's assigned villas.
  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, buyerId));
  const unitIds = [...new Set(assignments.map((a) => a.unitId))];
  if (unitIds.length === 0) return [];

  // 2. Villa labels.
  const villaRows = await db
    .select({ id: villas.id, unitCode: villas.unitCode, name: villas.name })
    .from(villas)
    .where(inArray(villas.id, unitIds));
  const villaById = new Map(villaRows.map((v) => [v.id, v]));

  // 3. Contract groups for those villas.
  const groups = await db
    .select({
      id: contractGroups.id,
      villaId: contractGroups.villaId,
      status: contractGroups.status,
      totalContractValueUsdMinor: contractGroups.totalContractValueUsdMinor,
      contractDate: contractGroups.contractDate,
      firstSignedAt: contractGroups.firstSignedAt,
      fullySignedAt: contractGroups.fullySignedAt,
    })
    .from(contractGroups)
    .where(inArray(contractGroups.villaId, unitIds));
  if (groups.length === 0) return [];

  // 4. THIS buyer's own recorded signatures across those groups. Scoped by
  //    buyerId so a co-buyer's signature on the same group does not show as
  //    "signed by you".
  const groupIds = groups.map((g) => g.id);
  const sigs = await db
    .select({
      contractGroupId: contractSignatures.contractGroupId,
      signerName: contractSignatures.signerName,
      signedAt: contractSignatures.signedAt,
    })
    .from(contractSignatures)
    .where(
      and(
        eq(contractSignatures.buyerId, buyerId),
        inArray(contractSignatures.contractGroupId, groupIds),
      ),
    );
  const sigByGroup = new Map(sigs.map((s) => [s.contractGroupId, s]));

  return groups
    .map((g) => {
      const v = villaById.get(g.villaId);
      const sig = sigByGroup.get(g.id) ?? null;
      const signedByYou = sig != null;
      return {
        contractGroupId: g.id,
        villaId: g.villaId,
        villaLabel:
          v?.name ?? v?.unitCode ?? `Villa ${g.villaId.slice(0, 8)}`,
        status: g.status,
        totalContractValueUsdMinor: g.totalContractValueUsdMinor,
        contractDate: g.contractDate,
        firstSignedAt: g.firstSignedAt,
        fullySignedAt: g.fullySignedAt,
        signedByYou,
        signedByYouAt: sig?.signedAt ?? null,
        signerName: sig?.signerName ?? null,
        signState: signStateFor({
          status: g.status,
          fullySignedAt: g.fullySignedAt,
          signedByYou,
        }),
      };
    });
}
