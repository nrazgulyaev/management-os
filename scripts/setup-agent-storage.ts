#!/usr/bin/env tsx
/**
 * P5.4.1 AGENT-RAG-SETUP — provision the Supabase Storage bucket that
 * holds raw agent knowledge documents (PDFs, DOCX, MD, TXT) before they
 * are extracted, chunked, and embedded into `agent_knowledge_chunks`.
 *
 * Idempotent — safe to re-run. Creates the bucket if missing and prints
 * the current public/private flag.
 *
 * Bucket policy (high-level):
 *   · Private — no anonymous reads. Super_admin reads via service role;
 *     subscribed orgs never access raw files (they only see retrieved
 *     chunks through the RAG pipeline).
 *   · 50MB file size cap (large enough for tax codes / regulations,
 *     small enough that processing fits in a function invocation).
 *   · Allowed MIMEs: PDF, DOCX, plain text, markdown.
 *
 * RLS policies on `storage.objects` are NOT created by this script —
 * they live in a future migration if/when we hand the bucket to a
 * non-service-role caller. For v1 every read/write goes through the
 * service role from server actions, which already bypasses RLS.
 *
 *   npm run setup:agent-storage
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET_ID = "agent-knowledge-docs";
const FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
    process.exit(2);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("=================================================");
  console.log(` Setup Storage bucket: ${BUCKET_ID}`);
  console.log("=================================================\n");

  const { data: list, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error(`✗ listBuckets failed: ${listErr.message}`);
    process.exit(1);
  }

  const existing = list.find((b) => b.id === BUCKET_ID);

  if (existing) {
    console.log(`  · bucket already exists (id=${existing.id})`);
    const { error: updateErr } = await supabase.storage.updateBucket(
      BUCKET_ID,
      {
        public: false,
        fileSizeLimit: FILE_SIZE_LIMIT,
        allowedMimeTypes: ALLOWED_MIMES,
      },
    );
    if (updateErr) {
      console.error(`✗ updateBucket failed: ${updateErr.message}`);
      process.exit(1);
    }
    console.log("  ✓ policy refreshed (private, 50MB cap, allowed MIMEs).");
  } else {
    const { error: createErr } = await supabase.storage.createBucket(
      BUCKET_ID,
      {
        public: false,
        fileSizeLimit: FILE_SIZE_LIMIT,
        allowedMimeTypes: ALLOWED_MIMES,
      },
    );
    if (createErr) {
      console.error(`✗ createBucket failed: ${createErr.message}`);
      process.exit(1);
    }
    console.log("  ✓ bucket created.");
  }

  console.log("\nAllowed MIME types:");
  for (const m of ALLOWED_MIMES) console.log(`  · ${m}`);
  console.log(`\nFile size limit: ${(FILE_SIZE_LIMIT / 1024 / 1024).toFixed(0)} MB`);
  console.log("\nNext step: super_admin can now upload via the platform UI.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
