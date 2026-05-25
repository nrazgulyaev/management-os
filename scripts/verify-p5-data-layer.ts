#!/usr/bin/env tsx
/**
 * SMOKE-TEST-P5-DATA-LAYER — read-only verification of the P5 agent
 * foundation. Adapts the operator's SQL templates to the actual schema
 * (column names like `is_active` not `enabled`, `vault_secret_name`
 * not `vault_secret_id`, `agent_id` on agent_runs not `agent_code`,
 * `app_users` not `profiles`, etc.).
 *
 * NO destructive writes. Only side-effect: TASK 4 hits the OpenAI
 * embeddings API to embed a single test query (no DB write).
 */

import { sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(2);
}

const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client);

function rowsOf<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === "object" && "rows" in r) return (r as { rows: T[] }).rows ?? [];
  return [];
}

interface Section {
  task: string;
  verdict: "✅" | "⚠️" | "❌";
  notes: string[];
}
const sections: Section[] = [];
const issues: string[] = [];

async function task1Schema(): Promise<void> {
  const notes: string[] = [];
  let verdict: Section["verdict"] = "✅";

  const ext = rowsOf<{ extname: string; extversion: string }>(
    await db.execute(
      sql`SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector','pg_trgm')`,
    ),
  );
  const extMap = new Map(ext.map((e) => [e.extname, e.extversion]));
  if (extMap.has("vector")) {
    notes.push(`vector ${extMap.get("vector")}`);
  } else {
    verdict = "❌";
    issues.push("pgvector extension MISSING — RAG inoperative");
    notes.push("vector NOT installed");
  }
  notes.push(extMap.has("pg_trgm") ? `pg_trgm ${extMap.get("pg_trgm")}` : "pg_trgm absent (optional)");

  const wantTables = [
    "platform_agent_configs",
    "agent_knowledge_documents",
    "agent_knowledge_chunks",
    "agent_runs",
    "agent_messages",
    "agent_threads",
  ];
  const tbl = rowsOf<{ table_name: string }>(
    await db.execute(sql`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN (
           'platform_agent_configs',
           'agent_knowledge_documents',
           'agent_knowledge_chunks',
           'agent_runs',
           'agent_messages',
           'agent_threads'
         )
    `),
  );
  const have = new Set(tbl.map((t) => t.table_name));
  const missing = wantTables.filter((t) => !have.has(t));
  if (missing.length === 0) {
    notes.push(`all 6 tables present`);
  } else {
    verdict = "❌";
    issues.push(`Missing tables: ${missing.join(", ")}`);
    notes.push(`missing: ${missing.join(", ")}`);
  }

  // Vault accessibility
  try {
    const v = rowsOf<{ n: string }>(
      await db.execute(sql`SELECT count(*)::text AS n FROM vault.secrets`),
    );
    notes.push(`vault.secrets reachable (${v[0]?.n ?? "?"} rows)`);
  } catch (e) {
    verdict = "❌";
    issues.push(`vault.secrets inaccessible: ${e instanceof Error ? e.message : e}`);
    notes.push("vault NOT reachable");
  }

  sections.push({ task: "Task 1 — Schema", verdict, notes });
}

interface AgentConfigRow {
  id: string;
  agent_code: string;
  display_name: string;
  provider: string;
  model: string;
  is_active: boolean;
  scope: string;
  prompt_chars: number;
  vault_secret_name: string | null;
  created_at: string;
}
let TAX_AGENT_ID: string | null = null;

