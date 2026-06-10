/**
 * ID-TAX compliance trio — NPWP (Nomor Pokok Wajib Pajak) validation.
 *
 * Pure, dependency-free, client-safe (imported by vendor forms AND by
 * server-side tax exports). FORMAT validation only — Indonesia does not
 * publish an official public check-digit algorithm for NPWP, so this
 * module makes NO claim beyond "the value is shaped like an NPWP":
 *
 *   * Legacy 15-digit NPWP — canonical punctuation XX.XXX.XXX.X-XXX.XXX
 *     (9-digit taxpayer number + 3-digit KPP office + 3-digit branch).
 *     Accepted with or without dots/dashes/spaces.
 *   * 16-digit NIK-format NPWP (Coretax era, 2024+) — for individuals it
 *     equals the NIK; for entities it is the legacy number prefixed with
 *     a leading 0. Displayed as plain digits (no canonical punctuation).
 *
 * An all-zero value is rejected: "00.000.000.0-000.000" is DJP's
 * placeholder for "no NPWP", not a real registration.
 */

export type NpwpFormat = "legacy15" | "nik16";

export interface NpwpValidationResult {
  valid: boolean;
  /** Which shape matched (null when invalid). */
  format: NpwpFormat | null;
  /** Digits only (null when invalid). */
  normalized: string | null;
  /** Canonical display form (null when invalid). */
  formatted: string | null;
  /** Human-readable reason (null when valid). */
  error: string | null;
}

/** Hint reused by form copy and error messages. */
export const NPWP_FORMAT_HINT =
  "15-digit NPWP (XX.XXX.XXX.X-XXX.XXX) or 16-digit NIK-format NPWP";

/** Separators tolerated in operator input: dots, dashes, spaces. */
const SEPARATORS = /[.\-\s]/g;

/**
 * Strip tolerated separators. Returns the raw residue — callers must
 * still validate (the residue may contain non-digits or a wrong length).
 */
export function normalizeNpwp(input: string): string {
  return input.replace(SEPARATORS, "");
}

/**
 * Canonical display form for an already-normalized digit string:
 * 15 digits → XX.XXX.XXX.X-XXX.XXX; 16 digits → plain digits (the
 * NIK-format NPWP has no official punctuation). Anything else is
 * returned unchanged — format only after validation.
 */
export function formatNpwp(digits: string): string {
  if (!/^\d{15}$/.test(digits)) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}.${digits.slice(8, 9)}-${digits.slice(9, 12)}.${digits.slice(12, 15)}`;
}

function invalid(error: string): NpwpValidationResult {
  return { valid: false, format: null, normalized: null, formatted: null, error };
}

/**
 * Soft FORMAT validation (see module doc — no check-digit claim).
 * Empty/whitespace-only input is reported invalid here; form surfaces
 * skip validation entirely for empty values (NPWP stays optional).
 */
export function validateNpwp(input: string): NpwpValidationResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return invalid("NPWP is empty.");
  }
  const digits = normalizeNpwp(trimmed);
  if (!/^\d+$/.test(digits)) {
    return invalid(
      `NPWP may only contain digits and . - separators — expected a ${NPWP_FORMAT_HINT}.`,
    );
  }
  if (digits.length !== 15 && digits.length !== 16) {
    return invalid(
      `NPWP must be 15 or 16 digits (got ${digits.length}) — expected a ${NPWP_FORMAT_HINT}.`,
    );
  }
  if (/^0+$/.test(digits)) {
    return invalid(
      "All-zero NPWP is DJP's placeholder for “no NPWP” — leave the field blank instead.",
    );
  }
  const format: NpwpFormat = digits.length === 15 ? "legacy15" : "nik16";
  return {
    valid: true,
    format,
    normalized: digits,
    formatted: formatNpwp(digits),
    error: null,
  };
}
