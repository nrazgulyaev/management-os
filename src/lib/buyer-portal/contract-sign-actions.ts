"use server";

/**
 * Buyer-scoped e-signature on a contract group.
 *
 * There is NO real e-sign provider (DocuSign etc.) — this is a manual
 * typed-name signature captured in the buyer portal, mirroring the manual
 * mark-paid pattern. It re-validates that the contract group belongs to the
 * authenticated buyer (session → buyer_unit_assignments → contract_groups)
 * BEFORE writing, records a legally-meaningful `contract_signatures` row
 * (typed name + consent text + captured IP/UA + content hash), and cascades
 * the buyer's portion of the signing state:
 *   - records every child `contracts` row of the group as signed-by-buyer
 *   - advances `contract_groups` to `partial_signed` / `fully_signed`
 *
 * This deliberately does NOT reuse the operator `signContract`: that action is
 * operator-trusted, takes an arbitrary single child contract id, and triggers
 * the Lead→Buyer / villa-freeze cascade which is an operator concern. Here we
 * only capture the buyer-attested signature + advance status; the operator's
 * own counter-signature flow remains the place the heavy cascade fires.
 */

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { contractGroups, contracts } from "@/lib/db/schema/sales";
import { contractSignatures } from "@/lib/db/schema/contract-signatures";
import { projects, villas } from "@/lib/db/schema/projects";
import { documents } from "@/lib/db/schema/documents";
import { recordAuditEvent } from "@/features/audit/services";
import { contractStoragePath, contractReference } from "@/lib/buyer-portal/contracts";
import {
  renderSignedContractPdf,
  uploadBuyerDocumentBytes,
  BUYER_DOC_BUCKET,
} from "@/lib/buyer-portal/document-pdf";

const CONSENT_TEXT =
  "By typing my full legal name below I confirm I have read the contract and " +
  "intend my typed name to be my electronic signature, with the same legal " +
  "effect as a handwritten signature.";

const signSchema = z.object({
  contractGroupId: z.string().uuid(),
  typedName: z.string().trim().min(2).max(160),
  consent: z.literal(true),
});

export type BuyerSignResult =
  | { ok: true; cascade: "partial" | "fully_signed" }
  | { ok: false; error: string };