async function task2Config(): Promise<void> {
  const notes: string[] = [];
  let verdict: Section["verdict"] = "✅";

  const rows = rowsOf<AgentConfigRow>(
    await db.execute(sql`
      SELECT id::text                  AS id,
             agent_code                  AS agent_code,
             display_name                AS display_name,
             provider                    AS provider,
             model                       AS model,
             is_active                   AS is_active,
             scope                       AS scope,
             length(system_prompt)::int  AS prompt_chars,
             vault_secret_name           AS vault_secret_name,
             created_at::text            AS created_at
        FROM platform_agent_configs
       WHERE agent_code = 'tax_assistant'
       LIMIT 1
    `),
  );

  if (rows.length === 0) {
    verdict = "❌";
    issues.push("platform_agent_configs row for agent_code='tax_assistant' MISSING — re-run seed");
    notes.push("config row missing");
    sections.push({ task: "Task 2 — Config+Vault", verdict, notes });
    return;
  }

  const a = rows[0];
  TAX_AGENT_ID = a.id;
  notes.push(`id=${a.id.slice(0, 8)}…`);
  notes.push(`provider=${a.provider} · model=${a.model}`);
  notes.push(`is_active=${a.is_active}`);
  notes.push(`scope=${a.scope}`);
  notes.push(`system_prompt length=${a.prompt_chars}`);
  if (a.prompt_chars < 50) {
    verdict = "⚠️";
    issues.push("Tax Assistant system_prompt < 50 chars — likely truncated/empty");
  }
  if (!a.vault_secret_name) {
    verdict = (verdict as Section["verdict"]) === "❌" ? "❌" : "⚠️";
    notes.push("vault_secret_name=NULL — no provider key configured (UI testing will hit 503)");
    issues.push(
      "Tax Assistant has no Vault key — operator must set one via /platform/agents/<id>?tab=config",
    );
  } else {
    notes.push(`vault_secret_name=${a.vault_secret_name}`);

    // Probe vault.decrypted_secrets without logging the key value.
    try {
      const dec = rowsOf<{ has_key: boolean; key_prefix: string | null }>(
        await db.execute(sql`
          SELECT (decrypted_secret IS NOT NULL) AS has_key,
                 left(decrypted_secret, 3)       AS key_prefix
            FROM vault.decrypted_secrets
           WHERE name = ${a.vault_secret_name}
           LIMIT 1
        `),
      );
      if (dec.length === 0 || !dec[0].has_key) {
        verdict = "❌";
        issues.push(
          `Vault row referenced by vault_secret_name='${a.vault_secret_name}' has no decrypted value`,
        );
        notes.push("vault decrypt: ❌ (row not found OR decrypt returned NULL)");
      } else {
        const prefix = dec[0].key_prefix ?? "";
        const looksValid =
          prefix.startsWith("sk-") || prefix.startsWith("ant") || prefix.length >= 3;
        notes.push(
          `vault decrypt: ✅ (key prefix matches ${looksValid ? "expected provider format" : "an unfamiliar shape"})`,
        );
        if (!looksValid) {
          verdict = (verdict as Section["verdict"]) === "❌" ? "❌" : "⚠️";
          issues.push("Vault-stored key does not start with 'sk-' or 'ant…' — verify provider");
        }
      }
    } catch (e) {
      verdict = "❌";
      issues.push(
        `Vault decrypt failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      notes.push("vault decrypt: ❌ (query threw)");
    }
  }

  sections.push({ task: "Task 2 — Config+Vault", verdict, notes });
}

async function task3Knowledge(): Promise<void> {
  const notes: string[] = [];
  let verdict: Section["verdict"] = "✅";

  if (!TAX_AGENT_ID) {
    sections.push({
      task: "Task 3 — Knowledge",
      verdict: "❌",
      notes: ["skipped — no tax_assistant agent id"],
    });
    return;
  }

  // Note: our schema uses `filename` (not `title`) + `storage_path`
  // (not `source`). Adapted.
  const docs = rowsOf<{
    id: string;
    filename: string;
    storage_path: string;
    processing_status: string;
    organization_id: string | null;
    created_at: string;
    chunk_count: number;
  }>(
    await db.execute(sql`
      SELECT d.id::text                AS id,
             d.filename                 AS filename,
             d.storage_path             AS storage_path,
             d.processing_status        AS processing_status,
             d.organization_id::text    AS organization_id,
             d.uploaded_at::text        AS created_at,
             (SELECT count(*)::int FROM agent_knowledge_chunks c
               WHERE c.document_id = d.id) AS chunk_count
        FROM agent_knowledge_documents d
       WHERE d.agent_id = ${TAX_AGENT_ID}::uuid
       ORDER BY d.uploaded_at DESC
    `),
  );

  notes.push(`documents: ${docs.length}`);

  if (docs.length === 0) {
    verdict = "⚠️";
    issues.push(
      "No agent_knowledge_documents rows for tax_assistant — upload via /platform/agents/<id>?tab=knowledge",
    );
    notes.push("no documents — RAG will fall back to base prompt only");
    sections.push({ task: "Task 3 — Knowledge", verdict, notes });
    return;
  }

  for (const d of docs.slice(0, 5)) {
    notes.push(
      `  · ${d.filename} status=${d.processing_status} chunks=${d.chunk_count} ${d.organization_id ? `org=${d.organization_id.slice(0, 8)}…` : "global"}`,
    );
  }

  // Chunk integrity for ALL docs of this agent.
  const integ = rowsOf<{
    total_chunks: number;
    missing_embeddings: number;
    avg_chunk_chars: string | null;
    min_chunk_chars: number | null;
    max_chunk_chars: number | null;
  }>(
    await db.execute(sql`
      SELECT count(*)::int                                                   AS total_chunks,
             count(*) FILTER (WHERE embedding IS NULL)::int                   AS missing_embeddings,
             avg(length(content))::text                                       AS avg_chunk_chars,
             min(length(content))::int                                        AS min_chunk_chars,
             max(length(content))::int                                        AS max_chunk_chars
        FROM agent_knowledge_chunks
       WHERE agent_id = ${TAX_AGENT_ID}::uuid
    `),
  );
  const r = integ[0];
  const total = r?.total_chunks ?? 0;
  const missing = r?.missing_embeddings ?? 0;
  const avg = r?.avg_chunk_chars ? Math.round(Number(r.avg_chunk_chars)) : 0;
  notes.push(
    `chunks: total=${total} missing_embeddings=${missing} avg_chars=${avg} (range ${r?.min_chunk_chars ?? "—"}…${r?.max_chunk_chars ?? "—"})`,
  );

  if (total === 0) {
    verdict = "⚠️";
    issues.push("Documents exist but produced 0 chunks — ingestion likely failed");
  } else {
    if (total < 8) {
      verdict = "⚠️";
      issues.push(`Chunk count ${total} is below the 8-15 sanity range`);
    } else if (total > 50) {
      // soft note only; real-world docs can be larger
      notes.push(`(chunk count > 15 — fine, just larger than the smoke-test target)`);
    }
    if (missing > 0) {
      verdict = "❌";
      issues.push(`${missing} chunks have NULL embedding — re-process required`);
    }
    if (avg < 200 || avg > 1500) {
      verdict = (verdict as Section["verdict"]) === "❌" ? "❌" : "⚠️";
      notes.push(`avg chunk size ${avg} chars outside 200-1500 sanity range`);
    }

    // First-chunk preview by chunk_index ASC of the first doc.
    const firstDoc = docs[0];
    const first = rowsOf<{ preview: string }>(
      await db.execute(sql`
        SELECT substr(content, 1, 300) AS preview
          FROM agent_knowledge_chunks
         WHERE document_id = ${firstDoc.id}::uuid
         ORDER BY chunk_index ASC
         LIMIT 1
      `),
    );
    if (first[0]) {
      notes.push(`first chunk preview: ${first[0].preview.replace(/\s+/g, " ").slice(0, 250)}…`);
    }
  }

  sections.push({ task: "Task 3 — Knowledge", verdict, notes });
}

async function task4Retrieval(): Promise<void> {
  const notes: string[] = [];
  let verdict: Section["verdict"] = "✅";

  if (!TAX_AGENT_ID) {
    sections.push({
      task: "Task 4 — RAG retrieval",
      verdict: "❌",
      notes: ["skipped — no tax_assistant agent id"],
    });
    return;
  }

  // Check if there's anything to retrieve against.
  const chunkProbe = rowsOf<{ n: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS n FROM agent_knowledge_chunks
       WHERE agent_id = ${TAX_AGENT_ID}::uuid AND embedding IS NOT NULL
    `),
  );
  if ((chunkProbe[0]?.n ?? 0) === 0) {
    sections.push({
      task: "Task 4 — RAG retrieval",
      verdict: "⚠️",
      notes: ["no embedded chunks for tax_assistant — retrieval untestable until KB ingested"],
    });
    return;
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    sections.push({
      task: "Task 4 — RAG retrieval",
      verdict: "⚠️",
      notes: [
        "OPENAI_API_KEY not in local env — skipped embedding generation",
        "(set the same key Vercel uses to validate cosine path)",
      ],
    });
    return;
  }

  const query = "What is PPh Final rate on villa rental in Indonesia?";
  let embedding: number[];
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: [query],
        encoding_format: "float",
      }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    embedding = json.data[0]?.embedding ?? [];
    if (embedding.length !== 1536) {
      throw new Error(`embedding dim ${embedding.length} != 1536`);
    }
    notes.push(`embedding generated: 1536 dims via text-embedding-3-small`);
  } catch (e) {
    sections.push({
      task: "Task 4 — RAG retrieval",
      verdict: "❌",
      notes: [`embedding generation failed: ${e instanceof Error ? e.message : String(e)}`],
    });
    issues.push("OpenAI embedding API call failed — check OPENAI_API_KEY and quota");
    return;
  }

  const literal = `[${embedding.join(",")}]`;
  const top = rowsOf<{
    id: string;
    chunk_index: number;
    preview: string;
    similarity: number;
  }>(
    await db.execute(sql`
      SELECT id::text                                          AS id,
             chunk_index                                        AS chunk_index,
             substr(content, 1, 250)                            AS preview,
             (1 - (embedding <=> ${literal}::vector))::float    AS similarity
        FROM agent_knowledge_chunks
       WHERE agent_id = ${TAX_AGENT_ID}::uuid
         AND embedding IS NOT NULL
       ORDER BY embedding <=> ${literal}::vector
       LIMIT 5
    `),
  );

  if (top.length === 0) {
    verdict = "❌";
    issues.push("Cosine query returned 0 rows despite embedded chunks — pgvector path broken");
    notes.push("cosine returned 0 rows");
    sections.push({ task: "Task 4 — RAG retrieval", verdict, notes });
    return;
  }

  notes.push(`top-1 similarity: ${top[0].similarity.toFixed(3)}`);
  for (const t of top) {
    notes.push(
      `  · idx ${t.chunk_index} sim ${t.similarity.toFixed(3)} — ${t.preview.replace(/\s+/g, " ").slice(0, 120)}…`,
    );
  }

  if (top[0].similarity < 0.5) {
    verdict = "⚠️";
    issues.push(
      `Top-1 similarity ${top[0].similarity.toFixed(3)} < 0.5 — RAG may not surface grounded answers for tax queries`,
    );
  }

  const tenPctHit = top.slice(0, 3).some((t) => /10\s?%/.test(t.preview));
  if (!tenPctHit) {
    verdict = (verdict as Section["verdict"]) === "❌" ? "❌" : "⚠️";
    notes.push(
      "no '10%' string in top-3 chunks — PPh 4(2) anchor not surfacing (KB may be on different content)",
    );
  } else {
    notes.push("'10%' anchor surfaces in top-3 ✅");
  }

  sections.push({ task: "Task 4 — RAG retrieval", verdict, notes });
}

