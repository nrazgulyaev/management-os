import "server-only";

/**
 * Buyer-portal document PDF renderer + uploader.
 *
 * #165 created the receipt + signed-contract `documents` rows as metadata
 * only (no bytes), so the doc-vault download route had nothing to hand back.
 * This module renders REAL, simple server-side PDFs (pdf-lib — already a
 * dependency) and uploads them to the canonical `arconique-documents` Supabase
 * bucket so those rows become downloadable through the existing buyer download
 * route (`getDocumentSignedUrl` → signed URL).
 *
 *   - renderReceiptPdf       — a payment-summary receipt for a paid milestone
 *   - renderSignedContractPdf — signed terms + signature block for a contract
 *   - uploadBuyerDocumentBytes — best-effort upload to a deterministic key
 *
 * `server-only` but deliberately NOT a "use server" module, so it can export
 * these sync render helpers + types alongside the async upload. The buyer
 * action modules ("use server") call into it.
 *
 * Money stays bigint MINOR until the render boundary, where formatMoneyMinor
 * produces the display string. No PSP — this documents a manual mark-paid /
 * typed-name e-signature, matching the deferred-rails posture.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { eq } from "drizzle-orm";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { villas, projects } from "@/lib/db/schema/projects";
import { formatMoneyMinor } from "@/lib/money";
import { receiptStoragePath } from "@/lib/buyer-portal/receipts";

/** Canonical documents bucket — the buyer download route resolves through it. */
export const BUYER_DOC_BUCKET = "arconique-documents";

// Layer-B ink/stone palette, expressed in pdf-lib rgb() for the printed page.
const INK = rgb(0.13, 0.12, 0.1); // near-ink
const STONE = rgb(0.42, 0.4, 0.36); // muted body
const HAIRLINE = rgb(0.82, 0.79, 0.74); // stone hairline
const CREAM = rgb(0.98, 0.97, 0.94); // cream wash header

const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 56;

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

function header(ctx: DrawCtx, title: string, subtitle: string): void {
  // Cream band.
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - 132,
    width: PAGE_W,
    height: 132,
    color: CREAM,
  });
  ctx.page.drawText("ARCONIQUE", {
    x: MARGIN,
    y: PAGE_H - 56,
    size: 11,
    font: ctx.bold,
    color: STONE,
  });
  ctx.page.drawText(title, {
    x: MARGIN,
    y: PAGE_H - 88,
    size: 22,
    font: ctx.bold,
    color: INK,
  });
  ctx.page.drawText(subtitle, {
    x: MARGIN,
    y: PAGE_H - 110,
    size: 11,
    font: ctx.font,
    color: STONE,
  });
  ctx.y = PAGE_H - 168;
}

function row(ctx: DrawCtx, label: string, value: string, opts: { bold?: boolean } = {}): void {
  ctx.page.drawText(label, {
    x: MARGIN,
    y: ctx.y,
    size: 10,
    font: ctx.font,
    color: STONE,
  });
  ctx.page.drawText(value, {
    x: MARGIN + 200,
    y: ctx.y,
    size: 11,
    font: opts.bold ? ctx.bold : ctx.font,
    color: INK,
  });
  ctx.y -= 24;
}

function hairline(ctx: DrawCtx): void {
  ctx.y -= 4;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.75,
    color: HAIRLINE,
  });
  ctx.y -= 20;
}

/** Wrapped paragraph body text. Returns nothing; advances ctx.y. */
function paragraph(ctx: DrawCtx, text: string, size = 10): void {
  const maxWidth = PAGE_W - MARGIN * 2;
  const words = text.split(/\s+/);
  let line = "";
  const lines: string[] = [];
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.font.widthOfTextAtSize(probe, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  for (const l of lines) {
    ctx.page.drawText(l, { x: MARGIN, y: ctx.y, size, font: ctx.font, color: STONE });
    ctx.y -= size + 5;
  }
  ctx.y -= 6;
}

function footer(ctx: DrawCtx, note: string): void {
  ctx.page.drawText(note, {
    x: MARGIN,
    y: 48,
    size: 8,
    font: ctx.font,
    color: STONE,
  });
}

async function newDoc(): Promise<{ doc: PDFDocument; ctx: DrawCtx }> {
  const doc = await PDFDocument.create();
  doc.setProducer("Arconique");
  doc.setCreator("Arconique Buyer Portal");
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, ctx: { page, font, bold, y: PAGE_H - 168 } };
}

export interface ReceiptPdfInput {
  receiptNumber: string;
  buyerName: string;
  buyerCode: string;
  villaLabel: string;
  milestoneName: string;
  amountMinor: bigint;
  currency: string;
  paidAt: Date;
  /** Printed on the "Method" line. Defaults to the buyer-portal phrasing. */
  methodLabel?: string;
}

