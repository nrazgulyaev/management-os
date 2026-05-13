/**
 * Sprint 3b — Stripe provisioning script.
 *
 * For every row in `plan_packaging` that has no `stripe_product_id`
 * yet AND is paid (monthly_price_minor > 0):
 *
 *   1. POST /v1/products            create the product
 *   2. POST /v1/prices              create the monthly price
 *   3. POST /v1/prices              create the annual price
 *   4. UPDATE plan_packaging        write the three IDs back
 *
 * Enterprise packagings are skipped (custom pricing — no Stripe SKU).
 *
 * Idempotent: re-running with the IDs already populated is a no-op
 * (single SELECT, no writes). Adding a new packaging row + re-running
 * provisions only the new one.
 *
 * Safe by default — runs in `--dry-run` mode unless `--apply` is
 * explicitly passed. Dry-run prints exactly the requests it would
 * make against Stripe and exits without DB writes.
 *
 * Usage:
 *
 *   tsx scripts/stripe-provision.ts                    # dry-run
 *   tsx scripts/stripe-provision.ts --apply            # for real
 *   tsx scripts/stripe-provision.ts --apply --only=mgmt-only-pro
 *
 * Requires `STRIPE_SECRET_KEY` in env. Use a `sk_test_…` key for the
 * first run; promote to `sk_live_…` only after Stripe Dashboard
 * confirms the products + prices look right.
 */

import { eq, isNull, and, gt } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  planPackaging,
  type PlanPackaging,
} from "../src/lib/db/schema/subscriptions";

// ============================================================================
// CLI parsing
// ============================================================================

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const onlyArg = args.find((a) => a.startsWith("--only="));
const onlyPackaging = onlyArg ? onlyArg.split("=")[1] : null;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_API_BASE =
  process.env.STRIPE_API_BASE ?? "https://api.stripe.com";

function exitWith(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

if (apply && !STRIPE_SECRET_KEY) {
  exitWith(
    "STRIPE_SECRET_KEY is required when --apply is set. Use a sk_test_… key " +
      "for the first run; promote to sk_live_… only after the Stripe " +
      "Dashboard confirms the products + prices look right.",
  );
}

const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  exitWith(
    "DIRECT_URL (preferred) or DATABASE_URL must be set. Copy .env.example to .env.local first.",
  );
}

// ============================================================================
// Stripe HTTP — minimal wrapper, form-encoded bodies
// ============================================================================

function formEncode(body: Record<string, unknown>): string {
  // Stripe accepts nested objects via PHP-style brackets:
  //   metadata[packaging_key]=mgmt-only-pro
  //   recurring[interval]=month
  // We only need one level deep.
  const parts: string[] = [];
  function push(key: string, value: unknown) {
    if (value === null || value === undefined) return;
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        push(`${key}[${k}]`, v);
      }
      return;
    }
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }
  for (const [k, v] of Object.entries(body)) push(k, v);
  return parts.join("&");
}

async function stripePost(
  path: string,
  body: Record<string, unknown>,
): Promise<{ id: string } & Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formEncode(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(
      `Stripe ${path} → ${res.status}: ${err?.message ?? JSON.stringify(json)}`,
    );
  }
  return json as { id: string } & Record<string, unknown>;
}

// ============================================================================
// Provisioning per row
// ============================================================================

interface ProvisioningPlan {
  packagingKey: string;
  productPayload: Record<string, unknown>;
  monthlyPricePayload: Record<string, unknown>;
  annualPricePayload: Record<string, unknown>;
}

function buildProvisioningPlan(row: PlanPackaging): ProvisioningPlan {
  const productName =
    row.planKind === "bundle"
      ? `Arconique Bundle · ${capitalize(row.tierKey)}`
      : row.planKind === "management-only"
        ? `Arconique Management OS · ${capitalize(row.tierKey)}`
        : `Arconique Development OS · ${capitalize(row.tierKey)}`;

  const productPayload: Record<string, unknown> = {
    name: productName,
    metadata: {
      packaging_key: row.packagingKey,
      plan_kind: row.planKind,
      tier_key: row.tierKey,
      plan_code: row.planCode,
      products_enabled: row.productsEnabled.join(","),
    },
  };

  const monthlyPricePayload: Record<string, unknown> = {
    currency: row.currency.toLowerCase(),
    unit_amount: Number(row.monthlyPriceMinor),
    recurring: { interval: "month" },
    metadata: {
      packaging_key: row.packagingKey,
      cycle: "monthly",
    },
  };

  const annualPricePayload: Record<string, unknown> = {
    currency: row.currency.toLowerCase(),
    unit_amount: Number(row.annualPriceMinor),
    recurring: { interval: "year" },
    metadata: {
      packaging_key: row.packagingKey,
      cycle: "annual",
    },
  };

  return {
    packagingKey: row.packagingKey,
    productPayload,
    monthlyPricePayload,
    annualPricePayload,
  };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const client = postgres(dbUrl!, { max: 1 });
  const db = drizzle(client);

  console.log(
    `[stripe-provision] mode=${apply ? "APPLY" : "DRY-RUN"}` +
      (onlyPackaging ? ` only=${onlyPackaging}` : ""),
  );

  // Read every paid packaging that hasn't been provisioned yet.
  const rows = await db
    .select()
    .from(planPackaging)
    .where(
      and(
        isNull(planPackaging.stripeProductId),
        gt(planPackaging.monthlyPriceMinor, 0n),
      ),
    );

  const filtered = onlyPackaging
    ? rows.filter((r) => r.packagingKey === onlyPackaging)
    : rows;

  if (filtered.length === 0) {
    console.log(
      "[stripe-provision] nothing to do — all paid packagings already have stripe_product_id, or --only filter matched zero rows.",
    );
    await client.end({ timeout: 5 });
    return;
  }

  console.log(
    `[stripe-provision] ${filtered.length} packaging row(s) to provision.`,
  );

  let success = 0;
  let failed = 0;

  for (const row of filtered) {
    const plan = buildProvisioningPlan(row);
    console.log(`\n--- ${row.packagingKey} (${row.planCode}) ---`);
    console.log(
      `  product   : ${JSON.stringify(plan.productPayload)}`,
    );
    console.log(
      `  monthly   : ${JSON.stringify(plan.monthlyPricePayload)}`,
    );
    console.log(
      `  annual    : ${JSON.stringify(plan.annualPricePayload)}`,
    );

    if (!apply) {
      console.log("  → dry-run, skipping Stripe + DB writes.");
      success++;
      continue;
    }

    try {
      const product = await stripePost("/v1/products", plan.productPayload);
      const monthlyPrice = await stripePost("/v1/prices", {
        ...plan.monthlyPricePayload,
        product: product.id,
      });
      const annualPrice = await stripePost("/v1/prices", {
        ...plan.annualPricePayload,
        product: product.id,
      });

      console.log(`  ✓ product       = ${product.id}`);
      console.log(`  ✓ monthly price = ${monthlyPrice.id}`);
      console.log(`  ✓ annual price  = ${annualPrice.id}`);

      await db
        .update(planPackaging)
        .set({
          stripeProductId: product.id,
          stripeMonthlyPriceId: monthlyPrice.id,
          stripeAnnualPriceId: annualPrice.id,
          stripeProvisionedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(planPackaging.id, row.id));
      success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${msg}`);
      failed++;
    }
  }

  console.log(
    `\n[stripe-provision] done — ${success} provisioned, ${failed} failed.`,
  );
  await client.end({ timeout: 5 });
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