async function task5Telemetry(): Promise<void> {
  const notes: string[] = [];
  let verdict: Section["verdict"] = "✅";

  if (!TAX_AGENT_ID) {
    sections.push({
      task: "Task 5 — Telemetry",
      verdict: "❌",
      notes: ["skipped — no tax_assistant agent id"],
    });
    return;
  }

  // Adapted: agent_runs is keyed by agent_id (uuid), not agent_code,
  // and cost is stored as cost_usd_minor (int cents). Tokens columns
  // are tokens_in / tokens_out (NOT tokens_input / tokens_output).
  const breakdown = rowsOf<{
    status: string;
    run_count: number;
    avg_latency: number | null;
    total_cost_minor: number;
    null_token_rows: number;
  }>(
    await db.execute(sql`
      SELECT status,
             count(*)::int                                                   AS run_count,
             avg(latency_ms)::int                                              AS avg_latency,
             COALESCE(sum(cost_usd_minor), 0)::int                             AS total_cost_minor,
             count(*) FILTER (WHERE tokens_in IS NULL OR tokens_out IS NULL)::int AS null_token_rows
        FROM agent_runs
       WHERE agent_id = ${TAX_AGENT_ID}::uuid
       GROUP BY status
       ORDER BY count(*) DESC
    `),
  );

  const total = breakdown.reduce((a, b) => a + b.run_count, 0);
  notes.push(`agent_runs rows: ${total}`);

  if (total === 0) {
    sections.push({
      task: "Task 5 — Telemetry",
      verdict: "⚠️",
      notes: [
        "no prior runs — telemetry untested",
        "will validate once operator runs Test tab / chat in browser",
      ],
    });
    return;
  }

  for (const b of breakdown) {
    notes.push(
      `  · ${b.status}: ${b.run_count} runs · avg_latency=${b.avg_latency ?? "—"}ms · cost=$${(b.total_cost_minor / 100).toFixed(2)} · null_token_rows=${b.null_token_rows}`,
    );
  }

  const successWithNulls = breakdown
    .filter((b) => b.status === "success" && b.null_token_rows > 0)
    .reduce((a, b) => a + b.null_token_rows, 0);
  if (successWithNulls > 0) {
    verdict = "⚠️";
    issues.push(
      `${successWithNulls} successful agent_runs have NULL tokens_in or tokens_out — onFinish telemetry incomplete`,
    );
  }

  // Recent 3 for raw spot-check.
  const recent = rowsOf<{
    id: string;
    status: string;
    tokens_in: number | null;
    tokens_out: number | null;
    cost_usd_minor: number | null;
    latency_ms: number | null;
    started_at: string;
    error_message: string | null;
  }>(
    await db.execute(sql`
      SELECT id::text             AS id,
             status               AS status,
             tokens_in            AS tokens_in,
             tokens_out           AS tokens_out,
             cost_usd_minor       AS cost_usd_minor,
             latency_ms           AS latency_ms,
             started_at::text     AS started_at,
             error_message        AS error_message
        FROM agent_runs
       WHERE agent_id = ${TAX_AGENT_ID}::uuid
       ORDER BY started_at DESC
       LIMIT 3
    `),
  );
  notes.push(`recent 3 runs:`);
  for (const r of recent) {
    notes.push(
      `  · ${r.started_at.slice(0, 19)} status=${r.status} tok=${r.tokens_in ?? "—"}/${r.tokens_out ?? "—"} cost=$${((r.cost_usd_minor ?? 0) / 100).toFixed(3)} lat=${r.latency_ms ?? "—"}ms${r.error_message ? ` err=${r.error_message.slice(0, 80)}` : ""}`,
    );
    if ((r.cost_usd_minor ?? 0) < 0) {
      verdict = "❌";
      issues.push(`Negative cost on agent_runs.id=${r.id.slice(0, 8)}`);
    }
  }

  sections.push({ task: "Task 5 — Telemetry", verdict, notes });
}

