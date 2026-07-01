/**
 * PLATFORM-ADMIN-ALLOWLIST regression proof (SIGNUP-ESCALATION-FIX, #302/#303).
 *
 * `super_admin` (global user_roles) is minted for EVERY org admin by both
 * provisioning paths, so the cross-tenant platform helpers gate on an explicit
 * `PLATFORM_ADMIN_EMAILS` allowlist ON TOP of the role. The single most
 * important property is FAIL-CLOSED: with the env unset/empty, NO email passes —
 * a regression to fail-OPEN would silently re-grant every tenant admin (and, if
 * public signup is open, every visitor) cross-tenant Platform-OS access.
 *
 * These lock the pure core (require-super-admin-pure.ts) the server helpers call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parsePlatformAdminEmails,
  isPlatformAdminEmailIn,
} from "../src/features/auth/require-super-admin-pure";

test("FAIL-CLOSED: unset/empty/whitespace allowlist admits NO email", () => {
  for (const raw of [undefined, null, "", "   ", ",", " , , "]) {
    assert.equal(
      isPlatformAdminEmailIn("ops@arconique.com", raw),
      false,
      `raw=${JSON.stringify(raw)} must admit nobody`,
    );
    assert.equal(parsePlatformAdminEmails(raw).size, 0);
  }
});

test("admits an exact listed address, rejects an unlisted one", () => {
  const raw = "ops@arconique.com,founder@arconique.com";
  assert.equal(isPlatformAdminEmailIn("ops@arconique.com", raw), true);
  assert.equal(isPlatformAdminEmailIn("founder@arconique.com", raw), true);
  // A tenant admin who also holds super_admin but is NOT on the list.
  assert.equal(isPlatformAdminEmailIn("tenant.admin@somebody.com", raw), false);
});

test("case- and whitespace-insensitive on both the list and the email", () => {
  const raw = "  OPS@Arconique.com , Founder@ARCONIQUE.com ";
  assert.equal(isPlatformAdminEmailIn("ops@arconique.com", raw), true);
  assert.equal(isPlatformAdminEmailIn("  Ops@Arconique.COM  ", raw), true);
  assert.equal(isPlatformAdminEmailIn("FOUNDER@arconique.com", raw), true);
});

test("a null/empty email never passes, even with a populated list", () => {
  const raw = "ops@arconique.com";
  for (const email of [undefined, null, "", "   "]) {
    assert.equal(isPlatformAdminEmailIn(email, raw), false);
  }
});

test("no substring / partial-match escalation", () => {
  const raw = "ops@arconique.com";
  // Must be an exact normalized match — not a prefix/suffix/substring.
  assert.equal(isPlatformAdminEmailIn("evilops@arconique.com", raw), false);
  assert.equal(isPlatformAdminEmailIn("ops@arconique.com.evil.com", raw), false);
  assert.equal(isPlatformAdminEmailIn("ops@arconique.co", raw), false);
});

test("parsePlatformAdminEmails normalizes + dedupes", () => {
  const set = parsePlatformAdminEmails("A@x.com, a@x.com , B@x.com,");
  assert.deepEqual([...set].sort(), ["a@x.com", "b@x.com"]);
});