export async function signBuyerContract(input: {
  contractGroupId: string;
  typedName: string;
  consent: boolean;
}): Promise<BuyerSignResult> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please type your full legal name and tick the consent box.",
    };
  }

  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "Not authenticated." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // 1. Resolve the buyer's villas → contract groups (ownership chain).
  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, session.buyerId));
  const unitIds = assignments.map((a) => a.unitId);
  if (unitIds.length === 0) return { ok: false, error: "No villas assigned." };

  // 2. Load the group AND verify it is the buyer's.
  const [group] = await db
    .select()
    .from(contractGroups)
    .where(
      and(
        eq(contractGroups.id, parsed.data.contractGroupId),
        inArray(contractGroups.villaId, unitIds),
      ),
    )
    .limit(1);
  if (!group) return { ok: false, error: "Contract not found." };

  if (group.status === "cancelled" || group.status === "breached") {
    return { ok: false, error: "This contract can no longer be signed." };
  }
  if (group.fullySignedAt) {
    return { ok: false, error: "This contract is already fully signed." };
  }

  // 3. Already signed by THIS buyer? (unique index also guards.)
  const [existing] = await db
    .select({ id: contractSignatures.id })
    .from(contractSignatures)
    .where(
      and(
        eq(contractSignatures.contractGroupId, group.id),
        eq(contractSignatures.buyerId, session.buyerId),
      ),
    )
    .limit(1);
  if (existing) {
    return { ok: false, error: "You have already signed this contract." };
  }

  const now = new Date();
  const h = await headers();
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent") ?? null;

  // Content hash binds the signature to the exact payload signed.
  const signedHash = createHash("sha256")
    .update(
      [
        group.id,
        group.totalContractValueUsdMinor.toString(),
        session.buyerId,
        parsed.data.typedName,
        now.toISOString(),
      ].join("|"),
    )
    .digest("hex");

  // 4. Record the signature (append-only legal record).
  await db.insert(contractSignatures).values({
    contractGroupId: group.id,
    buyerId: session.buyerId,
    buyerCode: session.buyerCode,
    signerName: parsed.data.typedName,
    signerEmail: session.primaryEmail,
    signerRole: "buyer",
    method: "typed_name",
    consentText: CONSENT_TEXT,
    signedValueUsdMinor: group.totalContractValueUsdMinor,
    signedHash,
    ipAddress,
    userAgent,
    signedAt: now,
  });

  // 5. Advance the child contracts (buyer's side) + the group status.
  const childContracts = await db
    .select({ id: contracts.id, status: contracts.status })
    .from(contracts)
    .where(eq(contracts.contractGroupId, group.id));

  // Sign every child that the buyer can sign (draft / pending). Cancelled
  // children are left as-is and excluded from the "fully signed" test.
  const unsignedIds = childContracts
    .filter((c) => c.status === "draft" || c.status === "pending_signature")
    .map((c) => c.id);
  if (unsignedIds.length > 0) {
    await db
      .update(contracts)
      .set({ status: "signed", signedAt: now, updatedAt: now })
      .where(inArray(contracts.id, unsignedIds));
  }

  // After this write, every signable child is `signed`. The group is fully
  // signed when no child remains in a non-signed, non-cancelled state.
  const stillPending = childContracts.some(
    (c) =>
      !unsignedIds.includes(c.id) &&
      c.status !== "signed" &&
      c.status !== "cancelled",
  );
  const cascade: "partial" | "fully_signed" = stillPending
    ? "partial"
    : "fully_signed";

  const groupUpdate: {
    updatedAt: Date;
    firstSignedAt?: Date;
    fullySignedAt?: Date;
    status?: string;
  } = { updatedAt: now };
  if (!group.firstSignedAt) groupUpdate.firstSignedAt = now;
  if (cascade === "fully_signed") {
    groupUpdate.fullySignedAt = now;
    groupUpdate.status = "fully_signed";
  } else {
    groupUpdate.status = "partial_signed";
  }
  await db
    .update(contractGroups)
    .set(groupUpdate)
    .where(eq(contractGroups.id, group.id));

  // Generate a SIGNED-CONTRACT PDF into the buyer's document vault. Render real
  // bytes (signed terms + signature block), upload to the canonical documents
  // bucket at a deterministic per-(group, buyer) key, then index a `documents`
  // row scoped to the villa + marked owner-visible so it lands in the buyer
  // doc-vault "Contract" group AND is downloadable. Best-effort: a render /
  // upload / index failure must never undo the recorded signature.
  let contractDocumentId: string | null = null;
  try {
    const [villa] = await db
      .select({
        unitCode: villas.unitCode,
        name: villas.name,
        organizationId: projects.organizationId,
      })
      .from(villas)
      .leftJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(villas.id, group.villaId))
      .limit(1);
    const villaLabel =
      villa?.name ?? villa?.unitCode ?? `Villa ${group.villaId.slice(0, 8)}`;
    const reference = contractReference(group.id);
    const storagePath = contractStoragePath(group.id, session.buyerId);

    const bytes = await renderSignedContractPdf({
      contractReference: reference,
      buyerName: session.displayName,
      buyerCode: session.buyerCode,
      villaLabel,
      contractDate: group.contractDate,
      totalValueMinor: group.totalContractValueUsdMinor,
      currency: "USD",
      signerName: parsed.data.typedName,
      signerEmail: session.primaryEmail,
      signedAt: now,
      signedHash,
      consentText: CONSENT_TEXT,
    });
    const upload = await uploadBuyerDocumentBytes(storagePath, bytes);

    // One signed-contract doc per (group, buyer): upsert so re-issue replaces.
    const [existingDoc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.documentType, "contract"),
          eq(documents.entityType, "villa"),
          eq(documents.entityId, group.villaId),
          eq(documents.storagePath, storagePath),
        ),
      )
      .limit(1);

    const docValues = {
      // TENANCY-FINANCE-DOCS — org via villa -> project (buyer portal).
      organizationId: villa?.organizationId ?? null,
      title: `Signed contract ${reference} — ${villaLabel}`,
      documentType: "contract",
      entityType: "villa",
      entityId: group.villaId,
      visibility: "owner",
      visibleToOwner: true,
      status: "active",
      storagePath,
      storageBucket: upload.ok ? upload.bucket ?? BUYER_DOC_BUCKET : null,
      fileName: upload.ok ? `${reference}.pdf` : null,
      mimeType: upload.ok ? "application/pdf" : null,
      sizeBytes: upload.ok ? upload.sizeBytes ?? null : null,
      signedAt: now,
      signedHash,
      updatedAt: now,
    };

    if (existingDoc) {
      await db
        .update(documents)
        .set(docValues)
        .where(eq(documents.id, existingDoc.id));
      contractDocumentId = existingDoc.id;
    } else {
      const [doc] = await db
        .insert(documents)
        .values({ ...docValues, createdAt: now })
        .returning({ id: documents.id });
      contractDocumentId = doc?.id ?? null;
    }
  } catch (err) {
    // Document is a side-effect; never undo the recorded signature.
    console.error("[buyer-portal] signed-contract PDF generation failed", err);
  }

  await recordAuditEvent({
    actorUserId: null,
    action: "contract_group.buyer_signed",
    entityType: "contract_group",
    entityId: group.id,
    before: { status: group.status, fullySignedAt: null },
    after: { status: groupUpdate.status, cascade },
    metadata: {
      buyerId: session.buyerId,
      buyerCode: session.buyerCode,
      channel: "buyer_portal",
      method: "typed_name_esign",
      signedHash,
      signedValueUsdMinor: group.totalContractValueUsdMinor.toString(),
      contractDocumentId,
    },
  });

  revalidatePath("/buyer-portal/contract");
  revalidatePath("/buyer-portal/documents");
  return { ok: true, cascade };
}
