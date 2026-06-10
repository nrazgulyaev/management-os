/**
 * ID-TAX compliance trio — NPWP format validation (pure module).
 *
 * Covers both accepted shapes (legacy 15-digit with/without punctuation,
 * 16-digit NIK-format), normalization/format helpers, and the rejection
 * cases (wrong length, non-digits, all-zero placeholder, empty).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatNpwp,
  normalizeNpwp,
  validateNpwp,
  NPWP_FORMAT_HINT,
} from "../src/lib/tax/npwp";

test("legacy 15-digit NPWP with canonical punctuation is valid", () => {
  const r = validateNpwp("01.234.567.8-901.000");
  assert.equal(r.valid, true);
  assert.equal(r.format, "legacy15");
  assert.equal(r.normalized, "012345678901000");
  assert.equal(r.formatted, "01.234.567.8-901.000");
  assert.equal(r.error, null);
});

test("legacy 15-digit NPWP without punctuation is valid and re-formatted", () => {
  const r = validateNpwp("012345678901000");
  assert.equal(r.valid, true);
  assert.equal(r.format, "legacy15");
  assert.equal(r.formatted, "01.234.567.8-901.000");
});

test("15 digits with stray spaces/dashes normalize and validate", () => {
  const r = validateNpwp(" 01 234 567 8-901 000 ");
  assert.equal(r.valid, true);
  assert.equal(r.normalized, "012345678901000");
});

test("16-digit NIK-format NPWP is valid, formatted as plain digits", () => {
  const r = validateNpwp("3171234567890123");
  assert.equal(r.valid, true);
  assert.equal(r.format, "nik16");
  assert.equal(r.normalized, "3171234567890123");
  assert.equal(r.formatted, "3171234567890123");
});

test("16-digit entity NPWP (legacy with leading 0) is valid", () => {
  const r = validateNpwp("0012345678901000");
  assert.equal(r.valid, true);
  assert.equal(r.format, "nik16");
});

test("wrong lengths are rejected with the length in the message", () => {
  for (const value of ["1234", "12345678901234", "12345678901234567"]) {
    const r = validateNpwp(value);
    assert.equal(r.valid, false, `expected ${value} to be invalid`);
    assert.equal(r.format, null);
    assert.match(r.error ?? "", /15 or 16 digits/);
    assert.match(r.error ?? "", new RegExp(`got ${value.length}`));
  }
});

test("non-digit characters are rejected (letters, slashes)", () => {
  for (const value of ["01.234.567.8-901.00A", "NPWP123456789012", "01/234/567"]) {
    const r = validateNpwp(value);
    assert.equal(r.valid, false, `expected ${value} to be invalid`);
    assert.match(r.error ?? "", /only contain digits/);
  }
});

test("all-zero placeholder NPWP is rejected in both lengths", () => {
  for (const value of ["00.000.000.0-000.000", "0".repeat(16)]) {
    const r = validateNpwp(value);
    assert.equal(r.valid, false, `expected ${value} to be invalid`);
    assert.match(r.error ?? "", /placeholder/);
  }
});

test("empty and whitespace-only input is reported invalid by the pure fn", () => {
  // Form surfaces never call validate for empty values — NPWP is optional
  // there. The pure fn itself stays strict.
  for (const value of ["", "   "]) {
    const r = validateNpwp(value);
    assert.equal(r.valid, false);
    assert.match(r.error ?? "", /empty/);
  }
});

test("normalizeNpwp strips only dots, dashes, and spaces", () => {
  assert.equal(normalizeNpwp("01.234.567.8-901.000"), "012345678901000");
  assert.equal(normalizeNpwp("01 234"), "01234");
  // Non-separator garbage is preserved so validation can reject it.
  assert.equal(normalizeNpwp("01x234"), "01x234");
});

test("formatNpwp formats exactly 15 digits, passes everything else through", () => {
  assert.equal(formatNpwp("012345678901000"), "01.234.567.8-901.000");
  assert.equal(formatNpwp("3171234567890123"), "3171234567890123");
  assert.equal(formatNpwp("123"), "123");
});

test("validation is idempotent over its own normalized output", () => {
  const first = validateNpwp("01.234.567.8-901.000");
  assert.ok(first.valid && first.normalized);
  const second = validateNpwp(first.normalized);
  assert.equal(second.valid, true);
  assert.equal(second.normalized, first.normalized);
  assert.equal(second.formatted, first.formatted);
});

test("hint constant mentions both accepted shapes", () => {
  assert.match(NPWP_FORMAT_HINT, /15-digit/);
  assert.match(NPWP_FORMAT_HINT, /16-digit/);
});
