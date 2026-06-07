/**
 * Trust batch #2 — one-time backfill: encrypt existing plaintext
 * connection credentials at rest.
 *
 * Payment-processor, banking, and marketing connections historically
 * stored their provider credentials blob as PLAINTEXT JSONB. The app now
 * seals new/updated connections (AES-256-GCM via STAY_LINK_KMS_SECRET)
 * and reads through `openCredentials()`, which transparently handles both
 * encrypted and legacy-plaintext rows — so nothing breaks before this
 * runs. This script upgrades the remaining legacy rows so NOTHING sits
 * plaintext at rest.
 *
 * Idempotent: rows already carrying an `{v,k,c}` envelope are skipped, so
 * it is safe to run repeatedly.
 *
 * Run (production):
 *   npm run backfill:encrypt-credentials
 *
 * REQUIRES `STAY_LINK_KMS_SECRET` to be set (same secret the app uses).
 * In production, sealing fail-closes if it is missing.
 */

import postgres from "postgres";
import {
  sealCredentials,
  isEncryptedBlob,
  resolveConnectionSecret,
} from "@/lib/secure-connection-credentials";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL / DATABASE_URL not set — cannot connect.");
  process.exit(1);
}

const TABLES: Array<{ table: string; label: string }> = [
  { table: "payment_processor_connections", label: "payments" },
  { table: "bank_connections", label: "banking" },
  { table: "marketing_connections", label: "marketing" },
];

async function main() {
  // Fail loudly here rather than mid-loop if the secret is missing.
  resolveConnectionSecret();

  const sql = postgres(url!, { max: 1, prepare: false });
  let grandTotal = 0;
  try {
    for (const { table, label } of TABLES) {
      const rows = await sql<Array<{ id: string; credentials: unknown }>>`
        SELECT id, credentials FROM ${sql(table)}
        WHERE credentials IS NOT NULL
      `;
      let sealed = 0;
      let alreadyEncrypted = 0;
      for (const row of rows) {
        if (row.credentials == null) continue;
        if (isEncryptedBlob(row.credentials)) {
          alreadyEncrypted++;
          continue;
        }
        const blob = sealCredentials(row.credentials);
        await sql`
          UPDATE ${sql(table)}
          SET credentials = ${sql.json(blob as never)},
              updated_at = now()
          WHERE id = ${row.id}
        `;
        sealed++;
      }
      grandTotal += sealed;
      console.log(
        `${label.padEnd(10)} sealed ${sealed}, already-encrypted ${alreadyEncrypted} (of ${rows.length} rows)`,
      );
    }
    console.log(`\nDone. ${grandTotal} credential blob(s) newly encrypted at rest.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
