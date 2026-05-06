import "server-only";

import * as React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema/contacts";
import { projects, villas } from "@/lib/db/schema/projects";
import {
  unitTypes,
  developmentProjectMeta,
  unitDevelopmentMeta,
} from "@/lib/db/schema/development";
import {
  contractGroups,
  contractMilestones,
  contracts as contractsTable,
  invoices,
} from "@/lib/db/schema/sales";
import { InvoicePdf, type InvoicePdfData, type InvoicePdfLineItem } from "./invoice-pdf";
import type { InvoiceLanguage } from "./invoice-translations";

/**
 * Renders an invoice PDF buffer from a `contract_milestones` row.
 *
 * Pulls the full snapshot the template needs:
 *   - milestone + contract group + child contracts (for tax breakdown)
 *   - buyer + project + unit + unit type + property meta
 *
 * Returns `{ buffer, filename, language, currency }` for the caller to
 * upload + index into `documents`. The caller (`generateInvoicePDF` in
 * `invoice-actions.ts`) is responsible for storage + the `invoices` row.
 */
export interface RenderInvoiceOptions {
  /** Override the buyer's preferred language. */
  languageOverride?: InvoiceLanguage;
  /** Optional issuer block override (defaults to a deterministic
   *  Arconique placeholder until real entity config exists). */
  issuerOverride?: InvoicePdfData["issuer"];
  /** Optional bank account override; when null the PDF prints "—". */
  bankAccountOverride?: InvoicePdfData["bankAccount"];
}

export interface RenderedInvoice {
  buffer: Buffer;
  filename: string;
  language: InvoiceLanguage;
  currency: string;
  invoiceNumber: string;
}

const DEFAULT_ISSUER: InvoicePdfData["issuer"] = {
  legalName: "Arconique Development Pte. Ltd.",
  addressLines: [
    "Jl. Pantai Berawa No. 88",
    "Canggu, Bali 80361",
    "Indonesia",
  ],
  taxId: "01.234.567.8-901.000",
  email: "billing@arconique.com",
  phone: "+62 361 000 0000",
};

const DEFAULT_BANK: InvoicePdfData["bankAccount"] = {
  bankName: "Bank Mandiri (Persero) Tbk",
  accountName: "Arconique Development Pte. Ltd.",
  accountNumber: "144-00-0000000-0",
  swiftBic: "BMRIIDJA",
};

function fmtDate(iso: string | null | undefined, lang: InvoiceLanguage): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = lang === "ru" ? "ru-RU" : lang === "id" ? "id-ID" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function detectLanguage(
  preferredLanguage: string | null | undefined,
  override?: InvoiceLanguage,
): InvoiceLanguage {
  if (override) return override;
  if (preferredLanguage === "ru" || preferredLanguage === "id") {
    return preferredLanguage;
  }
  return "en";
}

export async function renderInvoicePdfFromInvoice(
  invoiceId: string,
  options: RenderInvoiceOptions = {},
): Promise<RenderedInvoice | null> {
  const db = getDb();
  if (!db) return null;

  const invoiceRow = (
    await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  )[0];
  if (!invoiceRow) return null;

  return renderInvoiceFromMilestone(invoiceRow.contractMilestoneId, {
    ...options,
    invoicePresetNumber: invoiceRow.invoiceNumber,
    invoicePresetType: invoiceRow.invoiceType,
    invoicePresetIssuedAt: invoiceRow.issuedAt
      ? invoiceRow.issuedAt.toISOString()
      : new Date().toISOString(),
    invoicePresetDueDate: invoiceRow.dueDate,
    invoicePresetCurrency: invoiceRow.currency,
    invoicePresetLanguage: invoiceRow.language as InvoiceLanguage,
    invoicePresetFxRate: Number(invoiceRow.fxRate),
    invoicePresetAmountUsdMinor: invoiceRow.amountUsdMinor,
    invoicePresetAmountIdrMinor: invoiceRow.amountIdrMinor,
    invoicePresetStatus: invoiceRow.status,
  });
}

export interface RenderFromMilestoneOptions extends RenderInvoiceOptions {
  /** Override invoice number (used when re-rendering an existing invoice). */
  invoicePresetNumber?: string;
  invoicePresetType?: string;
  invoicePresetIssuedAt?: string;
  invoicePresetDueDate?: string;
  invoicePresetCurrency?: string;
  invoicePresetLanguage?: InvoiceLanguage;
  invoicePresetFxRate?: number;
  invoicePresetAmountUsdMinor?: bigint;
  invoicePresetAmountIdrMinor?: bigint;
  invoicePresetStatus?: string;
}