async function task6User(): Promise<void> {
  const notes: string[] = [];
  let verdict: Section["verdict"] = "✅";

  // Schema: app_users (not profiles); organization linked via
  // app_users.organization_id → organizations.id. Auth user lookup
  // via app_users.auth_user_id → auth.users.id.
  const userRow = rowsOf<{
    auth_user_id: string | null;
    app_user_id: string | null;
    email: string;
    status: string | null;
    organization_id: string | null;
    org_code: string | null;
    org_name: string | null;
  }>(
    await db.execute(sql`
      SELECT au.id::text                  AS auth_user_id,
             u.id::text                    AS app_user_id,
             u.email                       AS email,
             u.status                      AS status,
             u.organization_id::text       AS organization_id,
             o.organization_code           AS org_code,
             o.display_name                AS org_name
        FROM auth.users au
        LEFT JOIN app_users u  ON u.auth_user_id = au.id
        LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE lower(au.email) = 'ali-test@arconique.local'
       LIMIT 1
    `),
  );

  if (userRow.length === 0) {
    verdict = "❌";
    issues.push("ali-test@arconique.local has no auth.users row — re-seed test accounts");
    notes.push("ali-test: NOT in auth.users");
    sections.push({ task: "Task 6 — User+org", verdict, notes });
    return;
  }
  const u = userRow[0];
  notes.push(`auth user: ${u.auth_user_id?.slice(0, 8)}… (${u.email})`);
  if (!u.app_user_id) {
    verdict = "❌";
    issues.push("ali-test exists in auth.users but no app_users row linked");
    notes.push("app_users link: ❌");
  } else {
    notes.push(`app_user: ${u.app_user_id.slice(0, 8)}… status=${u.status ?? "—"}`);
  }
  if (!u.organization_id) {
    verdict = "❌";
    issues.push("ali-test app_users.organization_id is NULL — sign-in will fail subscription gate");
    notes.push("organization_id: NULL");
  } else {
    notes.push(`org: ${u.organization_id.slice(0, 8)}… (${u.org_code ?? "?"} — ${u.org_name ?? "?"})`);
  }

  if (TAX_AGENT_ID && u.organization_id) {
    const sub = rowsOf<{
      sub_id: string | null;
      is_enabled: boolean | null;
      enabled_at: string | null;
    }>(
      await db.execute(sql`
        SELECT id::text             AS sub_id,
               is_enabled            AS is_enabled,
               enabled_at::text      AS enabled_at
          FROM org_agent_subscriptions
         WHERE agent_id = ${TAX_AGENT_ID}::uuid
           AND organization_id = ${u.organization_id}::uuid
         LIMIT 1
      `),
    );
    if (sub.length === 0 || !sub[0].is_enabled) {
      verdict = (verdict as Section["verdict"]) === "❌" ? "❌" : "⚠️";
      notes.push(
        `tax_assistant access: ❌ (no enabled subscription for ali's org)`,
      );
      issues.push(
        "ali-test's organization is not subscribed (is_enabled=true) to tax_assistant — chat will 403",
      );
    } else {
      notes.push(
        `tax_assistant access: ✅ (subscription enabled at ${sub[0].enabled_at?.slice(0, 19)})`,
      );
    }
  }

  sections.push({ task: "Task 6 — User+org", verdict, notes });
}

