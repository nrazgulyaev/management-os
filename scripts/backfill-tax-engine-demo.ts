#!/usr/bin/env tsx
/**
 * scripts/backfill-tax-engine-demo.ts
 *
 * One-time backfill of tax_event_calculations for existing bookings.
 * Currently demo data only — production orgs have no bookings yet.
 *
 * For each booking:
 *   1. Look up org's tax_profile (regency, PKP status, entity_type)
 *   2. Look up org's active tax activations (which platform taxes apply)
 *   3. Look up effective rates at the booking's payment date
 *   4. Calculate line items
 *   5. Insert tax_event_calculations row (skip if already exists)
 *
 * Idempotency:
 *   Checks tax_event_calculations.source_id = booking.id; if exists, skip.
 *   Pass --force flag to recalculate (writes recalculated_at + audit notes).
 *
 * Usage:
 *   tsx scripts/backfill-tax-engine-demo.ts            # dry-run by default
 *   tsx scripts/backfill-tax-engine-demo.ts --apply    # actually write
 *   tsx scripts/backfill-tax-engine-demo.ts --apply --force  # overwrite existing
 *
 * Reference: docs/briefs/tax-engine-v1.md §7 (Workflow A), §8 (backfill in scope)
 */

import { createClient } from '@supabase/supabase-js';

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

// ----------------------------------------------------------------------------
// Environment
// ----------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ----------------------------------------------------------------------------
// Types (mirror the schema)
// ----------------------------------------------------------------------------

interface Booking {
  id: string;
  organization_id: string;
  // TODO: confirm exact column names in bookings table
  payment_received_at: string | null;
  check_in_date: string | null;
  gross_amount: number | null;
  currency: string | null;
  guest_country: string | null;
  guest_entity_type: string | null;
}

interface TaxProfile {
  org_id: string;
  regency_id: string | null;
  pkp_status: boolean;
  pkp_effective_date: string | null;
  entity_type: string;
}

interface TaxActivation {
  tax_definition_id: string;
  custom_rate_percent: number | null;
  custom_payer: string | null;
  custom_payer_logic: any | null;
  effective_from: string;
  effective_to: string | null;
}

interface TaxDefinition {
  id: string;
  code: string;
  name: string;
  trigger_event: string;
  default_payer: string;
  conditional_logic: any | null;
  applies_to: string[];
  legal_basis: string | null;
}

interface TaxRate {
  tax_definition_id: string;
  regency_id: string | null;
  rate_percent: number | null;
  rate_fixed_amount: number | null;
  effective_from: string;
  effective_to: string | null;
}

interface LineItem {
  tax_def_source: 'platform' | 'org_custom';
  tax_def_id: string;
  code: string;
  name: string;
  rate_percent: number;
  amount_idr: number;
  payer: 'operator' | 'counterparty';
}

// ----------------------------------------------------------------------------
// Conditional logic evaluator (mirrors what application engine will use)
// ----------------------------------------------------------------------------

function evaluateConditionalLogic(
  logic: any,
  context: { counterparty?: { entity_type?: string }; org?: { pkp_status?: boolean }; vendor?: { has_skb?: boolean }; owner?: { tax_resident_country?: string } }
): { active: boolean; payer: 'operator' | 'counterparty' } {
  if (!logic) {
    return { active: true, payer: 'operator' };
  }

  switch (logic.condition_type) {
    case 'counterparty_entity_type_in': {
      const inSet = logic.values?.includes(context.counterparty?.entity_type);
      return {
        active: true,
        payer: inSet ? logic.then_payer : logic.else_payer,
      };
    }
    case 'org_pkp_status_true': {
      const active = context.org?.pkp_status === true;
      return {
        active: active && (logic.then_active ?? true),
        payer: 'operator',
      };
    }
    case 'owner_tax_resident_country_not': {
      const country = context.owner?.tax_resident_country;
      const notInSet = country && !logic.values?.includes(country);
      return {
        active: notInSet ? (logic.then_active ?? true) : (logic.else_active ?? false),
        payer: 'operator',
      };
    }
    case 'vendor_has_skb_false': {
      const noSkb = context.vendor?.has_skb === false;
      return {
        active: noSkb ? (logic.then_active ?? true) : (logic.else_active ?? false),
        payer: 'operator',
      };
    }
    default:
      console.warn(`Unknown condition_type: ${logic.condition_type}`);
      return { active: true, payer: 'operator' };
  }
}

// ----------------------------------------------------------------------------
// Rate resolution
// ----------------------------------------------------------------------------