/** A simple payment-summary receipt PDF. */
export async function renderReceiptPdf(input: ReceiptPdfInput): Promise<Uint8Array> {
  const { doc, ctx } = await newDoc();
  doc.setTitle(`Receipt ${input.receiptNumber}`);
  header(ctx, "Payment receipt", input.receiptNumber);

  row(ctx, "Issued to", input.buyerName);
  row(ctx, "Buyer reference", input.buyerCode);
  row(ctx, "Villa", input.villaLabel);
  row(ctx, "Installment", input.milestoneName);
  row(ctx, "Date paid", input.paidAt.toISOString().slice(0, 10));
  hairline(ctx);
  row(ctx, "Amount received", formatMoneyMinor(input.amountMinor, input.currency), {
    bold: true,
  });
  row(ctx, "Method", input.methodLabel ?? "Manual confirmation (buyer portal)");
  hairline(ctx);
  paragraph(
    ctx,
    "This receipt confirms the amount above was recorded as paid against the " +
      "installment shown. It is generated from the buyer portal at the time of " +
      "confirmation and does not itself effect a card or bank charge.",
  );
  footer(
    ctx,
    `Receipt ${input.receiptNumber} · Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`,
  );

  return doc.save();
}

export interface SignedContractPdfInput {
  contractReference: string;
  buyerName: string;
  buyerCode: string;
  villaLabel: string;
  contractDate: string;
  totalValueMinor: bigint;
  currency: string;
  signerName: string;
  signerEmail: string | null;
  signedAt: Date;
  signedHash: string;
  consentText: string;
}

/** A signed-terms + signature-block contract PDF. */
export async function renderSignedContractPdf(
  input: SignedContractPdfInput,
): Promise<Uint8Array> {
  const { doc, ctx } = await newDoc();
  doc.setTitle(`Signed contract ${input.contractReference}`);
  header(ctx, "Purchase agreement", input.contractReference);

  row(ctx, "Buyer", input.buyerName);
  row(ctx, "Buyer reference", input.buyerCode);
  row(ctx, "Villa", input.villaLabel);
  row(ctx, "Contract date", input.contractDate);
  row(ctx, "Total contract value", formatMoneyMinor(input.totalValueMinor, input.currency), {
    bold: true,
  });
  hairline(ctx);

  // Terms summary (kept short + neutral — the canonical legal terms live in the
  // operator contract record; this attests the buyer's e-signature on them).
  paragraph(ctx, "Signed terms", 12);
  paragraph(
    ctx,
    "The buyer agrees to purchase the villa identified above for the total " +
      "contract value, payable in the installment schedule attached to the " +
      "contract. Title transfers on full settlement. The buyer's electronic " +
      "signature below has the same legal effect as a handwritten signature.",
  );
  hairline(ctx);

  paragraph(ctx, "Signature", 12);
  row(ctx, "Signed by", input.signerName, { bold: true });
  if (input.signerEmail) row(ctx, "Email", input.signerEmail);
  row(ctx, "Signed at", input.signedAt.toISOString().slice(0, 19).replace("T", " ") + " UTC");
  row(ctx, "Method", "Typed-name electronic signature");
  ctx.y -= 4;
  paragraph(ctx, input.consentText, 8);
  paragraph(ctx, `Content hash (SHA-256): ${input.signedHash}`, 7);

  footer(
    ctx,
    `Contract ${input.contractReference} · Signature captured ${input.signedAt
      .toISOString()
      .slice(0, 19)
      .replace("T", " ")} UTC`,
  );

  return doc.save();
}

export interface UploadResult {
  ok: boolean;
  bucket?: string;
  path?: string;
  sizeBytes?: number;
  error?: string;
}

/**
 * Uploads rendered PDF bytes to a deterministic key in the documents bucket.
 * Best-effort: returns `{ ok:false }` (never throws) when Supabase storage is
 * not configured, so the calling payment / signature action still succeeds and
 * the doc row is simply left byte-less (the old behaviour) rather than failing.
 */
export async function uploadBuyerDocumentBytes(
  storagePath: string,
  bytes: Uint8Array,
): Promise<UploadResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Supabase storage not configured" };
  try {
    const { error } = await admin.storage
      .from(BUYER_DOC_BUCKET)
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      bucket: BUYER_DOC_BUCKET,
      path: storagePath,
      sizeBytes: bytes.byteLength,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "upload-failed" };
  }
}

// ---------------------------------------------------------------------------
// Milestone → receipt persistence (shared writer)
// ---------------------------------------------------------------------------