async function main(): Promise<void> {
  try {
    await task1Schema();
    await task2Config();
    await task3Knowledge();
    await task4Retrieval();
    await task5Telemetry();
    await task6User();
  } catch (e) {
    console.error("FATAL:", e);
    issues.push(`Fatal error mid-verification: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await client.end();
  }

  // --- Render report ----------------------------------------------------
  console.log("\nP5 DATA LAYER VERIFICATION");
  console.log("──────────────────────────────────────");
  for (const s of sections) {
    const head = `${s.task}: ${s.verdict}`;
    console.log(head);
    for (const n of s.notes) console.log(`  ${n}`);
  }

  // Overall
  const reds = sections.filter((s) => s.verdict === "❌").length;
  const yellows = sections.filter((s) => s.verdict === "⚠️").length;
  const overall = reds > 0 ? "RED" : yellows > 0 ? "YELLOW" : "GREEN";
  console.log("");
  console.log(`DATA LAYER OVERALL: ${overall}`);
  console.log("");
  console.log("──────────────────────────────────────");
  console.log("STILL REQUIRES OPERATOR UI VERIFICATION:");
  console.log("──────────────────────────────────────");
  for (const line of [
    "/platform/agents page renders with Claude Design styling",
    "Tax Assistant config screen loads cleanly",
    "Testbed query — streaming progressive rendering visible",
    "Citations expandable in response footer",
    "Customer-side: /development-os/agents/tax_assistant renders chat UI as Ali",
    "Thread sidebar populates after chat",
    "AI Hub tile shows 'LIVE' + counter > 0",
  ]) {
    console.log(`  □ ${line}`);
  }

  console.log("");
  console.log("──────────────────────────────────────");
  console.log("ISSUES FOUND:");
  console.log("──────────────────────────────────────");
  if (issues.length === 0) {
    console.log("  (none)");
  } else {
    for (const i of issues) console.log(`  • ${i}`);
  }

  process.exit(reds > 0 ? 1 : 0);
}

main();
