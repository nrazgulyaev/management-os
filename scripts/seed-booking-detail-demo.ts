#!/usr/bin/env tsx
/**
 * Whitmore-party booking-detail demo.
 *
 * Populates the booking-detail data layer (migration 0120) so
 * `/dashboard/bookings/[id]` renders 1:1 with the design mock: the full named
 * party (Emma + James + children), the itemised charge ledger, the card /
 * Stripe settlement, requirements, channel-sync counters, and 5 documents.
 *
 * NEVER FOR PRODUCTION DATA HYGIENE — demo content only. Idempotent: it
 * upserts villa EV-07 / owner / guest / booking BK-2148 by natural key and
 * resets the child rows on every run. Reuses the first existing project +
 * asset_type, so a base demo must already be seeded.
 *
 *   npm run seed:booking-detail-demo
 *
 * Requires migration 0120 applied first (npm run db:migrate).
 */
import { and, eq } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";
import { projects, villas } from "../src/lib/db/schema/projects";
import { assetTypes } from "../src/lib/db/schema/asset-types";
import { owners, ownershipShares } from "../src/lib/db/schema/ownership";
import { guests, bookingChannels, bookings } from "../src/lib/db/schema/bookings";
import {
  bookingGuests,
  bookingCharges,
  bookingPayments,
  bookingMeta,
} from "../src/lib/db/schema/booking-detail";
import { documents } from "../src/lib/db/schema/documents";
import { statementPeriods, ownerStatements } from "../src/lib/db/schema/finance";
import { ownerBookingSummaries } from "../src/lib/db/schema/owner-bookings";

