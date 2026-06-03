#!/usr/bin/env tsx
/**
 * Build-order #2 — eyes-on seed for the guest check-in ↔ front-office backbone.
 *
 * NEVER FOR PRODUCTION DATA HYGIENE — writes a demo check-in + a fresh stay
 * token onto an existing confirmed booking so you can walk the flow:
 *
 *   1. Operator opens the printed ARRIVALS url → booking shows "awaiting review"
 *      → click "Approve & issue code" → booking flips to checked_in (manager
 *      panel) + the door code is issued.
 *   2. Guest opens the printed GUEST url → /check-in. (You may be asked to
 *      verify — enter the guest's last name / OTP.) After approval the villa
 *      door code is revealed.
 *
 * Requires migration 0118 (checkins table) applied first.
 *
 *   npm run seed:checkin-demo
 *   npm run seed:checkin-demo -- <bookingId>   # target a specific booking
 *
 * Idempotent: re-running resets the booking's checkin back to 'submitted'.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";
import { bookings } from "../src/lib/db/schema/bookings";
import { villas } from "../src/lib/db/schema/projects";
import {
  checkins,
  guestStayTokens,
  smartLockAccessCodes,
} from "../src/lib/db/schema/guest-stays";
import {
  generateStayToken,
  hashStayToken,
  tokenPrefixFromToken,
} from "../src/features/guest-stays/token";
import {
  deriveStubLockCode,
  deriveStubLockWindow,
} from "../src/features/guest-stays/smart-lock-stub-pure";

const BASE = process.env.APP_BASE_URL ?? "https://management.arconique.com";

async function main() {
  const db = getDb();
  const argId = process.argv.slice(2).find((a) => !a.startsWith("--"));

  const [bk] = argId
    ? await db
        .select({ id: bookings.id, villaId: bookings.villaId, code: bookings.bookingCode, checkIn: bookings.checkIn, checkOut: bookings.checkOut, unit: villas.unitCode })
        .from(bookings)
        .leftJoin(villas, eq(villas.id, bookings.villaId))
        .where(eq(bookings.id, argId))
        .limit(1)
    : await db
        .select({ id: bookings.id, villaId: bookings.villaId, code: bookings.bookingCode, checkIn: bookings.checkIn, checkOut: bookings.checkOut, unit: villas.unitCode })
        .from(bookings)
        .leftJoin(villas, eq(villas.id, bookings.villaId))
        .where(eq(bookings.status, "confirmed"))
        .orderBy(desc(bookings.checkIn))
        .limit(1);

  if (!bk) {
    console.error("No confirmed booking found to seed. Pass a bookingId arg.");
    return;
  }

  // 1) checkin row → 'submitted'
  const [existing] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .where(eq(checkins.bookingId, bk.id))
    .limit(1);
  const now = new Date();
  if (existing) {
    await db
      .update(checkins)
      .set({ status: "submitted", guestCount: 3, eta: "Evening · ~18:00", submittedAt: now, approvedAt: null, codeIssuedAt: null, updatedAt: now })
      .where(eq(checkins.id, existing.id));
  } else {
    await db.insert(checkins).values({ bookingId: bk.id, status: "submitted", guestCount: 3, eta: "Evening · ~18:00", submittedAt: now });
  }

  // 2) ensure an active door code exists for approval to "issue"
  const [activeCode] = await db
    .select({ id: smartLockAccessCodes.id })
    .from(smartLockAccessCodes)
    .where(and(eq(smartLockAccessCodes.bookingId, bk.id), eq(smartLockAccessCodes.status, "active")))
    .limit(1);
  if (!activeCode && bk.villaId) {
    const w = deriveStubLockWindow(bk.checkIn as unknown as string, bk.checkOut as unknown as string);
    await db.insert(smartLockAccessCodes).values({
      bookingId: bk.id,
      villaId: bk.villaId,
      codeDisplay: deriveStubLockCode(bk.id, bk.villaId),
      validFrom: w.validFrom,
      validUntil: w.validUntil,
      status: "active",
      source: "stub",
    });
  }

  // 3) issue a fresh guest stay token (plaintext only printed here)
  const token = generateStayToken();
  await db.insert(guestStayTokens).values({
    bookingId: bk.id,
    tokenHash: hashStayToken(token),
    tokenPrefix: tokenPrefixFromToken(token),
    status: "active",
    expiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
  });

  console.log("\n──────── check-in backbone — eyes-on ────────");
  console.log(`booking      ${bk.code}  (${bk.unit ?? "villa"})  check-in ${bk.checkIn}`);
  console.log(`ARRIVALS →   ${BASE}/dashboard/front-office/arrivals?date=${bk.checkIn}`);
  console.log(`             (shows "awaiting review" → Approve & issue code → checked_in)`);
  console.log(`GUEST    →   ${BASE}/stay/${token}/check-in`);
  console.log(`             (verify if prompted; door code reveals after approval)`);
  console.log("─────────────────────────────────────────────\n");
}

main().finally(() => closeDb());
