/**
 * Owner-portal guest privacy.
 *
 * Owners never see full guest names on their surfaces (calendar, home
 * "upcoming", …) — only masked initials ("Guest JW"). Emails / phones /
 * access codes are never selected into owner queries in the first place.
 * Booking codes carry no PII, so call sites keep a `?? bookingCode`
 * fallback for nameless bookings.
 *
 * Centralised here so every owner surface masks identically — see
 * get-calendar.ts and get-home.ts.
 */
export function maskGuestName(fullName: string): string {
  const initials = fullName
    .split(/[\s·.,]+/)
    .filter((p) => p.length > 0)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return initials ? `Guest ${initials}` : "Guest";
}

/** Masked label for a booking: initials when a name is present, else the
 *  (PII-free) booking code. */
export function maskedGuestLabel(
  guestName: string | null | undefined,
  bookingCode: string,
): string {
  return guestName ? maskGuestName(guestName) : bookingCode;
}