export interface PersistMilestoneReceiptInput {
  /** The paid milestone the receipt attests. Becomes the storage-path join. */
  milestoneId: string;
  /** Milestone name printed on the receipt ("Foundation", "Handover", …). */
  milestoneName: string;
  /** Villa the receipt is scoped to in the doc vault (entity_type='villa'). */
  villaId: string;
  /** Amount recorded paid, bigint USD MINOR (cents). */
  amountMinor: bigint;
  /** Display name printed as "Issued to". */
  buyerName: string;
  /** Buyer reference code printed on the receipt. */
  buyerCode: string;
  /** When the payment was recorded. */
  paidAt: Date;
  /** Currency code (defaults to USD). */
  currency?: string;
  /** Channel note for the printed "Method" line. */
  methodLabel?: string;
}

export interface PersistMilestoneReceiptResult {
  /** The indexed `documents` row id, or null when the row could not be written. */
  documentId: string | null;
  /** The buyer-facing receipt number (RCP-YYYY-XXXXXXXX). */
  receiptNumber: string;
  /** Whether the PDF bytes were uploaded (false ⇒ doc row is byte-less). */
  uploaded: boolean;
}

/**
 * Renders a payment-receipt PDF for a paid milestone, uploads the bytes to the
 * canonical documents bucket at the deterministic per-milestone key (which is
 * also the milestone → receipt join), and indexes an owner-visible `documents`
 * row scoped to the villa so it surfaces in the buyer doc-vault "Payment
 * receipts" group AND is downloadable.
 *
 * This is the single receipt-on-pay writer shared by BOTH the buyer self-service
 * mark-paid (`payment-actions.ts`) and the operator installments-desk mark-paid
 * (`installment-desk-actions.ts`) — neither should duplicate this block.
 *
 * Best-effort: never throws. On any failure (missing villa, storage not
 * configured, render error) the caller's payment write still stands; the receipt
 * is simply absent or byte-less. The org is resolved via villa → project so the
 * document carries the right tenant.
 */
export async function persistMilestoneReceipt(
  input: PersistMilestoneReceiptInput,
): Promise<PersistMilestoneReceiptResult> {
  const currency = input.currency ?? "USD";
  const receiptNumber = `RCP-${input.paidAt.getUTCFullYear()}-${input.milestoneId
    .slice(0, 8)
    .toUpperCase()}`;
  const fallback: PersistMilestoneReceiptResult = {
    documentId: null,
    receiptNumber,
    uploaded: false,
  };

  const db = getDb();
  if (!db) return fallback;

  try {
    const amountLabel = formatMoneyMinor(input.amountMinor, currency);
    const storagePath = receiptStoragePath(input.milestoneId);

    // Villa label for the printed receipt + org for tenancy (best-effort).
    const [villa] = await db
      .select({
        unitCode: villas.unitCode,
        name: villas.name,
        organizationId: projects.organizationId,
      })
      .from(villas)
      .leftJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(villas.id, input.villaId))
      .limit(1);
    const villaLabel =
      villa?.name ?? villa?.unitCode ?? `Villa ${input.villaId.slice(0, 8)}`;

    const bytes = await renderReceiptPdf({
      receiptNumber,
      buyerName: input.buyerName,
      buyerCode: input.buyerCode,
      villaLabel,
      milestoneName: input.milestoneName,
      amountMinor: input.amountMinor,
      currency,
      paidAt: input.paidAt,
      methodLabel: input.methodLabel,
    });
    const upload = await uploadBuyerDocumentBytes(storagePath, bytes);

    const now = new Date();
    const [doc] = await db
      .insert(documents)
      .values({
        // TENANCY-FINANCE-DOCS — org via villa -> project.
        organizationId: villa?.organizationId ?? null,
        title: `Receipt ${receiptNumber} — ${input.milestoneName} (${amountLabel})`,
        documentType: "receipt",
        entityType: "villa",
        entityId: input.villaId,
        // Owner-visible so the buyer doc vault surfaces it.
        visibility: "owner",
        visibleToOwner: true,
        status: "active",
        // `storage_path` doubles as the milestone → receipt join sentinel AND
        // the real Supabase object key. `storage_bucket` is set only when the
        // upload succeeded, which the doc vault keys "downloadable" off.
        storagePath,
        storageBucket: upload.ok ? upload.bucket ?? BUYER_DOC_BUCKET : null,
        fileName: upload.ok ? `${receiptNumber}.pdf` : null,
        mimeType: upload.ok ? "application/pdf" : null,
        sizeBytes: upload.ok ? upload.sizeBytes ?? null : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: documents.id });

    return {
      documentId: doc?.id ?? null,
      receiptNumber,
      uploaded: upload.ok,
    };
  } catch (err) {
    // Receipt is a side-effect; never break the recorded payment.
    console.error("[buyer-portal] milestone receipt persistence failed", err);
    return fallback;
  }
}
