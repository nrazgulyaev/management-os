/**
 * Renders three sample invoice PDFs (EN / RU / ID) using static demo
 * data — no database required. Drops files into `tmp/sample-invoices/`.
 *
 * Usage: npx tsx scripts/generate-sample-invoices.ts
 */

import * as React from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import {
  InvoicePdf,
  type InvoicePdfData,
} from "@/lib/development/pdf/invoice-pdf";

const OUT_DIR = resolve(process.cwd(), "tmp/sample-invoices");

function fmt(date: string, lang: "en" | "ru" | "id"): string {
  const locale = lang === "ru" ? "ru-RU" : lang === "id" ? "id-ID" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

const issuer: InvoicePdfData["issuer"] = {
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

const bank: InvoicePdfData["bankAccount"] = {
  bankName: "Bank Mandiri (Persero) Tbk",
  accountName: "Arconique Development Pte. Ltd.",
  accountNumber: "144-00-0000000-0",
  swiftBic: "BMRIIDJA",
  cryptoWallet: "TX1aBC...3kFq (USDT TRC-20)",
};

interface SampleInput {
  filename: string;
  language: "en" | "ru" | "id";
  invoiceNumber: string;
  invoiceType: InvoicePdfData["invoiceType"];
  status: string;
  recipient: InvoicePdfData["recipient"];
  property: InvoicePdfData["property"];
  lineItems: InvoicePdfData["lineItems"];
  fxRate: number;
  issuedAt: string;
  dueDate: string;
  reference: string;
}

const samples: SampleInput[] = [
  // 1) English — off-plan three-part 60% milestone for Eternal Villas EV-04
  {
    filename: "invoice-en-eternal-04-construction-milestone.pdf",
    language: "en",
    invoiceNumber: "ARC-2026-0042",
    invoiceType: "standard_invoice",
    status: "sent",
    recipient: {
      fullName: "Marcus Anderson",
      email: "marcus.a@example.com",
      phone: "+1 415 555 0103",
      countryOfResidence: "US",
      taxResidency: "US",
    },
    property: {
      projectName: "Eternal Villas",
      projectLocation: "Ungasan, Bali",
      unitCode: "EV-04",
      unitName: "Eternal Villa 04",
      unitTypeName: "Type Q",
      buildingAreaSqm: 410,
      plotAreaSqm: 720,
    },
    lineItems: [
      {
        description: "Leasehold agreement",
        detail: "60% construction milestone · 70% × 60%",
        amountMinor: "40320000",
        taxRate: 10,
        taxAmountMinor: "4032000",
      },
      {
        description: "Construction management",
        detail: "60% construction milestone · 25% × 60%",
        amountMinor: "14400000",
        taxRate: 11,
        taxAmountMinor: "1584000",
      },
      {
        description: "Service fee",
        detail: "60% construction milestone · 5% × 60%",
        amountMinor: "2880000",
        taxRate: 10,
        taxAmountMinor: "288000",
      },
    ],
    fxRate: 16500,
    issuedAt: "2026-09-15",
    dueDate: "2026-09-29",
    reference: "ARC-2026-0042-EV-04-3",
  },
  // 2) Russian — completed leasehold final invoice with VAT for Enso Villas ES-05
  {
    filename: "invoice-ru-enso-05-final-vat.pdf",
    language: "ru",
    invoiceNumber: "ARC-2026-0067",
    invoiceType: "final_invoice",
    status: "sent",
    recipient: {
      fullName: "Sergey Ivanov",
      email: "sergey.i@example.com",
      phone: "+7 905 000 00 06",
      countryOfResidence: "AE",
      taxResidency: "AE",
    },
    property: {
      projectName: "Enso Villas",
      projectLocation: "Pererenan, Bali",
      unitCode: "ES-05",
      unitName: "Enso Villa 05",
      unitTypeName: "Type V",
      buildingAreaSqm: 360,
      plotAreaSqm: 640,
    },
    lineItems: [
      {
        description: "Completed leasehold transfer",
        detail: "Handover · 100% of contract",
        amountMinor: "82000000",
        taxRate: 11,
        taxAmountMinor: "9020000",
      },
      {
        description: "Service fee (VAT)",
        detail: "Final settlement",
        amountMinor: "4400000",
        taxRate: 11,
        taxAmountMinor: "484000",
      },
    ],
    fxRate: 16450,
    issuedAt: "2027-04-30",
    dueDate: "2027-05-14",
    reference: "ARC-2026-0067-ES-05-FINAL",
  },
  // 3) Indonesian — pre-invoice for Ahau AH-08 reservation conversion
  {
    filename: "invoice-id-ahau-08-pre-invoice.pdf",
    language: "id",
    invoiceNumber: "ARC-2026-0083",
    invoiceType: "pre_invoice",
    status: "draft",
    recipient: {
      fullName: "Aisha Khan",
      email: "aisha.k@example.com",
      phone: "+971 50 000 0007",
      countryOfResidence: "AE",
      taxResidency: "AE",
    },
    property: {
      projectName: "Ahau Gardens",
      projectLocation: "Ubud, Bali",
      unitCode: "AH-08",
      unitName: "Ahau Villa 08",
      unitTypeName: "Type R",
      buildingAreaSqm: 220,
      plotAreaSqm: 480,
    },
    lineItems: [
      {
        description: "Reservation deposit",
        detail: "10% of contract · upon reservation",
        amountMinor: "5200000",
        taxRate: 10,
        taxAmountMinor: "520000",
      },
    ],
    fxRate: 16500,
    issuedAt: "2026-04-30",
    dueDate: "2026-05-14",
    reference: "ARC-2026-0083-AH-08-1",
  },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let totalGenerated = 0;
  for (const s of samples) {
    const subtotal = s.lineItems.reduce(
      (acc, li) => acc + BigInt(li.amountMinor),
      0n,
    );
    const totalTax = s.lineItems.reduce(
      (acc, li) => acc + BigInt(li.taxAmountMinor),
      0n,
    );
    const grandTotal = subtotal + totalTax;
    const grandTotalIdr = BigInt(Math.round(Number(grandTotal) * s.fxRate));

    const data: InvoicePdfData = {
      invoiceNumber: s.invoiceNumber,
      invoiceType: s.invoiceType,
      status: s.status,
      language: s.language,
      currency: "USD",
      fxRate: s.fxRate,
      issuedAt: s.issuedAt,
      dueDate: s.dueDate,
      issuedAtFormatted: fmt(s.issuedAt, s.language),
      dueDateFormatted: fmt(s.dueDate, s.language),
      generatedAtFormatted: nowIso(),
      issuer,
      recipient: s.recipient,
      property: s.property,
      lineItems: s.lineItems,
      grandTotalIdrMinor: grandTotalIdr.toString(),
      bankAccount: bank,
      reference: s.reference,
    };

    const element = React.createElement(InvoicePdf, {
      data,
    }) as React.ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(element);

    const path = resolve(OUT_DIR, s.filename);
    writeFileSync(path, buffer);
    console.log(`✓ ${s.filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    totalGenerated += 1;
  }

  console.log(`\nGenerated ${totalGenerated} sample invoices in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("✗ Sample generation failed:", err);
  process.exit(1);
});
