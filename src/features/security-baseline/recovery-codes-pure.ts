/**
 * Prompt 111 — Pure helpers for MFA recovery codes.  No DB, no
 * `server-only`.  Codes are human-readable (`ARQ-XXXX-XXXX`).  Only
 * the SHA-256 hash is persisted; the plaintext code is shown to the
 * user exactly once.
 */

import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0/O/1/I — easier to type.
const PREFIX = "ARQ";
const GROUPS = 2;
const GROUP_LENGTH = 4;
const DEFAULT_COUNT = 10;
const HASH_SALT = "arconique:mfa:recovery-code:v1";

function pickFromAlphabet(byte: number): string {
  return ALPHABET[byte % ALPHABET.length];
}

export function generateRecoveryCode(): string {
  const bytes = randomBytes(GROUPS * GROUP_LENGTH);
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = "";
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += pickFromAlphabet(bytes[g * GROUP_LENGTH + i]);
    }
    groups.push(group);
  }
  return `${PREFIX}-${groups.join("-")}`;
}

export function generateRecoveryCodes(count = DEFAULT_COUNT): string[] {
  const seen = new Set<string>();
  while (seen.size < count) {
    seen.add(generateRecoveryCode());
  }
  return Array.from(seen);
}

/**
 * Pure: hash a recovery code for at-rest storage.  The salt + prefix
 * makes the hash space distinct from any other SHA-256 hash in the
 * codebase, and makes it cheap to recompute on verify.
 */
export function hashRecoveryCode(code: string): string {
  const normalised = code.trim().toUpperCase().replace(/\s+/g, "");
  return createHash("sha256")
    .update(`${HASH_SALT}:${normalised}`, "utf8")
    .digest("hex");
}

/**
 * Pure: return true iff the submitted code matches one of the stored
 * hashes.  Caller is responsible for marking the matched row as
 * `used`.
 */
export function verifyRecoveryCodeHash(
  code: string,
  storedHashes: ReadonlyArray<string>,
): { ok: boolean; matchedHash: string | null } {
  const candidate = hashRecoveryCode(code);
  for (const stored of storedHashes) {
    if (candidate === stored) return { ok: true, matchedHash: stored };
  }
  return { ok: false, matchedHash: null };
}

export const RECOVERY_CODE_FORMAT = {
  prefix: PREFIX,
  groups: GROUPS,
  groupLength: GROUP_LENGTH,
  default_count: DEFAULT_COUNT,
};
