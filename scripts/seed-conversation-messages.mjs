/**
 * Standalone, idempotent seeder for sales conversation transcripts
 * (sales_conversation_messages, migration 0184).
 *
 * WHY STANDALONE: the full dev-OS seed (seed-dev-os.mjs) predates the tenancy
 * org-NOT-NULL migrations and crashes early on tables whose organization_id is
 * now required (e.g. investors). This script touches ONLY the transcript table,
 * stamping each message with its parent thread's org, so demo transcripts can
 * be seeded without the broken full seed. Run:  npm run db:seed:conversations
 */
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No DIRECT_URL / DATABASE_URL in env.");
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false });

const sampleConvo = [
  { dir: "inbound", sender: "Prospect", body: "Hi, saw your villa listing — is unit A3 still available?" },
  { dir: "outbound", sender: null, body: "Hello! Yes, A3 is available. Would you like to schedule a viewing?" },
  { dir: "inbound", sender: "Prospect", body: "What's the price and the payment plan?" },
  { dir: "outbound", sender: null, body: "USD 285k, on a 30/40/30 milestone plan. I'll send the full breakdown." },
  { dir: "inbound", sender: "Prospect", body: "Please do. Freehold or leasehold?" },
  { dir: "outbound", sender: null, body: "Leasehold, 30 years extendable. Sending the brochure now." },
];

async function main() {
  const threads = await sql`
    SELECT id, organization_id, conversation_start_at
      FROM sales_conversation_threads
  `;
  if (threads.length === 0) {
    console.log(
      "No sales_conversation_threads found — nothing to seed. (Threads are created by the full dev-OS seed or by the app.)",
    );
    return;
  }

  let msgCnt = 0;
  let threadsSeeded = 0;
  for (const th of threads) {
    const existing = await sql`
      SELECT id FROM sales_conversation_messages WHERE thread_id = ${th.id} LIMIT 1
    `;
    if (existing[0]) continue; // idempotent: skip threads that already have a transcript
    const base = new Date(th.conversation_start_at).getTime();
    for (let j = 0; j < sampleConvo.length; j++) {
      const m = sampleConvo[j];
      const occurredAt = new Date(base + j * 3600 * 1000).toISOString();
      await sql`
        INSERT INTO sales_conversation_messages (
          organization_id, thread_id, channel_type, direction, sender_name, body, occurred_at
        ) VALUES (
          ${th.organization_id}, ${th.id}, 'whatsapp', ${m.dir}, ${m.sender}, ${m.body}, ${occurredAt}
        )
      `;
      msgCnt++;
    }
    await sql`
      UPDATE sales_conversation_threads
         SET total_message_count = ${sampleConvo.length}
       WHERE id = ${th.id}
    `;
    threadsSeeded++;
  }
  console.log(
    `✓ sales_conversation_messages — seeded ${msgCnt} messages across ${threadsSeeded} thread(s) (${threads.length - threadsSeeded} already had a transcript).`,
  );
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
