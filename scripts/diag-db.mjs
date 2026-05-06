import postgres from "postgres";

console.log("DATABASE_URL set:", !!process.env.DATABASE_URL);
console.log("Host:", process.env.DATABASE_URL?.split("@")[1]?.split("/")[0]);

const sql = postgres(process.env.DATABASE_URL, { 
  max: 1, 
  connect_timeout: 10,
  prepare: false,
});

console.log("\n=== CONNECTION TEST ===");
const t0 = Date.now();
try {
  await sql`SELECT 1`;
  console.log(`OK Connection: ${Date.now() - t0}ms`);
} catch (e) {
  console.error("FAIL Connection:", e.message);
  process.exit(1);
}

console.log("\n=== KEY QUERIES (timed) ===");

const start1 = Date.now();
const r1 = await sql`SELECT count(*)::int as cnt FROM contact_roles WHERE role = 'lead' AND ended_at IS NULL`;
console.log(`active leads count: ${r1[0].cnt} (${Date.now() - start1}ms)`);

const start2 = Date.now();
const r2 = await sql`SELECT id, source_code, source_category, campaign_name FROM lead_sources WHERE is_active = true ORDER BY source_category, source_code`;
console.log(`active lead sources: ${r2.length} (${Date.now() - start2}ms)`);

const start3 = Date.now();
const r3 = await sql`
  SELECT count(*) FILTER (WHERE ended_at IS NULL) AS total,
         count(*) FILTER (WHERE status = 'qualified' AND ended_at IS NULL) AS qualified
  FROM contact_roles WHERE role = 'lead'
`;
console.log(`pipeline metrics: total=${r3[0].total} qualified=${r3[0].qualified} (${Date.now() - start3}ms)`);

const start4 = Date.now();
const r4 = await sql`
  SELECT cr.id, cr.status, c.full_name, c.email
  FROM contact_roles cr
  INNER JOIN contacts c ON c.id = cr.contact_id
  WHERE cr.role = 'lead' AND cr.ended_at IS NULL
  ORDER BY cr.created_at DESC
  LIMIT 20
`;
console.log(`leads with JOIN: ${r4.length} rows (${Date.now() - start4}ms)`);

console.log("\n=== POOL TEST (parallel queries) ===");
const startP = Date.now();
await Promise.all([
  sql`SELECT count(*) FROM contacts`,
  sql`SELECT count(*) FROM contact_roles`,
  sql`SELECT count(*) FROM lead_sources`,
  sql`SELECT count(*) FROM agents`,
  sql`SELECT count(*) FROM projects`,
  sql`SELECT count(*) FROM villas`,
  sql`SELECT count(*) FROM development_project_meta`,
]);
console.log(`OK 7 parallel queries: ${Date.now() - startP}ms`);

await sql.end();
process.exit(0);