async function resolveRate(
  taxDefId: string,
  regencyId: string | null,
  eventDate: string
): Promise<TaxRate | null> {
  // Try regency-specific first
  if (regencyId) {
    const { data: regional } = await supabase
      .from('platform_tax_rates')
      .select('*')
      .eq('tax_definition_id', taxDefId)
      .eq('regency_id', regencyId)
      .lte('effective_from', eventDate)
      .or(`effective_to.is.null,effective_to.gte.${eventDate}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (regional) return regional as TaxRate;
  }

  // Fallback to national rate (regency_id IS NULL)
  const { data: national } = await supabase
    .from('platform_tax_rates')
    .select('*')
    .eq('tax_definition_id', taxDefId)
    .is('regency_id', null)
    .lte('effective_from', eventDate)
    .or(`effective_to.is.null,effective_to.gte.${eventDate}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  return national as TaxRate | null;
}

// ----------------------------------------------------------------------------
// Per-booking calculation
// ----------------------------------------------------------------------------

async function calculateForBooking(booking: Booking): Promise<{
  lineItems: LineItem[];
  totalTaxIdr: number;
  effectiveRatesSnapshot: any;
  counterpartySnapshot: any;
  eventDate: string;
  fxRate: number | null;
} | null> {
  // Determine event date
  const eventDate =
    booking.payment_received_at?.split('T')[0] ||
    booking.check_in_date ||
    new Date().toISOString().split('T')[0];

  if (!booking.gross_amount || booking.gross_amount <= 0) {
    console.log(`  ⊘ Booking ${booking.id}: skipped (no gross_amount)`);
    return null;
  }

  // FX rate (TODO: integrate real rate source; for demo we use 1.0 fallback)
  const currency = booking.currency || 'IDR';
  let fxRate: number | null = null;
  if (currency !== 'IDR') {
    fxRate = 1.0; // TODO: real FX source
    console.warn(`  ⚠ Booking ${booking.id}: currency=${currency}, fxRate=1.0 placeholder`);
  }

  // Load org tax profile
  const { data: profile } = await supabase
    .from('org_tax_profiles')
    .select('*')
    .eq('org_id', booking.organization_id)
    .maybeSingle();

  if (!profile) {
    console.log(`  ⊘ Booking ${booking.id}: skipped (org has no tax_profile)`);
    return null;
  }

  // Load active tax activations
  const { data: activations } = await supabase
    .from('org_tax_activations')
    .select('*, tax_definition:platform_tax_definitions(*)')
    .eq('org_id', booking.organization_id)
    .eq('is_active', true)
    .lte('effective_from', eventDate)
    .or(`effective_to.is.null,effective_to.gte.${eventDate}`);

  if (!activations || activations.length === 0) {
    console.log(`  ⊘ Booking ${booking.id}: skipped (no active tax activations for this org)`);
    return null;
  }

  // Filter to bookings-relevant taxes
  const relevant = activations.filter((a: any) => {
    const def = a.tax_definition as TaxDefinition;
    return (
      def.trigger_event === 'booking_payment_received' &&
      def.applies_to.includes('rental_booking')
    );
  });

  if (relevant.length === 0) {
    console.log(`  ⊘ Booking ${booking.id}: no rental-applicable active taxes`);
    return null;
  }

  // Build counterparty context (for conditional logic)
  const counterpartyContext = {
    counterparty: {
      entity_type: booking.guest_entity_type || 'individual',
    },
    org: {
      pkp_status: profile.pkp_status,
    },
    owner: {
      tax_resident_country: 'ID', // TODO: pull from villa owner profile
    },
  };

  // Calculate each line item
  const lineItems: LineItem[] = [];
  const ratesSnapshot: any[] = [];
  const grossIdr = currency === 'IDR' ? booking.gross_amount : booking.gross_amount * (fxRate || 1);

  for (const activation of relevant) {
    const def = activation.tax_definition as TaxDefinition;

    // Evaluate conditional logic
    const evalResult = evaluateConditionalLogic(def.conditional_logic, counterpartyContext);
    if (!evalResult.active) continue;

    // Resolve rate
    const rate = await resolveRate(def.id, profile.regency_id, eventDate);
    if (!rate || rate.rate_percent === null) {
      console.warn(`  ⚠ Booking ${booking.id}: no rate found for ${def.code} on ${eventDate}`);
      continue;
    }

    // Apply custom rate override if present
    const effectiveRate = activation.custom_rate_percent ?? rate.rate_percent;

    // Calculate amount
    const amountIdr = +(grossIdr * effectiveRate / 100).toFixed(2);

    // Determine payer (with possible custom override).
    // No cast on custom_payer: it's `string | null` and could be empty/null
    // (then we fall through). def.default_payer is plain `string` because the
    // DB allows 'operator' | 'counterparty' | 'conditional'; the casting
    // shortcut at this site previously narrowed effectivePayer to the two
    // literals and silently killed the defensive 'conditional' branch below.
    const effectivePayer: string =
      activation.custom_payer || evalResult.payer || def.default_payer;

    lineItems.push({
      tax_def_source: 'platform',
      tax_def_id: def.id,
      code: def.code,
      name: def.name,
      rate_percent: effectiveRate,
      amount_idr: amountIdr,
      payer: effectivePayer === 'conditional' ? 'operator' : (effectivePayer as 'operator' | 'counterparty'),
    });

    ratesSnapshot.push({
      tax_def_id: def.id,
      tax_def_code: def.code,
      rate_percent: effectiveRate,
      regency_id: rate.regency_id,
      effective_from: rate.effective_from,
      effective_to: rate.effective_to,
      legal_basis: def.legal_basis,
      custom_override: activation.custom_rate_percent !== null,
    });
  }

  // TODO: also process org_custom_tax_definitions where trigger_event matches.
  // Skipped for v1 backfill since demo orgs unlikely to have custom taxes yet.

  const totalTaxIdr = +lineItems.reduce((s, li) => s + li.amount_idr, 0).toFixed(2);

  return {
    lineItems,
    totalTaxIdr,
    effectiveRatesSnapshot: { calculated_at: new Date().toISOString(), rates: ratesSnapshot },
    counterpartySnapshot: counterpartyContext.counterparty,
    eventDate,
    fxRate,
  };
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  console.log('=== Tax Engine v1 Backfill ===');
  console.log(`Mode: ${APPLY ? (FORCE ? 'APPLY + FORCE (overwrite)' : 'APPLY (insert new only)') : 'DRY-RUN'}`);
  console.log('');

  // Load bookings
  // TODO: confirm exact column names — adjust select accordingly
  const { data: bookings, error: bookingsErr } = await supabase
    .from('bookings')
    .select('id, organization_id, payment_received_at, check_in_date, gross_amount, currency, guest_country, guest_entity_type')
    .order('check_in_date', { ascending: true });

  if (bookingsErr) {
    console.error('Failed to load bookings:', bookingsErr);
    process.exit(1);
  }

  if (!bookings || bookings.length === 0) {
    console.log('No bookings found. Nothing to backfill.');
    return;
  }

  console.log(`Found ${bookings.length} bookings.`);
  console.log('');

  let calculated = 0;
  let skipped = 0;
  let inserted = 0;
  let errors = 0;

  for (const booking of bookings as Booking[]) {
    // Check existing calculation
    const { data: existing } = await supabase
      .from('tax_event_calculations')
      .select('id')
      .eq('source_table', 'bookings')
      .eq('source_id', booking.id)
      .maybeSingle();

    if (existing && !FORCE) {
      console.log(`  ⊘ Booking ${booking.id}: already calculated (id=${existing.id})`);
      skipped++;
      continue;
    }

    try {
      const result = await calculateForBooking(booking);
      if (!result) {
        skipped++;
        continue;
      }

      calculated++;

      const row = {
        org_id: booking.organization_id,
        trigger_event: 'booking_payment_received',
        source_table: 'bookings',
        source_id: booking.id,
        event_date: result.eventDate,
        gross_amount: booking.gross_amount,
        gross_currency: booking.currency || 'IDR',
        fx_rate_to_idr: result.fxRate,
        line_items: result.lineItems,
        total_tax_amount_idr: result.totalTaxIdr,
        net_to_operator_amount_idr: (booking.gross_amount || 0) - result.totalTaxIdr,
        net_to_owner_amount_idr: null, // TODO: subtract management fee + apply share split
        effective_rates_snapshot: result.effectiveRatesSnapshot,
        counterparty_snapshot: result.counterpartySnapshot,
        payment_status: 'pending',
      };

      if (APPLY) {
        if (existing && FORCE) {
          const { error: updErr } = await supabase
            .from('tax_event_calculations')
            .update({
              ...row,
              recalculated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (updErr) throw updErr;
          console.log(`  ↻ Booking ${booking.id}: recalculated (${result.lineItems.length} line items, total IDR ${result.totalTaxIdr})`);
        } else {
          const { error: insErr } = await supabase
            .from('tax_event_calculations')
            .insert(row);
          if (insErr) throw insErr;
          console.log(`  ✓ Booking ${booking.id}: inserted (${result.lineItems.length} line items, total IDR ${result.totalTaxIdr})`);
        }
        inserted++;
      } else {
        console.log(`  [DRY] Booking ${booking.id}: would insert ${result.lineItems.length} line items, total IDR ${result.totalTaxIdr}`);
      }
    } catch (err: any) {
      console.error(`  ✗ Booking ${booking.id}: ${err.message || err}`);
      errors++;
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Calculated:        ${calculated}`);
  console.log(`Skipped:           ${skipped}`);
  console.log(`Inserted/Updated:  ${inserted}`);
  console.log(`Errors:            ${errors}`);
  if (!APPLY) {
    console.log('');
    console.log('This was a DRY-RUN. Re-run with --apply to actually write.');
  }
}

main();
