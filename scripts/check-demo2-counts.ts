import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1, prepare: false });
  const tables = [
    "villas", "owners", "ownership_shares", "booking_channels", "bookings",
    "investors", "dev_os_inventory_items", "dev_os_purchase_requests",
    "procurement_quotations", "material_purchase_orders", "dev_invoices",
    "site_reports", "maintenance_templates", "maintenance_tickets", "leads",
    "work_packages", "project_tasks", "project_risks",
  ];
  for (const t of tables) {
    try {
      const r = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM ${t}`);
      const rows = r as unknown as Array<{ n: number }>;
      console.log(t.padEnd(28), rows[0]?.n ?? "?");
    } catch (e) {
      console.log(t.padEnd(28), "ERR", (e as Error).message.slice(0, 60));
    }
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
