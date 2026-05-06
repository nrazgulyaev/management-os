import "server-only";

import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { devFxSnapshots } from "@/lib/db/schema/dev-finance";

const recordSchema = z.object({
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baseCurrency: z.literal("USD").default("USD"),
  rateIdr: z.string().regex(/^\d+(\.\d+)?$/),
  rateRub: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional()
    .nullable(),
  rateEur: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional()
    .nullable(),
  rateUsdt: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .default("1.0"),
  rateCny: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional()
    .nullable(),
  source: z
    .enum(["manual", "api", "wise", "xe", "custom"])
    .default("manual"),
  notes: z.string().optional().nullable(),
});

export async function recordFXSnapshot(
  input: z.input<typeof recordSchema>,
): Promise<{ id: string; snapshotDate: string }> {
  const parsed = recordSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(devFxSnapshots)
    .values({
      snapshotDate: parsed.snapshotDate,
      baseCurrency: parsed.baseCurrency,
      rateIdr: parsed.rateIdr,
      rateRub: parsed.rateRub ?? null,
      rateEur: parsed.rateEur ?? null,
      rateUsdt: parsed.rateUsdt,
      rateCny: parsed.rateCny ?? null,
      source: parsed.source,
      notes: parsed.notes ?? null,
    })
    .returning({
      id: devFxSnapshots.id,
      snapshotDate: devFxSnapshots.snapshotDate,
    });
  return { id: row.id, snapshotDate: String(row.snapshotDate) };
}

export async function bulkRecordFXSnapshots(
  rows: z.input<typeof recordSchema>[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const input of rows) {
    try {
      await recordFXSnapshot(input);
      inserted += 1;
    } catch (err) {
      const msg = String(err);
      if (msg.includes("duplicate key") || msg.includes("UNIQUE")) {
        skipped += 1;
      } else {
        throw err;
      }
    }
  }
  return { inserted, skipped };
}
