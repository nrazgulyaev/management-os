import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyers, buyerUnitAssignments } from "@/lib/db/schema/buyers";
import {
  contractGroups,
  contractMilestones,
} from "@/lib/db/schema/sales";
import { contractSignatures } from "@/lib/db/schema/contract-signatures";
import { villas } from "@/lib/db/schema/projects";
import {
  getBuyerInvoices,
  type BuyerInvoice,
} from "@/lib/buyer-portal/invoices";
import {
  getBuyerReceiptsByMilestone,
  type BuyerReceipt,
} from "@/lib/buyer-portal/receipts";

/**
 * Buyer-portal contract / e-sign data layer.
 *
 * Surfaces the buyer's contract groups (one per villa they are purchasing)
 * with their signing state + whether THIS buyer has already e-signed. Scoped
 * to the authenticated buyer through their assigned villas.
 */

const CONTRACT_PATH_PREFIX = "contract/group/";

/**
 * Deterministic Supabase object key for a buyer's signed-contract PDF. One per
 * (group, buyer) so a co-buyer's signed copy never overwrites another's. Real
 * object key (ends `.pdf`) so the rendered bytes upload here and the doc vault
 * hands back a signed download URL.
 */
export function contractStoragePath(
  contractGroupId: string,
  buyerId: string,
): string {
  return `${CONTRACT_PATH_PREFIX}${contractGroupId}/buyer/${buyerId}.pdf`;
}

/** Human contract reference printed on the PDF + title. */
export function contractReference(contractGroupId: string): string {
  return `CTR-${contractGroupId.slice(0, 8).toUpperCase()}`;
}

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

  // 0. Resolve the buyer's own org so the entire chain is bounded to the
  //    buyer's tenant — even if a stray cross-org assignment row exists.
  const [buyer] = await db
    .select({ organizationId: buyers.organizationId })
    .from(buyers)
    .where(eq(buyers.id, buyerId))
    .limit(1);
  if (!buyer) return [];
  const orgId = buyer.organizationId;

  // 1. The buyer's assigned villas (org-bounded).
  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(
      and(
        eq(buyerUnitAssignments.buyerId, buyerId),
        eq(buyerUnitAssignments.organizationId, orgId),
      ),
    );
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
    .where(
      and(
        eq(contractGroups.organizationId, orgId),
        inArray(contractGroups.villaId, unitIds),
      ),
    );
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
        eq(contractSignatures.organizationId, orgId),
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

// -----------------------------------------------------------------------------
// Unified contract view — milestones + per-milestone invoice + receipt + e-sign
// -----------------------------------------------------------------------------

export interface BuyerContractMilestone {
  id: string;
  sequence: number;
  name: string;
  status: string;
  expectedAmountUsdMinor: bigint;
  paidAmountUsdMinor: bigint;
  expectedDueDate: string | null;
  paidAt: Date | null;
  /** The operator-issued invoice for this milestone, if one has been sent. */
  invoice: BuyerInvoice | null;
  /** The receipt generated when this milestone was marked paid, if any. */
  receipt: BuyerReceipt | null;
}

export interface BuyerContractDetail extends BuyerContract {
  milestones: BuyerContractMilestone[];
  /** Sum of every milestone's expected amount on this contract. */
  scheduledTotalUsdMinor: bigint;
  /** Sum of every milestone's recorded paid amount. */
  paidTotalUsdMinor: bigint;
}

/**
 * The unified buyer-facing contract surface: each contract group enriched with
 * its milestone ladder (build phases), the per-milestone invoice (due / paid),
 * and the receipt for a paid milestone — composed alongside the same e-sign
 * state `getBuyerContracts` returns. Scoped to the authenticated buyer through
 * their assigned villas → contract groups.
 *
 * Reuses the existing scoped readers (`getBuyerContracts`, `getBuyerInvoices`,
 * `getBuyerReceiptsByMilestone`) so ownership is enforced once, consistently.
 */
export async function getBuyerContractDetails(
  buyerId: string,
): Promise<BuyerContractDetail[]> {
  const contracts = await getBuyerContracts(buyerId);
  if (contracts.length === 0) return [];

  const db = getDb();
  if (!db) {
    return contracts.map((c) => ({
      ...c,
      milestones: [],
      scheduledTotalUsdMinor: 0n,
      paidTotalUsdMinor: 0n,
    }));
  }

  const groupIds = contracts.map((c) => c.contractGroupId);

  // Milestone ladder for the buyer's contract groups, ordered by sequence.
  const milestoneRows = await db
    .select({
      id: contractMilestones.id,
      contractGroupId: contractMilestones.contractGroupId,
      sequence: contractMilestones.sequence,
      name: contractMilestones.name,
      status: contractMilestones.status,
      expectedAmountUsdMinor: contractMilestones.expectedAmountUsdMinor,
      paidAmountUsdMinor: contractMilestones.paidAmountUsdMinor,
      expectedDueDate: contractMilestones.expectedDueDate,
      paidAt: contractMilestones.paidAt,
    })
    .from(contractMilestones)
    .where(inArray(contractMilestones.contractGroupId, groupIds))
    .orderBy(
      asc(contractMilestones.contractGroupId),
      asc(contractMilestones.sequence),
    );

  // Issued invoices + generated receipts, both already buyer-scoped.
  const invoices = await getBuyerInvoices(buyerId);
  const invoiceByMilestone = new Map<string, BuyerInvoice>();
  for (const inv of invoices) {
    // Query is newest-first; keep the latest per milestone.
    if (!invoiceByMilestone.has(inv.contractMilestoneId)) {
      invoiceByMilestone.set(inv.contractMilestoneId, inv);
    }
  }
  const receiptByMilestone = await getBuyerReceiptsByMilestone(buyerId);

  const milestonesByGroup = new Map<string, BuyerContractMilestone[]>();
  for (const m of milestoneRows) {
    const list = milestonesByGroup.get(m.contractGroupId) ?? [];
    list.push({
      id: m.id,
      sequence: m.sequence,
      name: m.name,
      status: m.status,
      expectedAmountUsdMinor: m.expectedAmountUsdMinor,
      paidAmountUsdMinor: m.paidAmountUsdMinor,
      expectedDueDate: m.expectedDueDate,
      paidAt: m.paidAt,
      invoice: invoiceByMilestone.get(m.id) ?? null,
      receipt: receiptByMilestone.get(m.id) ?? null,
    });
    milestonesByGroup.set(m.contractGroupId, list);
  }

  return contracts.map((c) => {
    const milestones = milestonesByGroup.get(c.contractGroupId) ?? [];
    const scheduledTotalUsdMinor = milestones.reduce(
      (sum, m) => sum + m.expectedAmountUsdMinor,
      0n,
    );
    const paidTotalUsdMinor = milestones.reduce(
      (sum, m) => sum + m.paidAmountUsdMinor,
      0n,
    );
    return { ...c, milestones, scheduledTotalUsdMinor, paidTotalUsdMinor };
  });
}
