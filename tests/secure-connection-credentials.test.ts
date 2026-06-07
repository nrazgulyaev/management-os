/**
 * Trust batch #2 — round-trip + legacy-fallback tests for
 * encryption-at-rest of operator connection credentials.
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("sealCredentials → openCredentials round-trips the object", async () => {
  const { sealCredentials, openCredentials, isEncryptedBlob } = await import(
    "../src/lib/secure-connection-credentials"
  );
  const creds = {
    provider: "wise_payments",
    apiToken: "secret-token-xyz",
    profileId: "12345",
    mode: "live",
  };
  const sealed = sealCredentials(creds);
  // The envelope must not contain the plaintext secret anywhere.
  assert.equal(isEncryptedBlob(sealed), true);
  assert.equal(JSON.stringify(sealed).includes("secret-token-xyz"), false);
  const opened = openCredentials<typeof creds>(sealed);
  assert.deepEqual(opened, creds);
});

test("openCredentials passes through legacy plaintext rows unchanged", async () => {
  const { openCredentials, isEncryptedBlob } = await import(
    "../src/lib/secure-connection-credentials"
  );
  const legacy = { provider: "paypal", clientId: "abc", clientSecret: "def" };
  assert.equal(isEncryptedBlob(legacy), false);
  assert.deepEqual(openCredentials(legacy), legacy);
});

test("openCredentials returns null for an empty column", async () => {
  const { openCredentials } = await import(
    "../src/lib/secure-connection-credentials"
  );
  assert.equal(openCredentials(null), null);
  assert.equal(openCredentials(undefined), null);
});

test("a tampered envelope fails closed (throws, never returns plaintext)", async () => {
  const { sealCredentials } = await import(
    "../src/lib/secure-connection-credentials"
  );
  const { decryptCredentials } = await import(
    "../src/lib/channel-manager/credentials-crypto"
  );
  const sealed = sealCredentials({ provider: "stripe", secretKey: "sk_live_x" });
  // Flip a character in the ciphertext — auth tag must reject it.
  const tampered = { ...sealed, c: sealed.c.slice(0, -2) + (sealed.c.endsWith("A") ? "B" : "A") + sealed.c.slice(-1) };
  assert.throws(() =>
    decryptCredentials(
      tampered,
      "arconique:DEV-ONLY:do-not-use-in-prod:32-bytes-minimum",
    ),
  );
});