export async function renderInvoiceFromMilestone(
  milestoneId: string,
  options: RenderFromMilestoneOptions = {},
): Promise<RenderedInvoice | null> {
  const db = getDb();
  if (!db) return null;

  const milestoneRow = (
    await db
      .select()
      .from(contractMilestones)
      .where(eq(contractMilestones.id, milestoneId))
      .limit(1)
  )[0];
  if (!milestoneRow) return null;

  const groupRow = (
    await db
      .select()
      .from(contractGroups)
      .where(eq(contractGroups.id, milestoneRow.contractGroupId))
      .limit(1)
  )[0];
  if (!groupRow) return null;

  const buyerRow = (
    await db.select().from(contacts).where(eq(contacts.id, groupRow.contactId)).limit(1)
  )[0];
  if (!buyerRow) return null;

  const villaRow = (
    await db.select().from(villas).where(eq(villas.id, groupRow.villaId)).limit(1)
  )[0];
  if (!villaRow) return null;

  const projectRow = (
    await db.select().from(projects).where(eq(projects.id, groupRow.projectId)).limit(1)
  )[0];
  if (!projectRow) return null;

  const projectMetaRow = (
    await db
      .select()
      .from(developmentProjectMeta)
      .where(eq(developmentProjectMeta.projectId, groupRow.projectId))
      .limit(1)
  )[0];

  const unitMetaRow = (
    await db
      .select()
      .from(unitDevelopmentMeta)
      .where(eq(unitDevelopmentMeta.villaId, groupRow.villaId))
      .limit(1)
  )[0];

  let unitTypeName: string | null = null;
  if (unitMetaRow?.unitTypeId) {
    const ut = (
      await db
        .select({ name: unitTypes.name })
        .from(unitTypes)
        .where(eq(unitTypes.id, unitMetaRow.unitTypeId))
        .limit(1)
    )[0];
    unitTypeName = ut?.name ?? null;
  }

  // Child contracts for the line-item breakdown (off-plan three-part has 3).
  const childContracts = await db
    .select()
    .from(contractsTable)
    .where(eq(contractsTable.contractGroupId, groupRow.id))
    .orderBy(contractsTable.sequence);

  const language = detectLanguage(
    options.invoicePresetLanguage ?? buyerRow.preferredLanguage,
    options.languageOverride,
  );
  const currency = options.invoicePresetCurrency ?? "USD";
  const fxRate =
    options.invoicePresetFxRate ?? Number(groupRow.fxRateAtSigning);

  // Build line items: one row per child contract, scaled by the
  // milestone's collection percent. Tax bearer is informational; the
  // line still shows the buyer-borne tax amount in the table.
  const collectionFraction =
    Number(milestoneRow.collectionPercent) / 100;

  const lineItems: InvoicePdfLineItem[] = childContracts.map((c) => {
    const lineAmountUsd =
      (BigInt(c.amountUsdMinor) *
        BigInt(Math.round(collectionFraction * 1_000_000))) /
      1_000_000n;
    const taxAmount =
      (lineAmountUsd * BigInt(Math.round(Number(c.taxRate) * 100))) / 10_000n;
    return {
      description: c.componentName,
      detail: `${milestoneRow.name} · ${milestoneRow.collectionPercent}%`,
      amountMinor: lineAmountUsd.toString(),
      taxRate: Number(c.taxRate),
      taxAmountMinor: taxAmount.toString(),
    };
  });

  // Fallback when the group has no child contracts: a single
  // milestone-amount line.
  if (lineItems.length === 0) {
    lineItems.push({
      description: milestoneRow.name,
      detail: `${milestoneRow.collectionPercent}% of contract`,
      amountMinor: milestoneRow.expectedAmountUsdMinor.toString(),
      taxRate: 0,
      taxAmountMinor: "0",
    });
  }

  const grandTotalIdr =
    options.invoicePresetAmountIdrMinor ??
    BigInt(
      Math.round(
        Number(milestoneRow.expectedAmountUsdMinor) * fxRate,
      ),
    );

  const data: InvoicePdfData = {
    invoiceNumber: options.invoicePresetNumber ?? `ARC-PREVIEW-${milestoneId.slice(0, 8)}`,
    invoiceType:
      (options.invoicePresetType as InvoicePdfData["invoiceType"]) ??
      "standard_invoice",
    status: options.invoicePresetStatus ?? "draft",
    language,
    currency,
    fxRate,
    issuedAt:
      options.invoicePresetIssuedAt ?? new Date().toISOString(),
    dueDate:
      options.invoicePresetDueDate ??
      milestoneRow.expectedDueDate ??
      new Date().toISOString().slice(0, 10),
    issuedAtFormatted: fmtDate(
      options.invoicePresetIssuedAt ?? new Date().toISOString(),
      language,
    ),
    dueDateFormatted: fmtDate(
      options.invoicePresetDueDate ?? milestoneRow.expectedDueDate,
      language,
    ),
    generatedAtFormatted: nowIso(),
    issuer: options.issuerOverride ?? DEFAULT_ISSUER,
    recipient: {
      fullName: buyerRow.fullName,
      email: buyerRow.email,
      phone: buyerRow.phone,
      countryOfResidence: buyerRow.countryOfResidence,
      taxResidency: buyerRow.taxResidency,
    },
    property: {
      projectName: projectRow.name,
      projectLocation: projectRow.location,
      unitCode: villaRow.unitCode,
      unitName: villaRow.name,
      unitTypeName,
      buildingAreaSqm: unitMetaRow?.overrideBuildingAreaSqm
        ? Number(unitMetaRow.overrideBuildingAreaSqm)
        : projectMetaRow?.netSquareMeters
          ? Number(projectMetaRow.netSquareMeters)
          : null,
      plotAreaSqm: unitMetaRow?.overridePlotAreaSqm
        ? Number(unitMetaRow.overridePlotAreaSqm)
        : null,
    },
    lineItems,
    grandTotalIdrMinor: grandTotalIdr.toString(),
    bankAccount:
      options.bankAccountOverride === undefined
        ? DEFAULT_BANK
        : options.bankAccountOverride,
    reference: `${options.invoicePresetNumber ?? "MS"}-${villaRow.unitCode}-${milestoneRow.sequence}`,
  };

  const element = React.createElement(InvoicePdf, {
    data,
  }) as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  const filenameSuffix = (options.invoicePresetNumber ?? milestoneId.slice(0, 8))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const filename = `invoice-${filenameSuffix}.pdf`;

  return {
    buffer,
    filename,
    language,
    currency,
    invoiceNumber: data.invoiceNumber,
  };
}