async function main() {
  const db = getDb();

  // --- base refs (reuse existing) ---
  const [proj] = await db
    .select({ id: projects.id, organizationId: projects.organizationId })
    .from(projects)
    .limit(1);
  if (!proj) throw new Error("No project found — run a base demo seed first.");
  const organizationId = proj.organizationId;
  const [asset] = await db.select({ id: assetTypes.id }).from(assetTypes).limit(1);
  if (!asset) throw new Error("No asset_type found — run a base demo seed first.");

  // --- villa EV-07 (find or create) ---
  let [villa] = await db
    .select({ id: villas.id })
    .from(villas)
    .where(eq(villas.unitCode, "EV-07"))
    .limit(1);
  if (!villa) {
    [villa] = await db
      .insert(villas)
      .values({
        projectId: proj.id,
        slug: "eternal-villa-07",
        unitCode: "EV-07",
        name: "Eternal Villa 07",
        status: "ready",
        bedrooms: 3,
        bathrooms: "3",
        viewType: "ocean",
        managementModel: "individual",
        currentNightlyRateUsd: "420",
        assetTypeId: asset.id,
      })
      .returning({ id: villas.id });
  }
  const villaId = villa!.id;

  // --- owner Emma + ownership share ---
  let [owner] = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.displayName, "Emma Whitmore"))
    .limit(1);
  if (!owner) {
    [owner] = await db
      .insert(owners)
      .values({
        type: "individual",
        displayName: "Emma Whitmore",
        email: "emma.w@whitmore.co",
        phone: "+1 (415) 555-2284",
        nationality: "United States",
        status: "active",
      })
      .returning({ id: owners.id });
  }
  const ownerId = owner!.id;
  const [share] = await db
    .select({ id: ownershipShares.id })
    .from(ownershipShares)
    .where(and(eq(ownershipShares.ownerId, ownerId), eq(ownershipShares.villaId, villaId)))
    .limit(1);
  if (!share) {
    await db.insert(ownershipShares).values({
      ownerId,
      villaId,
      sharePercent: "100",
      model: "individual",
      startsOn: "2024-04-01",
      status: "active",
    });
  }

  // --- channel Airbnb ---
  let [chan] = await db
    .select({ id: bookingChannels.id })
    .from(bookingChannels)
    .where(eq(bookingChannels.key, "airbnb"))
    .limit(1);
  if (!chan) {
    [chan] = await db
      .insert(bookingChannels)
      .values({ key: "airbnb", name: "Airbnb", type: "ota" })
      .returning({ id: bookingChannels.id });
  }

  // --- guest (booking-level label "Whitmore party", Emma's contact) ---
  let [g] = await db
    .select({ id: guests.id })
    .from(guests)
    .where(eq(guests.email, "emma.w@whitmore.co"))
    .limit(1);
  if (!g) {
    [g] = await db
      .insert(guests)
      .values({
        fullName: "Whitmore party",
        email: "emma.w@whitmore.co",
        phone: "+1 (415) 555-2284",
        nationality: "United States",
        status: "active",
      })
      .returning({ id: guests.id });
  } else {
    await db.update(guests).set({ fullName: "Whitmore party" }).where(eq(guests.id, g!.id));
  }
  const guestId = g!.id;

  // --- booking BK-2148 (upsert) ---
  const bkVals = {
    organizationId,
    villaId,
    channelId: chan!.id,
    guestId,
    bookingCode: "BK-2148",
    sourceReference: "HMM5K2NXC8",
    status: "confirmed",
    checkIn: "2026-05-27",
    checkOut: "2026-05-30",
    nights: 3,
    adults: 2,
    children: 2,
    currency: "IDR",
    grossAmount: "4800000",
    cleaningFeeAmount: "350000",
    channelFeeAmount: "150000",
    paymentFeeAmount: "90000",
    netExpectedAmount: "4310000",
    notes: "Late arrival — flight at 22:00. Guest will text on landing.",
  };
  let [bk] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.bookingCode, "BK-2148"))
    .limit(1);
  if (!bk) {
    [bk] = await db.insert(bookings).values(bkVals).returning({ id: bookings.id });
  } else {
    await db.update(bookings).set(bkVals).where(eq(bookings.id, bk!.id));
  }
  const bookingId = bk!.id;

  // --- party (reset + insert) ---
  await db.delete(bookingGuests).where(eq(bookingGuests.bookingId, bookingId));
  await db.insert(bookingGuests).values([
    {
      organizationId,
      bookingId,
      fullName: "Emma Whitmore",
      role: "primary",
      kind: "adult",
      isLeadBooker: true,
      ownerVillaCode: "EV-07",
      email: "emma.w@whitmore.co",
      phone: "+1 (415) 555-2284",
      nationality: "United States",
      idType: "passport",
      idLast4: "8841",
      idVerified: true,
      sortOrder: 0,
    },
    {
      organizationId,
      bookingId,
      fullName: "James Whitmore",
      role: "accompanying",
      kind: "adult",
      nationality: "United States",
      idType: "passport",
      idLast4: "2207",
      idVerified: true,
      sortOrder: 1,
    },
    { organizationId, bookingId, fullName: "Lily Whitmore", role: "child", kind: "child", ageYears: 8, sortOrder: 2 },
    { organizationId, bookingId, fullName: "Noah Whitmore", role: "child", kind: "child", ageYears: 5, sortOrder: 3 },
  ]);

  // --- charge ledger (reset + insert) ---
  await db.delete(bookingCharges).where(eq(bookingCharges.bookingId, bookingId));
  await db.insert(bookingCharges).values([
    { organizationId, bookingId, chargeType: "nightly", description: "3 nights × IDR 1.4M", amount: "4200000", currency: "IDR", note: "BASE", occurredOn: "2026-05-12", sortOrder: 0 },
    { organizationId, bookingId, chargeType: "service", description: "Standard turnover cleaning", amount: "350000", currency: "IDR", note: "Refund", occurredOn: "2026-05-12", sortOrder: 1 },
    { organizationId, bookingId, chargeType: "fee", description: "Airbnb host service · 3%", amount: "-150000", currency: "IDR", occurredOn: "2026-05-12", sortOrder: 2 },
    { organizationId, bookingId, chargeType: "fee", description: "Stripe processing · 2.9% + IDR 30k", amount: "-90000", currency: "IDR", occurredOn: "2026-05-12", sortOrder: 3 },
  ]);

  // --- settlement (reset + insert) ---
  await db.delete(bookingPayments).where(eq(bookingPayments.bookingId, bookingId));
  await db.insert(bookingPayments).values({
    bookingId,
    provider: "stripe",
    providerPaymentId: "PMT_3KQS8",
    method: "card",
    cardBrand: "Visa",
    cardLast4: "4242",
    amount: "4310000",
    currency: "IDR",
    status: "captured",
    capturedAt: new Date("2026-05-12T06:32:00Z"),
    captureNote: "full amount",
  });

  // --- meta (reset + insert) ---
  await db.delete(bookingMeta).where(eq(bookingMeta.bookingId, bookingId));
  await db.insert(bookingMeta).values({
    bookingId,
    dietary: "1 vegetarian (Emma) · no allergies declared",
    mobility: "None declared",
    opsNotes: "Baby cot requested for Noah · placed in master annex",
    syncMessagesAutoReplied: 2,
    syncMessagesRouted: 0,
    syncLastAt: new Date(Date.now() - 12 * 60 * 1000),
  });

  // --- documents (reset + insert) ---
  await db
    .delete(documents)
    .where(and(eq(documents.entityType, "booking"), eq(documents.entityId, bookingId)));
  await db.insert(documents).values([
    { title: "Booking folio", documentType: "invoice", entityType: "booking", entityId: bookingId, fileName: "booking-folio.pdf", mimeType: "application/pdf", sizeBytes: 188416, visibility: "internal", status: "active", createdAt: new Date("2026-05-12T18:00:00Z") },
    { title: "Passport — Emma Whitmore", documentType: "kyc", entityType: "booking", entityId: bookingId, fileName: "passport-emma.jpg", mimeType: "image/jpeg", sizeBytes: 1258291, visibility: "internal", status: "active", createdAt: new Date("2026-05-12T17:00:00Z") },
    { title: "Passport — James Whitmore", documentType: "kyc", entityType: "booking", entityId: bookingId, fileName: "passport-james.jpg", mimeType: "image/jpeg", sizeBytes: 1153434, visibility: "internal", status: "active", createdAt: new Date("2026-05-13T09:00:00Z") },
    { title: "Airbnb reservation confirmation", documentType: "channel", entityType: "booking", entityId: bookingId, fileName: "airbnb-confirmation.pdf", mimeType: "application/pdf", sizeBytes: 98304, visibility: "internal", status: "active", createdAt: new Date("2026-05-12T16:00:00Z") },
    { title: "House rules acknowledgement", documentType: "policy", entityType: "booking", entityId: bookingId, fileName: "house-rules.pdf", mimeType: "application/pdf", sizeBytes: 43008, visibility: "internal", status: "active", createdAt: new Date("2026-05-12T15:00:00Z"), signedAt: new Date("2026-05-12T15:00:00Z") },
  ]);

  // --- owner statement linkage (best-effort) ---
  try {
    let [period] = await db
      .select({ id: statementPeriods.id })
      .from(statementPeriods)
      .where(eq(statementPeriods.periodStart, "2026-05-01"))
      .limit(1);
    if (!period) {
      [period] = await db
        .insert(statementPeriods)
        .values({ periodStart: "2026-05-01", periodEnd: "2026-05-31", label: "May 2026" })
        .returning({ id: statementPeriods.id });
    }
    let [stmt] = await db
      .select({ id: ownerStatements.id })
      .from(ownerStatements)
      .where(eq(ownerStatements.statementCode, "STM-EV07-2026-05"))
      .limit(1);
    if (!stmt) {
      [stmt] = await db
        .insert(ownerStatements)
        .values({
          ownerId,
          periodId: period!.id,
          statementCode: "STM-EV07-2026-05",
          managementModel: "individual",
          currency: "IDR",
          status: "draft",
        })
        .returning({ id: ownerStatements.id });
    }
    const [sum] = await db
      .select({ id: ownerBookingSummaries.id })
      .from(ownerBookingSummaries)
      .where(eq(ownerBookingSummaries.bookingId, bookingId))
      .limit(1);
    if (!sum) {
      await db.insert(ownerBookingSummaries).values({
        ownerId,
        villaId,
        bookingId,
        statementId: stmt!.id,
        sourceType: "channel",
        publicStatus: "confirmed",
        ownerLabel: "Whitmore party",
        checkIn: "2026-05-27",
        checkOut: "2026-05-30",
        nights: 3,
        currency: "IDR",
      });
    } else {
      await db
        .update(ownerBookingSummaries)
        .set({ statementId: stmt!.id })
        .where(eq(ownerBookingSummaries.id, sum.id));
    }
    console.log("  + linked owner statement STM-EV07-2026-05");
  } catch (e) {
    console.warn("  ! statement link skipped:", (e as Error).message);
  }

  console.log(`✓ Whitmore demo seeded — booking ${bookingId} (BK-2148 · Eternal Villa 07)`);
  console.log(`  Open: /dashboard/bookings/${bookingId}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
