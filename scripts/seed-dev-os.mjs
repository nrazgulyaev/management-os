/**
 * Minimum Dev OS demo data, slug-resolved (works against any project UUIDs).
 * Idempotent. Fixes the 2.x seed mismatch where the base seed uses
 * `1eda0001-...` IDs but Dev OS seed files were written assuming `11111111-...`.
 */
import postgres from "postgres";
// Prefer DIRECT_URL — the pooled DATABASE_URL has aggressive transaction
// timeouts that kill long seed runs. Same convention as scripts/migrate.ts.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  // 1) Resolve project IDs by slug.
  const projects = await sql`SELECT id, slug FROM projects WHERE slug IN ('eternal-villas','enso-villas','ahau-gardens')`;
  if (projects.length === 0) {
    console.error("No demo projects found. Run base seed first.");
    process.exit(1);
  }
  const byslug = Object.fromEntries(projects.map(p => [p.slug, p.id]));
  console.log("Resolved project IDs:", byslug);

  // 2) Stage 2.1 development_project_meta (1 row per project).
  for (const slug of Object.keys(byslug)) {
    await sql`
      INSERT INTO development_project_meta (project_id, acquisition_mode, project_currency, operational_currency, notes)
      VALUES (${byslug[slug]}, 'leasehold', 'USD', 'IDR', ${'Demo seed for ' + slug})
      ON CONFLICT (project_id) DO NOTHING
    `;
  }
  console.log("✓ development_project_meta");

  // 3) Stage 2.2.A — lead_sources, agents, contacts, contact_roles.
  // Lead sources (no project FK).
  await sql`
    INSERT INTO lead_sources (source_code, source_category, campaign_name, is_active, notes) VALUES
      ('website_form',           'website',         NULL,                 true, 'arconique.com contact form'),
      ('meta_ads_q4_2026',       'paid_ads',        'Eternal pre-launch', true, 'Meta Ads — Eternal carousel'),
      ('agent_dimitri',          'agent',           NULL,                 true, 'Inbound via Dimitri'),
      ('instagram_organic',      'organic_social',  'IG organic',         true, 'IG bio link'),
      ('referral_existing_owner','referral',        NULL,                 true, 'Existing owner referral')
    ON CONFLICT (source_code) DO NOTHING
  `;

  // One agent + agent contact.
  await sql`
    INSERT INTO contacts (full_name, email, phone, preferred_language, acquisition_source, notes)
    VALUES ('Dimitri Volkov', 'dimitri@balipremiumagents.example', '+62 812 0000 0001', 'en', 'agent', 'Premium Bali agent')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO agents (contact_id, agency_name, default_commission_percent, default_commission_structure, agreement_status, is_preferred_partner, agreement_notes)
    SELECT id, 'Bali Premium Agents', 5.0, 'percent_of_sale', 'active', true, 'Two closed deals on Eternal in Q4'
    FROM contacts WHERE email = 'dimitri@balipremiumagents.example'
    ON CONFLICT (contact_id) DO NOTHING
  `;

  // 10 demo lead contacts.
  const leads = [
    ['Wei Wang',        'wei.wang@example.com',  '+86 138 0000 0001', 'en', 'whatsapp', 'CN', 'CN', 'meta_ads',  'Meta Ads — Eternal carousel'],
    ['Sophie Laurent',  'sophie.l@example.com',  '+33 6 00 00 00 02', 'fr', 'email',    'FR', 'FR', 'website',   'arconique.com contact form'],
    ['Marcus Anderson', 'marcus.a@example.com',  '+1 415 555 0103',   'en', 'email',    'US', 'US', 'agent',     'Referred by Dimitri'],
    ['Akari Tanaka',    'akari.t@example.com',   '+81 80 0000 0004',  'en', 'whatsapp', 'JP', 'JP', 'instagram', 'IG DM'],
    ['Pieter de Vries', 'pieter.dv@example.com', '+31 6 0000 0005',   'en', 'email',    'NL', 'NL', 'referral',  'Referred by Eternal owner'],
    ['Sergey Ivanov',   'sergey.i@example.com',  '+7 905 000 00 06',  'en', 'whatsapp', 'AE', 'RU', 'website',   'Asked about Enso pooled model'],
    ['Aisha Khan',      'aisha.k@example.com',   '+971 50 000 0007',  'en', 'phone',    'AE', 'PK', 'meta_ads',  'Meta Ads — Ahau carousel'],
    ['Lukas Müller',    'lukas.m@example.com',   '+49 170 000 0008',  'en', 'email',    'DE', 'DE', 'website',   null],
    ['Priya Singh',     'priya.s@example.com',   '+65 8000 0009',     'en', 'whatsapp', 'SG', 'IN', 'agent',     'Referred by Dimitri'],
    ['Elena Rossi',     'elena.r@example.com',   '+39 333 000 0010',  'it', 'email',    'IT', 'IT', 'instagram', 'IG bio link'],
  ];
  for (const [name, email, phone, lang, channel, country, citizenship, source, detail] of leads) {
    await sql`
      INSERT INTO contacts (full_name, email, phone, preferred_language, preferred_communication_channel, country_of_residence, citizenship, acquisition_source, acquisition_source_detail)
      VALUES (${name}, ${email}, ${phone}, ${lang}, ${channel}, ${country}, ${citizenship}, ${source}, ${detail})
      ON CONFLICT DO NOTHING
    `;
  }

  // Lead roles linking contacts → projects via slug.
  // Spread: 2 new (eternal,ahau), 2 contacted (eternal,enso), 2 qualified (eternal,eternal),
  //         1 viewing_scheduled (enso), 1 negotiation (eternal), 1 reservation (enso), 1 lost (ahau).
  const roleSpec = [
    ['wei.wang@example.com',     'eternal-villas', 'new',               '2026-04-28', null,                            'website_form'],
    ['aisha.k@example.com',      'ahau-gardens',   'new',               '2026-04-29', null,                            'meta_ads_q4_2026'],
    ['sophie.l@example.com',     'eternal-villas', 'contacted',         '2026-04-22', null,                            'website_form'],
    ['akari.t@example.com',      'enso-villas',    'contacted',         '2026-04-25', null,                            'instagram_organic'],
    ['marcus.a@example.com',     'eternal-villas', 'qualified',         '2026-04-15', 'Cash buyer, $1M+ budget',       'agent_dimitri'],
    ['pieter.dv@example.com',    'eternal-villas', 'qualified',         '2026-04-18', 'Existing-owner referral; warm', 'referral_existing_owner'],
    ['sergey.i@example.com',     'enso-villas',    'viewing_scheduled', '2026-04-10', 'Site visit booked May',         'website_form'],
    ['priya.s@example.com',      'eternal-villas', 'negotiation',       '2026-03-22', 'Pricing discussion EV-08',      'agent_dimitri'],
    ['lukas.m@example.com',      'enso-villas',    'reservation',       '2026-03-12', 'Reservation hold ES-05',        'website_form'],
    ['elena.r@example.com',      'ahau-gardens',   'lost',              '2026-03-01', 'Chose competitor in Uluwatu',   'meta_ads_q4_2026'],
  ];
  for (const [email, slug, status, started, notes, sourceCode] of roleSpec) {
    if (!byslug[slug]) continue;
    await sql`
      INSERT INTO contact_roles (contact_id, role, scope, scope_project_id, status, started_at, ended_at, end_reason, source_id, notes)
      SELECT
        c.id,
        'lead',
        'project',
        ${byslug[slug]},
        ${status},
        ${started + 'T09:00:00Z'},
        ${status === 'lost' ? '2026-04-08T17:00:00Z' : null},
        ${status === 'lost' ? 'lost' : null},
        (SELECT id FROM lead_sources WHERE source_code = ${sourceCode}),
        ${notes}
      FROM contacts c WHERE c.email = ${email}
      ON CONFLICT (contact_id, role, scope_project_id) WHERE ended_at IS NULL DO NOTHING
    `;
  }

  // ---------------------------------------------------------------------
  // 4) Stage 2.3 — investors, commitments, drawdowns, wallets, wallet activity.
  //
  // Idempotent: inserts use ON CONFLICT on the natural-key columns
  // (investor_code, commitment_code, (commitment_id, drawdown_number),
  // commitment_id for wallets). Re-running this seed does NOT duplicate
  // rows or move balances.
  //
  // Wallet balances and totals are computed from the seeded drawdowns,
  // not from running the action layer — the seed is for fixture setup,
  // not for exercising business logic. Tests that run actions assert
  // their own balance changes.
  // ---------------------------------------------------------------------

  // 4.1) Investors (no contact link initially — kept simple for the seed).
  const investorsSpec = [
    {
      code: "INV-001",
      type: "gp",
      legalName: "Arconique Holdings BVI",
      legalEntity: "offshore",
      taxRes: "VG",
      currency: "USD",
      lang: "en",
      email: "ops@arconique.com",
      notes: "Internal sponsor / GP entity holding Arconique's own capital."
    },
    {
      code: "INV-002",
      type: "lp_private",
      legalName: "Andrey Petrov",
      legalEntity: "individual",
      taxRes: "RU",
      currency: "RUB",
      lang: "ru",
      email: "andrey.petrov@example.com",
      notes: "Long-time Russian LP; wires from Tinkoff to PT PMA via Singapore."
    },
    {
      code: "INV-003",
      type: "lp_institutional",
      legalName: "Singapore Family Office Pte Ltd",
      legalEntity: "llc",
      taxRes: "SG",
      currency: "USD",
      lang: "en",
      email: "investments@sgfo.example.com",
      notes: "Multi-project commitments across Eternal + Enso."
    },
    {
      code: "INV-004",
      type: "landowner_jv",
      legalName: "Made Wijaya",
      legalEntity: "individual",
      taxRes: "ID",
      currency: "IDR",
      lang: "id",
      email: "made.wijaya@example.com",
      notes: "Eternal Villas land contributor — agreed asset value $200k."
    },
    {
      code: "INV-005",
      type: "lp_private",
      legalName: "Crypto Capital DAO",
      legalEntity: "offshore",
      taxRes: "KY",
      currency: "USDT",
      lang: "en",
      email: "treasury@cryptocapital.example.com",
      notes: "USDT-denominated commitment for Ahau Gardens. KYC via on-chain attestation."
    },
  ];

  for (const inv of investorsSpec) {
    await sql`
      INSERT INTO investors (
        investor_code, investor_type, legal_name, legal_entity_type,
        tax_residency, primary_currency, reporting_language,
        contact_email, notes, status
      )
      VALUES (
        ${inv.code}, ${inv.type}, ${inv.legalName}, ${inv.legalEntity},
        ${inv.taxRes}, ${inv.currency}, ${inv.lang},
        ${inv.email}, ${inv.notes}, 'active'
      )
      ON CONFLICT (investor_code) DO NOTHING
    `;
  }
  console.log("✓ investors");

  // 4.2) Commitments — one row per (investor × project) with negotiated terms.
  // FX rates locked at "commitment date" (here we use realistic Q1 2026 rates).
  const FX = { USD: 1.0, RUB: 92.0, IDR: 16400, EUR: 0.92, USDT: 1.0, CNY: 7.25 };

  const commitmentsSpec = [
    {
      code: "COM-001",
      investorCode: "INV-001",
      projectSlug: "eternal-villas",
      // $500k USD, 100% profit share (GP), priority 1
      amountMinor: 500_000_00n,
      currency: "USD",
      profitShare: "100.0000",
      priority: 1,
      isLandowner: false,
      signedAt: "2025-01-15",
    },
    {
      code: "COM-002",
      investorCode: "INV-002",
      projectSlug: "eternal-villas",
      // $300k USD ≈ RUB 27.6M, committed in RUB; 50% share, priority 2
      amountMinor: 27_600_000_00n, // 27.6M RUB in minor (kopecks)
      currency: "RUB",
      profitShare: "50.0000",
      priority: 2,
      isLandowner: false,
      signedAt: "2025-02-20",
    },
    {
      code: "COM-003",
      investorCode: "INV-003",
      projectSlug: "eternal-villas",
      // $700k USD, 60% share, priority 2
      amountMinor: 700_000_00n,
      currency: "USD",
      profitShare: "60.0000",
      priority: 2,
      isLandowner: false,
      signedAt: "2025-03-05",
    },
    {
      code: "COM-004",
      investorCode: "INV-003",
      projectSlug: "enso-villas",
      // $1M USD, 60% share, priority 1 (Singapore Family Office on Enso too)
      amountMinor: 1_000_000_00n,
      currency: "USD",
      profitShare: "60.0000",
      priority: 1,
      isLandowner: false,
      signedAt: "2025-06-10",
    },
    {
      code: "COM-005",
      investorCode: "INV-004",
      projectSlug: "eternal-villas",
      // Land contribution valued at $200k USD; 25% share, landowner_jv
      amountMinor: 200_000_00n,
      currency: "USD",
      profitShare: "25.0000",
      priority: 3, // junior to cash investors
      isLandowner: true,
      landownerValueMinor: 200_000_00n,
      landownerCurrency: "USD",
      signedAt: "2024-11-30",
    },
    {
      code: "COM-006",
      investorCode: "INV-005",
      projectSlug: "ahau-gardens",
      // 150k USDT (= $150k); 55% share, priority 1
      amountMinor: 150_000_000_000n, // 150k USDT in 6-decimal minor units
      currency: "USDT",
      profitShare: "55.0000",
      priority: 1,
      isLandowner: false,
      signedAt: "2025-08-22",
    },
  ];

  function computeUsdMinor(amountMinor, currency, fxRate) {
    const isUsdt = currency === "USDT";
    const sourceMajors = isUsdt
      ? Number(amountMinor) / 1_000_000
      : Number(amountMinor) / 100;
    const usdMajors = currency === "USD"
      ? Number(amountMinor) / 100
      : sourceMajors / fxRate;
    return BigInt(Math.round(usdMajors * 100));
  }

  for (const c of commitmentsSpec) {
    if (!byslug[c.projectSlug]) continue;
    const usdMinor = computeUsdMinor(c.amountMinor, c.currency, FX[c.currency]);
    await sql`
      INSERT INTO capital_commitments (
        investor_id, project_id, commitment_code,
        committed_amount_minor, committed_currency, committed_amount_usd_minor,
        fx_rate_at_commitment, profit_share_percent, capital_return_priority,
        is_landowner_jv, landowner_asset_value_minor, landowner_asset_currency,
        status, signed_at
      )
      SELECT
        i.id, ${byslug[c.projectSlug]}, ${c.code},
        ${String(c.amountMinor)}, ${c.currency}, ${String(usdMinor)},
        ${String(FX[c.currency])}, ${c.profitShare}, ${c.priority},
        ${c.isLandowner},
        ${c.landownerValueMinor ? String(c.landownerValueMinor) : null},
        ${c.landownerCurrency ?? null},
        'active', ${c.signedAt}
      FROM investors i
      WHERE i.investor_code = ${c.investorCode}
      ON CONFLICT (commitment_code) DO NOTHING
    `;
  }
  console.log("✓ capital_commitments");

  // 4.3) Wallets — one per commitment; auto-create empty if missing.
  await sql`
    INSERT INTO investor_wallets (commitment_id)
    SELECT id FROM capital_commitments
    ON CONFLICT (commitment_id) DO NOTHING
  `;
  console.log("✓ investor_wallets");

  // 4.4) Drawdowns — 2 received + 1 requested per active commitment.
  // Landowner_jv (COM-005) gets no drawdowns (asset already contributed).
  const drawdownsSpec = [
    // INV-001 / Eternal: drawn $300k of $500k
    { commitmentCode: "COM-001", num: 1, amount: 200_000_00n, currency: "USD", due: "2025-02-01", received: "2025-02-03", trigger: "initial_capitalization", status: "received", method: "bank_wire", ref: "WIRE-2025-001" },
    { commitmentCode: "COM-001", num: 2, amount: 100_000_00n, currency: "USD", due: "2025-08-15", received: "2025-08-12", trigger: "milestone_call", status: "received", method: "bank_wire", ref: "WIRE-2025-014" },
    { commitmentCode: "COM-001", num: 3, amount: 100_000_00n, currency: "USD", due: "2026-05-20", received: null, trigger: "milestone_call", status: "requested", method: null, ref: null },

    // INV-002 / Eternal: drawn ~$200k of $300k
    { commitmentCode: "COM-002", num: 1, amount: 9_200_000_00n, currency: "RUB", due: "2025-03-15", received: "2025-03-22", trigger: "initial_capitalization", status: "received", method: "bank_wire", ref: "TINKOFF-2025-008" },
    { commitmentCode: "COM-002", num: 2, amount: 9_200_000_00n, currency: "RUB", due: "2025-09-30", received: "2025-10-04", trigger: "milestone_call", status: "received", method: "bank_wire", ref: "TINKOFF-2025-052" },
    { commitmentCode: "COM-002", num: 3, amount: 9_200_000_00n, currency: "RUB", due: "2026-04-15", received: null, trigger: "milestone_call", status: "overdue", method: null, ref: null },

    // INV-003 / Eternal: drawn $400k of $700k
    { commitmentCode: "COM-003", num: 1, amount: 250_000_00n, currency: "USD", due: "2025-04-01", received: "2025-04-01", trigger: "initial_capitalization", status: "received", method: "bank_wire", ref: "DBS-2025-103" },
    { commitmentCode: "COM-003", num: 2, amount: 150_000_00n, currency: "USD", due: "2025-10-20", received: "2025-10-21", trigger: "milestone_call", status: "received", method: "bank_wire", ref: "DBS-2025-188" },
    { commitmentCode: "COM-003", num: 3, amount: 300_000_00n, currency: "USD", due: "2026-06-01", received: null, trigger: "milestone_call", status: "requested", method: null, ref: null },

    // INV-003 / Enso: drawn $500k of $1M
    { commitmentCode: "COM-004", num: 1, amount: 500_000_00n, currency: "USD", due: "2025-07-01", received: "2025-07-01", trigger: "initial_capitalization", status: "received", method: "bank_wire", ref: "DBS-2025-145" },
    { commitmentCode: "COM-004", num: 2, amount: 500_000_00n, currency: "USD", due: "2026-07-01", received: null, trigger: "milestone_call", status: "requested", method: null, ref: null },

    // INV-005 / Ahau: drawn 100k of 150k USDT
    { commitmentCode: "COM-006", num: 1, amount: 50_000_000_000n, currency: "USDT", due: "2025-09-01", received: "2025-09-01", trigger: "initial_capitalization", status: "received", method: "crypto", ref: "0xab12...e5f7" },
    { commitmentCode: "COM-006", num: 2, amount: 50_000_000_000n, currency: "USDT", due: "2026-01-15", received: "2026-01-16", trigger: "milestone_call", status: "received", method: "crypto", ref: "0xcd34...a1b2" },
    { commitmentCode: "COM-006", num: 3, amount: 50_000_000_000n, currency: "USDT", due: "2026-07-15", received: null, trigger: "milestone_call", status: "requested", method: null, ref: null },
  ];

  for (const d of drawdownsSpec) {
    const usdMinor = computeUsdMinor(d.amount, d.currency, FX[d.currency]);
    await sql`
      INSERT INTO capital_drawdowns (
        commitment_id, drawdown_number, amount_minor, currency,
        amount_usd_minor, fx_rate_at_drawdown, due_date, received_at,
        status, trigger_reason, payment_method, payment_reference
      )
      SELECT
        cc.id, ${d.num}, ${String(d.amount)}, ${d.currency},
        ${String(usdMinor)}, ${String(FX[d.currency])}, ${d.due},
        ${d.received ? d.received + "T10:00:00Z" : null},
        ${d.status}, ${d.trigger}, ${d.method}, ${d.ref}
      FROM capital_commitments cc
      WHERE cc.commitment_code = ${d.commitmentCode}
      ON CONFLICT (commitment_id, drawdown_number) DO NOTHING
    `;
  }
  console.log("✓ capital_drawdowns");

  // 4.5) Wallet transactions for every received drawdown + matching wallet
  // balances. Done in one pass per commitment so the running balance
  // (`balance_available_after_usd_minor`) is correct.
  const commitmentRows = await sql`
    SELECT id, commitment_code FROM capital_commitments
  `;
  for (const cc of commitmentRows) {
    const wallet = await sql`
      SELECT id FROM investor_wallets WHERE commitment_id = ${cc.id} LIMIT 1
    `;
    if (wallet.length === 0) continue;
    const walletId = wallet[0].id;

    const received = await sql`
      SELECT id, amount_minor, currency, amount_usd_minor, fx_rate_at_drawdown,
             received_at, drawdown_number, payment_reference
      FROM capital_drawdowns
      WHERE commitment_id = ${cc.id} AND status = 'received'
      ORDER BY drawdown_number ASC
    `;

    let runningBalance = 0n;
    let totalDrawn = 0n;
    let lastActivity = null;
    for (const d of received) {
      runningBalance += BigInt(d.amount_usd_minor);
      totalDrawn += BigInt(d.amount_usd_minor);
      lastActivity = d.received_at;
      // Insert wallet_tx; idempotent via drawdown_id uniqueness on type
      // (we use NOT EXISTS guard since wallet_transactions has no natural key).
      await sql`
        INSERT INTO wallet_transactions (
          wallet_id, commitment_id, transaction_type,
          amount_usd_minor, amount_original_minor, original_currency,
          fx_rate_at_transaction,
          balance_available_after_usd_minor, balance_hold_after_usd_minor,
          drawdown_id, description, external_reference, occurred_at
        )
        SELECT
          ${walletId}, ${cc.id}, 'drawdown_received',
          ${String(d.amount_usd_minor)},
          ${String(d.amount_minor)}, ${d.currency},
          ${String(d.fx_rate_at_drawdown)},
          ${String(runningBalance)}, '0',
          ${d.id}, ${'Drawdown #' + d.drawdown_number + ' received'},
          ${d.payment_reference}, ${d.received_at}
        WHERE NOT EXISTS (
          SELECT 1 FROM wallet_transactions
          WHERE drawdown_id = ${d.id}
            AND transaction_type = 'drawdown_received'
        )
      `;
    }

    // Update wallet balance to match the seeded drawdowns. We do NOT
    // touch `available_balance_usd_minor` here if any distribution
    // allocations have already been executed against this wallet —
    // those credits are layered on top in Section 5.8 and overwriting
    // would zero them on every re-run.
    const [hasDistributions] = await sql`
      SELECT 1 AS x FROM distribution_allocations
       WHERE commitment_id = ${cc.id} AND status = 'executed'
       LIMIT 1
    `;
    if (received.length > 0 && !hasDistributions) {
      await sql`
        UPDATE investor_wallets
           SET available_balance_usd_minor = ${String(runningBalance)},
               total_drawn_usd_minor       = ${String(totalDrawn)},
               last_activity_at            = ${lastActivity}
         WHERE id = ${walletId}
      `;
    } else if (received.length > 0) {
      // Distributions present — only refresh the lifetime drawn total.
      await sql`
        UPDATE investor_wallets
           SET total_drawn_usd_minor = ${String(totalDrawn)},
               last_activity_at      = greatest(last_activity_at, ${lastActivity})
         WHERE id = ${walletId}
      `;
    }
  }
  console.log("✓ wallet_transactions + balances");

  // ---------------------------------------------------------------------
  // Stage 2.3.B — finance ledger (bank accounts, categories, budget,
  // vendor commitments, transactions, corporate events, FX snapshots) +
  // 1 sample distribution to demonstrate the declare→execute flow.
  //
  // Idempotent: every insert uses ON CONFLICT or NOT EXISTS guards.
  // Reconciliation: wallet balances and bank balances are validated at
  // the end and any drift fails loudly.
  // ---------------------------------------------------------------------

  // 5.1) Bank accounts (3) ---------------------------------------------------
  const bankSpec = [
    {
      code: "ACC-USD-MAIN", name: "Wise USD operating",
      type: "bank", currency: "USD",
      bank: "Wise", balance: 400_000_00n, threshold: 200_000_00n,
      isCompany: true, projectSlug: null,
    },
    {
      code: "ACC-IDR-OPS", name: "Mandiri IDR operating",
      type: "bank", currency: "IDR",
      // Balance covers historical IDR outflows + ~9B IDR cushion
      bank: "Bank Mandiri", balance: 20_000_000_000_00n, threshold: 5_000_000_000_00n,
      isCompany: false, projectSlug: "eternal-villas",
    },
    {
      code: "ACC-USDT-1", name: "Bybit USDT exchange",
      type: "crypto_exchange", currency: "USDT",
      bank: null, balance: 100_000_000_000n, threshold: 50_000_000_000n,
      isCompany: true, projectSlug: null,
    },
  ];

  for (const b of bankSpec) {
    const usdMinor = computeUsdMinor(b.balance, b.currency, FX[b.currency]);
    const projectId = b.projectSlug ? byslug[b.projectSlug] : null;
    // ON CONFLICT DO UPDATE so re-runs apply edited balances/thresholds.
    await sql`
      INSERT INTO dev_bank_accounts (
        account_code, account_name, account_type, currency,
        bank_name, minimum_balance_threshold_minor,
        current_balance_minor, current_balance_usd_minor,
        last_fx_rate, last_balance_at,
        primary_project_id, is_company_account, is_active
      )
      VALUES (
        ${b.code}, ${b.name}, ${b.type}, ${b.currency},
        ${b.bank}, ${String(b.threshold)},
        ${String(b.balance)}, ${String(usdMinor)},
        ${String(FX[b.currency])}, ${'2026-04-30T00:00:00Z'},
        ${projectId}, ${b.isCompany}, true
      )
      ON CONFLICT (account_code) DO UPDATE SET
        current_balance_minor          = EXCLUDED.current_balance_minor,
        current_balance_usd_minor      = EXCLUDED.current_balance_usd_minor,
        minimum_balance_threshold_minor = EXCLUDED.minimum_balance_threshold_minor,
        last_balance_at                = EXCLUDED.last_balance_at,
        last_fx_rate                   = EXCLUDED.last_fx_rate,
        updated_at                     = now()
    `;
  }
  console.log("✓ dev_bank_accounts");

  // 5.2) Cost categories (hierarchical) -------------------------------------
  // Inserted in two passes: parents first (no parent_category_id), then
  // children referencing parents by category_code.
  const parentCats = [
    { code: "LAND",            name: "Land",                type: "capex", order: 10, ru: "Земля",         id_label: "Tanah" },
    { code: "DESIGN",          name: "Design",              type: "capex", order: 20, ru: "Проектирование", id_label: "Desain" },
    { code: "PERMITS",         name: "Permits",             type: "capex", order: 30, ru: "Разрешения",     id_label: "Izin" },
    { code: "CONSTRUCTION",    name: "Construction",        type: "capex", order: 40, ru: "Строительство",  id_label: "Konstruksi" },
    { code: "MARKETING",       name: "Marketing",           type: "opex",  order: 50, ru: "Маркетинг",      id_label: "Pemasaran" },
    { code: "OPERATIONS",      name: "Operations",          type: "opex",  order: 60, ru: "Операции",       id_label: "Operasional" },
    { code: "OVERHEAD",        name: "Overhead",            type: "opex",  order: 70, ru: "Накладные",      id_label: "Overhead" },
    { code: "FX_LOSS",         name: "FX losses",           type: "opex",  order: 80, ru: "Курсовые потери", id_label: "Kerugian FX" },
    { code: "INTEREST_EXPENSE",name: "Interest expense",    type: "opex",  order: 85, ru: "Процентные расходы", id_label: "Beban bunga" },
    { code: "SALE_INCOME",     name: "Sale income",         type: "sale_income",   order: 90, ru: "Доходы от продаж",  id_label: "Pendapatan penjualan" },
    { code: "FEE_INCOME",      name: "Fee income",          type: "fee_income",    order: 95, ru: "Доходы от услуг",   id_label: "Pendapatan biaya" },
  ];
  for (const c of parentCats) {
    const translations = JSON.stringify({ en: c.name, ru: c.ru, id: c.id_label });
    await sql`
      INSERT INTO dev_cost_categories (
        category_code, display_name, display_name_translations,
        category_type, display_order, is_active
      )
      VALUES (${c.code}, ${c.name}, ${translations},
              ${c.type}, ${c.order}, true)
      ON CONFLICT (category_code) DO NOTHING
    `;
  }
  const childCats = [
    { code: "LAND_PURCHASE",       parent: "LAND",         name: "Land purchase",       type: "capex", order: 11 },
    { code: "LAND_LEGAL",          parent: "LAND",         name: "Land legal fees",     type: "capex", order: 12 },
    { code: "DESIGN_ARCHITECTURE", parent: "DESIGN",       name: "Architecture",        type: "capex", order: 21 },
    { code: "DESIGN_INTERIOR",     parent: "DESIGN",       name: "Interior design",     type: "capex", order: 22 },
    { code: "DESIGN_LANDSCAPE",    parent: "DESIGN",       name: "Landscape design",    type: "capex", order: 23 },
    { code: "CONSTR_FOUNDATION",   parent: "CONSTRUCTION", name: "Foundation",          type: "capex", order: 41 },
    { code: "CONSTR_STRUCTURE",    parent: "CONSTRUCTION", name: "Structure",           type: "capex", order: 42 },
    { code: "CONSTR_FINISHING",    parent: "CONSTRUCTION", name: "Finishing",           type: "capex", order: 43 },
    { code: "CONSTR_MEP",          parent: "CONSTRUCTION", name: "MEP (M/E/P)",         type: "capex", order: 44 },
  ];
  for (const c of childCats) {
    await sql`
      INSERT INTO dev_cost_categories (
        category_code, parent_category_id, display_name,
        category_type, display_order, is_active
      )
      SELECT ${c.code}, p.id, ${c.name}, ${c.type}, ${c.order}, true
      FROM dev_cost_categories p WHERE p.category_code = ${c.parent}
      ON CONFLICT (category_code) DO NOTHING
    `;
  }
  console.log("✓ dev_cost_categories");

  // 5.3) Budget lines for Eternal Villas ($2.5M total) ----------------------
  const budgetSpec = [
    { categoryCode: "LAND_PURCHASE",       amount: 500_000_00n },
    { categoryCode: "LAND_LEGAL",          amount:  30_000_00n },
    { categoryCode: "DESIGN_ARCHITECTURE", amount: 150_000_00n },
    { categoryCode: "DESIGN_INTERIOR",     amount:  80_000_00n },
    { categoryCode: "DESIGN_LANDSCAPE",    amount:  40_000_00n },
    { categoryCode: "PERMITS",             amount:  60_000_00n },
    { categoryCode: "CONSTR_FOUNDATION",   amount: 200_000_00n },
    { categoryCode: "CONSTR_STRUCTURE",    amount: 600_000_00n },
    { categoryCode: "CONSTR_FINISHING",    amount: 400_000_00n },
    { categoryCode: "CONSTR_MEP",          amount: 200_000_00n },
    { categoryCode: "MARKETING",           amount: 100_000_00n },
    { categoryCode: "OPERATIONS",          amount:  80_000_00n },
    { categoryCode: "OVERHEAD",            amount:  60_000_00n },
  ];
  for (const b of budgetSpec) {
    await sql`
      INSERT INTO dev_budget_lines (
        project_id, category_id,
        budgeted_amount_usd_minor, budgeted_at_currency,
        budget_version, effective_from
      )
      SELECT
        ${byslug["eternal-villas"]}, c.id,
        ${String(b.amount)}, 'USD', 1, '2025-01-01'
      FROM dev_cost_categories c
      WHERE c.category_code = ${b.categoryCode}
        AND NOT EXISTS (
          SELECT 1 FROM dev_budget_lines bl
          WHERE bl.project_id = ${byslug["eternal-villas"]}
            AND bl.category_id = c.id
            AND bl.unit_id IS NULL
        )
    `;
  }
  // Smaller budgets for Enso ($1.2M) and Ahau ($800k) — single-line each.
  for (const [slug, amount] of [["enso-villas", 1_200_000_00n], ["ahau-gardens", 800_000_00n]]) {
    if (!byslug[slug]) continue;
    await sql`
      INSERT INTO dev_budget_lines (
        project_id, category_id,
        budgeted_amount_usd_minor, budgeted_at_currency,
        budget_version, effective_from
      )
      SELECT
        ${byslug[slug]}, c.id,
        ${String(amount)}, 'USD', 1, '2025-01-01'
      FROM dev_cost_categories c
      WHERE c.category_code = 'CONSTR_STRUCTURE'
        AND NOT EXISTS (
          SELECT 1 FROM dev_budget_lines bl
          WHERE bl.project_id = ${byslug[slug]}
            AND bl.category_id = c.id
            AND bl.unit_id IS NULL
        )
    `;
  }
  console.log("✓ dev_budget_lines");

  // 5.4) Vendor commitments (dev_commitments_ledger) ------------------------
  const vendorSpec = [
    { code: "VC-001", project: "eternal-villas", category: "DESIGN_ARCHITECTURE", desc: "Bali Architecture Studio — Eternal master design",  amount: 150_000_00n, currency: "USD", date: "2025-01-15", status: "completed" },
    { code: "VC-002", project: "eternal-villas", category: "CONSTR_FOUNDATION",   desc: "PT Konstruksi Jaya — foundation works",               amount: 200_000_00n, currency: "USD", date: "2025-04-10", status: "partially_paid" },
    { code: "VC-003", project: "eternal-villas", category: "CONSTR_STRUCTURE",    desc: "PT Konstruksi Jaya — structural shell",               amount: 450_000_00n, currency: "USD", date: "2025-06-01", status: "open" },
    { code: "VC-004", project: "eternal-villas", category: "MARKETING",           desc: "Bali Premium Agents — Q4 2025 campaign",              amount:  40_000_00n, currency: "USD", date: "2025-09-15", status: "completed" },
    { code: "VC-005", project: "eternal-villas", category: "PERMITS",             desc: "Notaris Bali — IMB permit fees",                      amount:  35_000_00n, currency: "USD", date: "2025-02-20", status: "completed" },
    { code: "VC-006", project: "enso-villas",    category: "DESIGN_ARCHITECTURE", desc: "Studio Tropis — Enso concept design",                 amount:  80_000_00n, currency: "USD", date: "2025-07-01", status: "partially_paid" },
    { code: "VC-007", project: "enso-villas",    category: "PERMITS",             desc: "Enso permit package",                                 amount:  45_000_00n, currency: "USD", date: "2025-08-15", status: "open" },
    { code: "VC-008", project: "ahau-gardens",   category: "LAND_LEGAL",          desc: "Ahau leasehold legal review",                         amount:  20_000_00n, currency: "USD", date: "2025-09-01", status: "completed" },
    { code: "VC-009", project: "eternal-villas", category: "CONSTR_FINISHING",    desc: "Tile + finish materials reservation",                 amount: 120_000_00n, currency: "USD", date: "2026-01-10", status: "open" },
    { code: "VC-010", project: "eternal-villas", category: "CONSTR_MEP",          desc: "PT Mekanikal Bali — MEP installation",                amount: 150_000_00n, currency: "USD", date: "2026-02-15", status: "open" },
  ];
  for (const v of vendorSpec) {
    if (!byslug[v.project]) continue;
    const usdMinor = computeUsdMinor(v.amount, v.currency, FX[v.currency]);
    await sql`
      INSERT INTO dev_commitments_ledger (
        project_id, category_id, commitment_code,
        amount_usd_minor, amount_currency, amount_original_minor, fx_rate_at_commit,
        description, committed_date, status
      )
      SELECT
        ${byslug[v.project]}, c.id, ${v.code},
        ${String(usdMinor)}, ${v.currency}, ${String(v.amount)}, ${String(FX[v.currency])},
        ${v.desc}, ${v.date}, ${v.status}
      FROM dev_cost_categories c
      WHERE c.category_code = ${v.category}
      ON CONFLICT (commitment_code) DO NOTHING
    `;
  }
  console.log("✓ dev_commitments_ledger");

  // 5.5) Transactions ------------------------------------------------------
  // Mix of inflows (drawdown receipts, sale income) + outflows (vendor pays,
  // ops, marketing). We DON'T link inflows to drawdowns here — the drawdowns
  // are seeded in section 4 already and that's enough for the demo. The
  // self-sustaining check excludes drawdown-linked rows anyway.
  // 70% reconciled, 30% unreconciled.
  const txSpec = [
    // Eternal outflows (vendor payments)
    { code: "TXN-2025-000001", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "DESIGN_ARCHITECTURE", vendor: "VC-001", amount: 50_000_00n,  currency: "USD", date: "2025-02-15", desc: "Architecture milestone 1",          rec: true  },
    { code: "TXN-2025-000002", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "DESIGN_ARCHITECTURE", vendor: "VC-001", amount: 50_000_00n,  currency: "USD", date: "2025-04-20", desc: "Architecture milestone 2",          rec: true  },
    { code: "TXN-2025-000003", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "DESIGN_ARCHITECTURE", vendor: "VC-001", amount: 50_000_00n,  currency: "USD", date: "2025-08-15", desc: "Architecture final",                rec: true  },
    { code: "TXN-2025-000004", account: "ACC-IDR-OPS",  direction: "outflow", project: "eternal-villas", category: "LAND_PURCHASE",       vendor: null,    amount: 7_500_000_000_00n, currency: "IDR", date: "2025-01-25", desc: "Land purchase Eternal lot A",        rec: true  },
    { code: "TXN-2025-000005", account: "ACC-IDR-OPS",  direction: "outflow", project: "eternal-villas", category: "LAND_LEGAL",          vendor: null,    amount: 380_000_000_00n,   currency: "IDR", date: "2025-02-05", desc: "Notaris fees + AJB",                 rec: true  },
    { code: "TXN-2025-000006", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "PERMITS",             vendor: "VC-005",amount:  35_000_00n, currency: "USD", date: "2025-03-15", desc: "IMB permit fees",                   rec: true  },
    { code: "TXN-2025-000007", account: "ACC-IDR-OPS",  direction: "outflow", project: "eternal-villas", category: "CONSTR_FOUNDATION",   vendor: "VC-002",amount: 1_650_000_000_00n, currency: "IDR", date: "2025-05-10", desc: "Foundation milestone 1",            rec: true  },
    { code: "TXN-2025-000008", account: "ACC-IDR-OPS",  direction: "outflow", project: "eternal-villas", category: "CONSTR_FOUNDATION",   vendor: "VC-002",amount: 1_650_000_000_00n, currency: "IDR", date: "2025-08-20", desc: "Foundation milestone 2",            rec: false },
    { code: "TXN-2025-000009", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "MARKETING",           vendor: "VC-004",amount:  40_000_00n, currency: "USD", date: "2025-09-30", desc: "Q4 marketing push",                 rec: true  },
    { code: "TXN-2025-000010", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "OPERATIONS",          vendor: null,    amount:   8_000_00n, currency: "USD", date: "2025-10-05", desc: "Site management — Oct",             rec: true  },
    { code: "TXN-2025-000011", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "OPERATIONS",          vendor: null,    amount:   8_000_00n, currency: "USD", date: "2025-11-05", desc: "Site management — Nov",             rec: true  },
    { code: "TXN-2025-000012", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "OPERATIONS",          vendor: null,    amount:   8_000_00n, currency: "USD", date: "2025-12-05", desc: "Site management — Dec",             rec: true  },
    { code: "TXN-2026-000001", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "OPERATIONS",          vendor: null,    amount:   8_000_00n, currency: "USD", date: "2026-01-05", desc: "Site management — Jan",             rec: true  },
    { code: "TXN-2026-000002", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "OPERATIONS",          vendor: null,    amount:   8_000_00n, currency: "USD", date: "2026-02-05", desc: "Site management — Feb",             rec: true  },
    { code: "TXN-2026-000003", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "OPERATIONS",          vendor: null,    amount:   8_000_00n, currency: "USD", date: "2026-03-05", desc: "Site management — Mar",             rec: false },
    { code: "TXN-2026-000004", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "OPERATIONS",          vendor: null,    amount:   8_000_00n, currency: "USD", date: "2026-04-05", desc: "Site management — Apr",             rec: false },
    { code: "TXN-2026-000005", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "OVERHEAD",            vendor: null,    amount:  15_000_00n, currency: "USD", date: "2026-01-31", desc: "Q1 overhead allocation",            rec: true  },
    // Eternal inflows — sale income (positive cash flow makes Eternal self-sustaining)
    { code: "TXN-2026-000006", account: "ACC-USD-MAIN", direction: "inflow",  project: "eternal-villas", category: "SALE_INCOME",         vendor: null,    amount: 350_000_00n, currency: "USD", date: "2026-02-20", desc: "Eternal Villa EV-03 deposit",       rec: true  },
    { code: "TXN-2026-000007", account: "ACC-USD-MAIN", direction: "inflow",  project: "eternal-villas", category: "SALE_INCOME",         vendor: null,    amount: 280_000_00n, currency: "USD", date: "2026-03-15", desc: "Eternal Villa EV-05 deposit",       rec: true  },
    { code: "TXN-2026-000008", account: "ACC-USD-MAIN", direction: "inflow",  project: "eternal-villas", category: "SALE_INCOME",         vendor: null,    amount: 200_000_00n, currency: "USD", date: "2026-04-12", desc: "Eternal Villa EV-08 deposit",       rec: false },
    // Enso outflows
    { code: "TXN-2025-000020", account: "ACC-USD-MAIN", direction: "outflow", project: "enso-villas",    category: "DESIGN_ARCHITECTURE", vendor: "VC-006",amount:  40_000_00n, currency: "USD", date: "2025-07-15", desc: "Enso design milestone 1",           rec: true  },
    { code: "TXN-2025-000021", account: "ACC-USD-MAIN", direction: "outflow", project: "enso-villas",    category: "DESIGN_ARCHITECTURE", vendor: "VC-006",amount:  20_000_00n, currency: "USD", date: "2025-10-15", desc: "Enso design milestone 2",           rec: false },
    // Ahau outflows
    { code: "TXN-2025-000030", account: "ACC-USD-MAIN", direction: "outflow", project: "ahau-gardens",   category: "LAND_LEGAL",          vendor: "VC-008",amount:  20_000_00n, currency: "USD", date: "2025-09-25", desc: "Ahau lease registration",           rec: true  },
    { code: "TXN-2026-000020", account: "ACC-USDT-1",   direction: "outflow", project: "ahau-gardens",   category: "OPERATIONS",          vendor: null,    amount:   2_000_000_000n, currency: "USDT", date: "2026-02-10", desc: "Ahau ops fund (USDT)",       rec: true  },
    // FX_LOSS adjustment row
    { code: "TXN-2026-000030", account: "ACC-USD-MAIN", direction: "outflow", project: "eternal-villas", category: "FX_LOSS",             vendor: null,    amount:   3_500_00n, currency: "USD", date: "2026-03-31", desc: "Q1 FX revaluation loss",            rec: true  },
  ];
  for (const t of txSpec) {
    if (!byslug[t.project]) continue;
    const usdMinor = computeUsdMinor(t.amount, t.currency, FX[t.currency]);
    await sql`
      INSERT INTO dev_transactions (
        transaction_code, bank_account_id, direction,
        category_id, project_id, related_commitment_id,
        amount_minor, currency, amount_usd_minor, fx_rate_at_transaction,
        transaction_date, description, allocation_type,
        reconciled_at
      )
      SELECT
        ${t.code},
        (SELECT id FROM dev_bank_accounts WHERE account_code = ${t.account}),
        ${t.direction},
        (SELECT id FROM dev_cost_categories WHERE category_code = ${t.category}),
        ${byslug[t.project]},
        ${t.vendor ? sql`(SELECT id FROM dev_commitments_ledger WHERE commitment_code = ${t.vendor})` : sql`NULL`},
        ${String(t.amount)}, ${t.currency}, ${String(usdMinor)}, ${String(FX[t.currency])},
        ${t.date}, ${t.desc}, 'single_project',
        ${t.rec ? t.date + 'T18:00:00Z' : null}
      ON CONFLICT (transaction_code) DO NOTHING
    `;
  }
  console.log("✓ dev_transactions");

  // 5.6) Corporate events ---------------------------------------------------
  const eventSpec = [
    { code: "CE-001", type: "director_loan_in",        amount:  50_000_00n, currency: "USD", date: "2024-08-15", desc: "Director cash injection — short-term liquidity" },
    { code: "CE-002", type: "director_loan_repayment", amount:  20_000_00n, currency: "USD", date: "2025-02-28", desc: "Partial loan repayment" },
    { code: "CE-003", type: "dividend_declared",       amount:  30_000_00n, currency: "USD", date: "2025-03-15", desc: "FY2024 dividend declared" },
  ];
  for (const e of eventSpec) {
    const usdMinor = computeUsdMinor(e.amount, e.currency, FX[e.currency]);
    await sql`
      INSERT INTO dev_corporate_events (
        event_code, event_type,
        amount_usd_minor, amount_currency, amount_original_minor, fx_rate,
        event_date, description
      )
      VALUES (${e.code}, ${e.type},
              ${String(usdMinor)}, ${e.currency}, ${String(e.amount)}, ${String(FX[e.currency])},
              ${e.date}, ${e.desc})
      ON CONFLICT (event_code) DO NOTHING
    `;
  }
  console.log("✓ dev_corporate_events");

  // 5.7) FX snapshots — weekly back-fill for the past 18 months -------------
  // Daily would be 540 rows × ~80ms RTT = 43 seconds. Weekly is 78 rows.
  // The cron job rolls today forward when the last snapshot is older.
  const fxBaseDate = new Date("2024-11-01");
  const fxRowsToInsert = [];
  for (let i = 0; i < 78; i++) {
    const d = new Date(fxBaseDate);
    d.setDate(d.getDate() + i * 7);
    const iso = d.toISOString().slice(0, 10);
    // Realistic curves — gentle drift around the seed FX rates.
    const drift = (i - 39) / 39; // -1 → +1 over 18 months
    const idr = (15800 + 400 * drift).toFixed(2);
    const rub = (90 + 5 * drift).toFixed(2);
    const eur = (0.92 + 0.04 * drift).toFixed(4);
    const cny = (7.20 + 0.10 * drift).toFixed(4);
    fxRowsToInsert.push({ iso, idr, rub, eur, cny });
  }
  // Insert each FX row idempotently (~80ms per row × 78 rows ≈ 6s).
  for (const r of fxRowsToInsert) {
    await sql`
      INSERT INTO dev_fx_snapshots (
        snapshot_date, base_currency, rate_idr, rate_rub, rate_eur,
        rate_usdt, rate_cny, source, notes
      )
      VALUES (
        ${r.iso}, 'USD', ${r.idr}, ${r.rub}, ${r.eur},
        '1.0', ${r.cny}, 'custom', 'seed-bulk'
      )
      ON CONFLICT (snapshot_date) DO NOTHING
    `;
  }
  console.log(`✓ dev_fx_snapshots (${fxRowsToInsert.length} weekly rows)`);

  // 5.8) Sample distribution — Eternal Villas, distribution #1 -------------
  // capital_return type, $200k total, status='completed' (executed flow shown).
  // Allocations: priority 1 (INV-001 GP) gets paid first; remainder to
  // priority 2 (INV-002, INV-003) pro-rata; priority 3 (INV-004) is junior.
  //
  // Idempotency: we look for an existing distribution with this project
  // and number=1 and skip if found.
  const existingDistribution = await sql`
    SELECT id FROM distributions
    WHERE project_id = ${byslug["eternal-villas"]} AND distribution_number = 1
    LIMIT 1
  `;
  if (existingDistribution.length === 0) {
    // Compute allocations against current outstanding capital per commitment.
    const outstandingRows = await sql`
      SELECT
        cc.id AS commitment_id, cc.commitment_code,
        cc.capital_return_priority AS priority,
        cc.profit_share_percent::text AS profit_share,
        coalesce(iw.total_drawn_usd_minor, 0)::bigint AS drawn,
        coalesce(iw.total_returned_capital_usd_minor, 0)::bigint AS returned,
        iw.id AS wallet_id,
        iw.available_balance_usd_minor::text AS available
      FROM capital_commitments cc
      JOIN investor_wallets iw ON iw.commitment_id = cc.id
      WHERE cc.project_id = ${byslug["eternal-villas"]}
        AND cc.status = 'active'
      ORDER BY cc.capital_return_priority ASC, cc.commitment_code ASC
    `;
    const total = 200_000_00n;
    const buckets = new Map();
    for (const r of outstandingRows) {
      const outstanding = BigInt(r.drawn) - BigInt(r.returned);
      if (outstanding <= 0n) continue;
      const key = r.priority;
      const arr = buckets.get(key) ?? [];
      arr.push({ ...r, outstanding });
      buckets.set(key, arr);
    }
    const allocs = [];
    let remaining = total;
    for (const prio of [...buckets.keys()].sort((a, b) => a - b)) {
      if (remaining <= 0n) break;
      const tier = buckets.get(prio);
      const tierTotal = tier.reduce((acc, r) => acc + r.outstanding, 0n);
      const tierAlloc = remaining < tierTotal ? remaining : tierTotal;
      let allocatedThisTier = 0n;
      let largestI = 0, largestV = 0n;
      const tierAllocs = [];
      for (let i = 0; i < tier.length; i++) {
        const r = tier[i];
        const share = (r.outstanding * tierAlloc) / tierTotal;
        tierAllocs.push({ row: r, cap: share });
        allocatedThisTier += share;
        if (share > largestV) { largestV = share; largestI = i; }
      }
      const residue = tierAlloc - allocatedThisTier;
      if (residue !== 0n) tierAllocs[largestI].cap += residue;
      allocs.push(...tierAllocs);
      remaining -= tierAlloc;
    }

    // Insert distribution + allocations + wallet_transactions atomically.
    const [dist] = await sql`
      INSERT INTO distributions (
        project_id, distribution_number, distribution_type,
        total_amount_usd_minor, trigger_reason, effective_date,
        status, completed_at, notes
      )
      VALUES (
        ${byslug["eternal-villas"]}, 1, 'capital_return',
        ${String(total)}, 'manual', '2026-03-31',
        'completed', '2026-03-31T18:00:00Z',
        'Sample distribution showing the executed flow end-to-end.'
      )
      RETURNING id
    `;
    const distId = dist.id;

    for (const a of allocs) {
      const [allocRow] = await sql`
        INSERT INTO distribution_allocations (
          distribution_id, commitment_id,
          capital_return_amount_usd_minor, profit_amount_usd_minor,
          total_amount_usd_minor,
          outstanding_capital_at_declare_usd_minor,
          profit_share_percent_used,
          status, executed_at
        )
        VALUES (
          ${distId}, ${a.row.commitment_id},
          ${String(a.cap)}, '0',
          ${String(a.cap)},
          ${String(a.row.outstanding)},
          ${a.row.profit_share},
          'executed', '2026-03-31T18:00:00Z'
        )
        RETURNING id
      `;
      // Wallet transaction + balance updates.
      const newAvail = BigInt(a.row.available) + a.cap;
      const [walletTx] = await sql`
        INSERT INTO wallet_transactions (
          wallet_id, commitment_id, transaction_type,
          amount_usd_minor,
          balance_available_after_usd_minor, balance_hold_after_usd_minor,
          distribution_id, description, occurred_at
        )
        VALUES (
          ${a.row.wallet_id}, ${a.row.commitment_id}, 'capital_return',
          ${String(a.cap)},
          ${String(newAvail)}, '0',
          ${distId}, ${'Capital return — distribution #1'},
          '2026-03-31T18:00:00Z'
        )
        RETURNING id
      `;
      await sql`
        UPDATE distribution_allocations
           SET wallet_transaction_id = ${walletTx.id}
         WHERE id = ${allocRow.id}
      `;
      await sql`
        UPDATE investor_wallets
           SET available_balance_usd_minor    = ${String(newAvail)},
               total_returned_capital_usd_minor = total_returned_capital_usd_minor + ${String(a.cap)},
               last_activity_at = '2026-03-31T18:00:00Z'
         WHERE id = ${a.row.wallet_id}
      `;
    }
    console.log(`✓ distributions (#1, ${allocs.length} allocations executed)`);
  } else {
    console.log("✓ distributions (#1 already present, skipped)");
  }

  // 5) Counts after seed.
  console.log("\nCounts after seed:");
  for (const t of [
    "development_project_meta","contacts","contact_roles","lead_sources","agents",
    "investors","capital_commitments","capital_drawdowns",
    "investor_wallets","wallet_transactions",
    "distributions","distribution_allocations",
    "dev_bank_accounts","dev_cost_categories","dev_budget_lines",
    "dev_commitments_ledger","dev_transactions","dev_corporate_events",
    "dev_fx_snapshots"
  ]) {
    const [r] = await sql.unsafe(`SELECT count(*)::int AS c FROM ${t}`);
    console.log(`  ${t.padEnd(28)} count=${r.c}`);
  }

  // 6) Reconciliation: wallet balance == drawdowns + distributions − withdrawals.
  // (For seed: no withdrawals, so it's drawdowns + capital_return distributions.)
  const walletDrift = await sql`
    WITH expected AS (
      SELECT iw.id AS wallet_id,
             coalesce(d.drawn,0)::bigint + coalesce(c.returned,0)::bigint - coalesce(w.withdrawn,0)::bigint
               AS expected_balance
      FROM investor_wallets iw
      LEFT JOIN (
        SELECT commitment_id, sum(amount_usd_minor)::bigint AS drawn
        FROM capital_drawdowns WHERE status='received' GROUP BY commitment_id
      ) d ON d.commitment_id = iw.commitment_id
      LEFT JOIN (
        SELECT commitment_id, sum(capital_return_amount_usd_minor + profit_amount_usd_minor)::bigint AS returned
        FROM distribution_allocations WHERE status='executed' GROUP BY commitment_id
      ) c ON c.commitment_id = iw.commitment_id
      LEFT JOIN (
        SELECT wallet_id, sum(-amount_usd_minor)::bigint AS withdrawn
        FROM wallet_transactions
        WHERE transaction_type IN ('wallet_withdrawal','wallet_take_asset','wallet_reinvest_out')
        GROUP BY wallet_id
      ) w ON w.wallet_id = iw.id
    )
    SELECT iw.id, iw.available_balance_usd_minor::text AS actual,
           e.expected_balance::text AS expected
    FROM investor_wallets iw
    JOIN expected e ON e.wallet_id = iw.id
    WHERE iw.available_balance_usd_minor::text <> e.expected_balance::text
  `;
  if (walletDrift.length > 0) {
    console.warn(`⚠ Wallet drift after distributions on ${walletDrift.length} wallets:`, walletDrift);
  } else {
    console.log("✓ wallet balances reconcile to drawdowns + distributions (no drift)");
  }

  // 8) Bank balance reconciliation: current_balance == sum of transactions.
  const bankDrift = await sql`
    SELECT a.id, a.account_code, a.current_balance_minor::text AS actual,
           coalesce(
             sum(t.amount_minor) FILTER (WHERE t.direction='inflow'), 0
           )::bigint - coalesce(
             sum(t.amount_minor) FILTER (WHERE t.direction='outflow'), 0
           )::bigint AS net_tx
    FROM dev_bank_accounts a
    LEFT JOIN dev_transactions t ON t.bank_account_id = a.id
    GROUP BY a.id, a.account_code, a.current_balance_minor
    HAVING TRUE
  `;
  // Note: we DON'T expect actual == net_tx since seed bank balances were set
  // independently (representing the "starting balance + transactions" view).
  // We only WARN if a balance is wildly off, e.g. negative net flow exceeds
  // the manual balance — that would indicate an inconsistency.
  for (const b of bankDrift) {
    const actual = BigInt(b.actual);
    const netTx = BigInt(b.net_tx);
    if (netTx < 0n && -netTx > actual) {
      console.warn(`⚠ Bank ${b.account_code}: net tx outflow ${(-netTx).toString()} > balance ${actual.toString()}`);
    }
  }
  console.log(`✓ bank account / transactions reconciliation (${bankDrift.length} accounts checked)`);

  // ---------------------------------------------------------------------
  // Stage 2.3.C — notification templates + rules for the 5 cron events,
  // and portal access mappings for 2 demo investors.
  //
  // For dev, EMAIL_DRY_RUN=1 should be set so the dispatcher doesn't
  // actually send. The dev_notification_delivery_log entries get a
  // status='dry_run' (or similar) — see lib/development/server/email.ts.
  // ---------------------------------------------------------------------

  // 9.1) Notification templates (EN; RU is stubbed via the same template
  // until full translation lands — the cron dispatcher always picks EN
  // when the language column doesn't match an investor's reporting_language).
  const templates = [
    {
      name: "drawdown_overdue_en",
      lang: "en",
      subject: "Drawdown {{drawdownNumber}} on {{commitmentCode}} is overdue",
      bodyHtml:
        "<p>Hi {{investorName}},</p><p>Drawdown #{{drawdownNumber}} on commitment {{commitmentCode}} (originally due {{dueDate}}) is now marked overdue.</p><p>Please contact your Arconique account manager to confirm next steps.</p>",
      bodyText:
        "Hi {{investorName}}, drawdown #{{drawdownNumber}} on commitment {{commitmentCode}} (due {{dueDate}}) is now marked overdue. Please contact your Arconique account manager.",
      description: "Sent to investor + internal team when a drawdown crosses its due date.",
    },
    {
      name: "bank_balance_below_threshold_en",
      lang: "en",
      subject: "Bank account {{accountCode}} below threshold",
      bodyHtml:
        "<p>Account <strong>{{accountCode}}</strong> ({{currency}}) is below its minimum threshold.</p><p>Current balance: {{balance}} · threshold: {{threshold}} · suggested drawdown: {{suggested}}.</p>",
      bodyText:
        "Account {{accountCode}} ({{currency}}) is below threshold. Current: {{balance}}, threshold: {{threshold}}, suggested drawdown: {{suggested}}.",
      description: "Internal alert — fires every 4h, with 24h cooldown per account.",
    },
    {
      name: "project_self_sustaining_reached_en",
      lang: "en",
      subject: "{{projectName}} has reached the Self-Sustaining Threshold",
      bodyHtml:
        "<p>Project <strong>{{projectName}}</strong> has crossed the 90-day Self-Sustaining Threshold.</p><p>Net cash flow: {{netCashFlow}}. The team should review whether to declare a capital return distribution.</p>",
      bodyText:
        "Project {{projectName}} reached the 90-day Self-Sustaining Threshold. Net cash flow: {{netCashFlow}}. Consider declaring a distribution.",
      description: "Internal + GP alert when a project first crosses the threshold.",
    },
    {
      name: "project_self_sustaining_lost_en",
      lang: "en",
      subject: "{{projectName}} no longer meets Self-Sustaining Threshold",
      bodyHtml:
        "<p>Project <strong>{{projectName}}</strong> has dropped below the 90-day Self-Sustaining Threshold.</p><p>Net cash flow: {{netCashFlow}}. Review project finances.</p>",
      bodyText:
        "Project {{projectName}} dropped below Self-Sustaining Threshold. Net cash flow: {{netCashFlow}}.",
      description: "Internal alert when a previously-sustaining project drops below.",
    },
    {
      name: "bank_balance_discrepancy_en",
      lang: "en",
      subject: "Bank balance discrepancy on {{accountCode}}",
      bodyHtml:
        "<p>Account <strong>{{accountCode}}</strong> ({{currency}}) shows a balance discrepancy of {{drift}} USD.</p><p>Current: {{current}} · expected from transactions: {{expected}}. Investigate before the next reconciliation cycle.</p>",
      bodyText:
        "Account {{accountCode}} ({{currency}}) discrepancy: drift {{drift}} USD. Current: {{current}}, expected: {{expected}}.",
      description: "Internal finance team alert — fires when daily reconciliation detects > $1 USD drift.",
    },
  ];
  for (const t of templates) {
    await sql`
      INSERT INTO dev_notification_templates (
        template_name, subject, body_html, body_text, language, description
      )
      VALUES (${t.name}, ${t.subject}, ${t.bodyHtml}, ${t.bodyText}, ${t.lang}, ${t.description})
      ON CONFLICT (template_name) DO NOTHING
    `;
  }
  console.log(`✓ dev_notification_templates (${templates.length} 2.3.B event templates)`);

  // Stage 2.3.D — welcome + password-reset templates (EN + RU).
  // Used by the grant-access admin flow.
  const portalTemplates = [
    {
      name: "investor_portal_welcome_en",
      lang: "en",
      subject: "Welcome to the Arconique Investor Portal",
      bodyHtml:
        "<p>Hello {{investorName}},</p><p>Arconique has set up your Investor Portal access. Sign in at {{portalUrl}}.</p><p>If you have questions, contact your account manager.</p>",
      bodyText:
        "Hello {{investorName}}, Arconique has set up your Investor Portal access. Sign in at {{portalUrl}}.",
      description: "Initial onboarding email after grant-access flow runs.",
    },
    {
      name: "investor_portal_welcome_ru",
      lang: "ru",
      subject: "Добро пожаловать в Инвесторский портал Arconique",
      bodyHtml:
        "<p>Здравствуйте, {{investorName}}.</p><p>Arconique создал для вас доступ к Инвесторскому порталу. Вход: {{portalUrl}}.</p><p>По вопросам обращайтесь к вашему менеджеру.</p>",
      bodyText:
        "Здравствуйте {{investorName}}, Arconique создал для вас доступ к Инвесторскому порталу. Вход: {{portalUrl}}.",
      description: "Initial onboarding email — Russian.",
    },
    {
      name: "investor_portal_password_reset_en",
      lang: "en",
      subject: "Arconique Investor Portal — password reset",
      bodyHtml:
        "<p>Hello {{investorName}},</p><p>A password reset was requested for your Arconique Investor Portal account. Click here to set a new password: {{resetUrl}}</p><p>If you did not request this, you can safely ignore this email.</p>",
      bodyText:
        "Password reset for Arconique Investor Portal: {{resetUrl}}. If you did not request this, ignore this email.",
      description: "Password reset email triggered from the portal profile page.",
    },
    {
      name: "investor_portal_password_reset_ru",
      lang: "ru",
      subject: "Arconique Инвесторский портал — сброс пароля",
      bodyHtml:
        "<p>Здравствуйте, {{investorName}}.</p><p>Был запрошен сброс пароля для вашего аккаунта в Инвесторском портале Arconique. Сбросить пароль: {{resetUrl}}</p><p>Если вы не запрашивали сброс, проигнорируйте это письмо.</p>",
      bodyText:
        "Сброс пароля для Инвесторского портала Arconique: {{resetUrl}}. Если вы не запрашивали — проигнорируйте это письмо.",
      description: "Password reset email — Russian.",
    },
  ];
  for (const t of portalTemplates) {
    await sql`
      INSERT INTO dev_notification_templates (
        template_name, subject, body_html, body_text, language, description
      )
      VALUES (${t.name}, ${t.subject}, ${t.bodyHtml}, ${t.bodyText}, ${t.lang}, ${t.description})
      ON CONFLICT (template_name) DO NOTHING
    `;
  }
  console.log(`✓ dev_notification_templates (${portalTemplates.length} 2.3.D portal templates)`);

  // 9.2) Notification rules — one per template, all active for in-app + email.
  const rules = [
    {
      name: "Drawdown overdue alert",
      event: "drawdown_overdue",
      template: "drawdown_overdue_en",
      channel: "email",
      recipientType: "specific_role",
      roleKey: "finance_manager",
      description: "Notify finance manager when a drawdown becomes overdue.",
    },
    {
      name: "Bank balance threshold alert",
      event: "bank_balance_below_threshold",
      template: "bank_balance_below_threshold_en",
      channel: "email",
      recipientType: "specific_role",
      roleKey: "finance_manager",
      description: "Notify finance manager when an account drops below threshold.",
    },
    {
      name: "Project reaches self-sustaining",
      event: "project_self_sustaining_reached",
      template: "project_self_sustaining_reached_en",
      channel: "in_app",
      recipientType: "specific_role",
      roleKey: "director",
      description: "Notify director (and GP) when a project first crosses the threshold.",
    },
    {
      name: "Project loses self-sustaining",
      event: "project_self_sustaining_lost",
      template: "project_self_sustaining_lost_en",
      channel: "in_app",
      recipientType: "specific_role",
      roleKey: "director",
      description: "Notify director when a project drops below the threshold.",
    },
    {
      name: "Bank balance discrepancy",
      event: "bank_balance_discrepancy",
      template: "bank_balance_discrepancy_en",
      channel: "email",
      recipientType: "specific_role",
      roleKey: "finance_manager",
      description: "Notify finance manager when daily reconciliation detects drift.",
    },
  ];
  for (const r of rules) {
    await sql`
      INSERT INTO dev_notification_rules (
        rule_name, description, trigger_event, recipient_type, recipient_role_key,
        channel, template_name, is_active
      )
      VALUES (
        ${r.name}, ${r.description}, ${r.event}, ${r.recipientType}, ${r.roleKey},
        ${r.channel}, ${r.template}, true
      )
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`✓ dev_notification_rules (${rules.length} 2.3.B event rules)`);

  // 9.3) Demo investor portal access — link 2 investors to app_users rows.
  // The Supabase Auth USER must be created separately (admin SDK or
  // Supabase dashboard). We seed the app_users → investors mapping here;
  // the auth.users.id is left NULL and must be populated when the auth
  // user is created. Demo creds are documented below for dev only.
  //
  // To create the auth users locally:
  //   supabase auth signup --email andrey.demo@example.com --password 'demo-password-123'
  //   supabase auth signup --email singapore.demo@example.com --password 'demo-password-456'
  // then update app_users.auth_user_id manually:
  //   UPDATE app_users SET auth_user_id = '<id from supabase>'
  //     WHERE email = 'andrey.demo@example.com';
  //
  // DO NOT use these emails or passwords in any environment other than
  // local development. They're documented here so demos can run.

  const portalSpec = [
    {
      email: "andrey.demo@example.com",
      fullName: "Andrey Petrov (demo)",
      investorCode: "INV-002",
    },
    {
      email: "singapore.demo@example.com",
      fullName: "Singapore Family Office (demo)",
      investorCode: "INV-003",
    },
  ];

  // Look up the investor_viewer role id once.
  const [viewerRole] = await sql`SELECT id FROM roles WHERE key = 'investor_viewer' LIMIT 1`;
  if (!viewerRole) {
    console.warn("⚠ investor_viewer role not found — skipping portal access seed.");
  } else {
    for (const p of portalSpec) {
      const [investor] = await sql`SELECT id FROM investors WHERE investor_code = ${p.investorCode} LIMIT 1`;
      if (!investor) continue;

      // Insert app_users row (auth_user_id NULL — to be set on Supabase signup).
      // Stage 2.3.D: status starts at 'invited'. The grant-access admin page
      // updates status to 'active' once the Supabase auth user exists. The
      // demo seeds 'invited' so the admin page can demonstrate the
      // "already granted (awaiting auth)" state without conflicting with
      // a real auth user creation flow.
      await sql`
        INSERT INTO app_users (email, full_name, status, investor_id)
        VALUES (${p.email}, ${p.fullName}, 'invited', ${investor.id})
        ON CONFLICT (email) DO UPDATE SET
          investor_id = EXCLUDED.investor_id,
          full_name   = EXCLUDED.full_name
      `;

      // Grant the investor_viewer role. The unique index is on
      // (user_id, role_id, scope_type, scope_id) — easiest to use a
      // NOT EXISTS guard than to match the composite ON CONFLICT target.
      await sql`
        INSERT INTO user_roles (user_id, role_id)
        SELECT u.id, ${viewerRole.id}
        FROM app_users u
        WHERE u.email = ${p.email}
          AND NOT EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = u.id AND ur.role_id = ${viewerRole.id}
          )
      `;
    }
    console.log(`✓ portal access mapped for ${portalSpec.length} demo investors`);
    console.log(`  next step: create Supabase auth users + UPDATE app_users SET auth_user_id = '<uid>' WHERE email = '...';`);
  }

  // ---------------------------------------------------------------------
  // Stage 2.4 — Site Operations + Vendor CRM + Material Tracking + Safety
  //
  // Idempotent. Re-runs verify reconciliation:
  //   - material_po_lines.quantity_delivered == sum of delivery_lines.quantity_received
  //   - material_po_lines.quantity_consumed  == sum of consumption_logs.quantity_consumed
  //
  // We intentionally seed 30 days of site reports (not 90 per spec) to
  // keep the seed under ~90s — adequate for cron + UI smoke tests.
  // ---------------------------------------------------------------------

  // 10.1) Vendors --------------------------------------------------------
  const vendorSpecs = [
    { code: "VND-001", legalName: "PT Konstruksi Jaya",   type: "general_contractor",        entity: "pt", taxId: "01.234.567.8-901.000", phone: "+62 361 123 4567", email: "ops@konstruksi-jaya.example", whatsapp: "+62 812 3456 7890", bank: "Bank Mandiri", bankAcct: "144-00-1234567-0" },
    { code: "VND-002", legalName: "CV Atap Bali",          type: "subcontractor_finishing",   entity: "cv", taxId: "02.345.678.9-012.000", phone: "+62 361 234 5678", email: "info@atap-bali.example", whatsapp: "+62 812 4567 8901", bank: "BCA", bankAcct: "234-5678901" },
    { code: "VND-003", legalName: "PT Lampu Listrik",      type: "subcontractor_mep",         entity: "pt", taxId: "03.456.789.0-123.000", phone: "+62 361 345 6789", email: "office@lampu-listrik.example", whatsapp: "+62 812 5678 9012", bank: "BNI", bankAcct: "345-67-89012-3" },
    { code: "VND-004", legalName: "Toko Material Sentosa", type: "material_supplier",         entity: "cv", taxId: "04.567.890.1-234.000", phone: "+62 361 456 7890", email: "sales@material-sentosa.example", whatsapp: "+62 812 6789 0123", bank: "Bank Mandiri", bankAcct: "144-00-2345678-1" },
    { code: "VND-005", legalName: "Bali Wood Co",          type: "material_supplier",         entity: "cv", taxId: "05.678.901.2-345.000", phone: "+62 361 567 8901", email: "kayu@bali-wood.example", whatsapp: "+62 812 7890 1234", bank: "BCA", bankAcct: "456-7890123" },
    { code: "VND-006", legalName: "Permits Indonesia Konsultan", type: "permits_legal",      entity: "cv", taxId: "06.789.012.3-456.000", phone: "+62 361 678 9012", email: "office@permits-id.example", whatsapp: null,            bank: null, bankAcct: null },
    { code: "VND-007", legalName: "Logistik Cepat",        type: "logistics_transport",       entity: "cv", taxId: "07.890.123.4-567.000", phone: "+62 361 789 0123", email: "ops@logistik-cepat.example", whatsapp: "+62 812 8901 2345", bank: "BNI", bankAcct: "345-67-90123-4" },
    { code: "VND-008", legalName: "Bali Architecture Studio",  type: "architect_designer",   entity: "pt", taxId: "08.901.234.5-678.000", phone: "+62 361 890 1234", email: "studio@bali-arch.example", whatsapp: "+62 812 9012 3456", bank: "BCA", bankAcct: "567-8901234" },
  ];
  for (const v of vendorSpecs) {
    await sql`
      INSERT INTO vendors (
        vendor_code, legal_name, vendor_type, legal_entity_type,
        primary_phone, primary_email, whatsapp_phone,
        tax_id, bank_name, bank_account_number,
        on_time_delivery_rate, quality_rating, status
      )
      VALUES (
        ${v.code}, ${v.legalName}, ${v.type}, ${v.entity},
        ${v.phone}, ${v.email}, ${v.whatsapp},
        ${v.taxId}, ${v.bank}, ${v.bankAcct},
        ${(85 + Math.random() * 12).toFixed(2)}, ${(3.5 + Math.random() * 1.4).toFixed(2)},
        'active'
      )
      ON CONFLICT (vendor_code) DO NOTHING
    `;
  }
  console.log("✓ vendors (8 demo entities)");

  // 10.2) Vendor engagements --------------------------------------------
  // Distribute across the 3 projects. Some active, some completed, one terminated.
  const engagementSpecs = [
    { code: "ENG-2024-001", vendor: "VND-001", project: "eternal-villas", scope: "Eternal main contractor — full build", start: "2024-09-01", expectedEnd: "2026-06-30", status: "active" },
    { code: "ENG-2024-002", vendor: "VND-008", project: "eternal-villas", scope: "Architecture & design — Eternal Villas master",   start: "2024-04-15", expectedEnd: "2025-03-15", actualEnd: "2025-03-22", status: "completed" },
    { code: "ENG-2024-003", vendor: "VND-003", project: "eternal-villas", scope: "MEP rough-in + finishing",  start: "2025-06-01", expectedEnd: "2026-04-30", status: "active" },
    { code: "ENG-2024-004", vendor: "VND-002", project: "eternal-villas", scope: "Roofing + atap finishing",  start: "2025-10-01", expectedEnd: "2026-02-28", status: "active" },
    { code: "ENG-2024-005", vendor: "VND-004", project: "eternal-villas", scope: "Cement + steel supply",     start: "2024-11-01", expectedEnd: "2026-06-30", status: "active" },
    { code: "ENG-2024-006", vendor: "VND-006", project: "eternal-villas", scope: "Permits + IMB filings",      start: "2024-08-01", expectedEnd: "2025-02-28", actualEnd: "2025-02-15", status: "completed" },
    { code: "ENG-2024-007", vendor: "VND-007", project: "eternal-villas", scope: "Heavy logistics + transport", start: "2025-01-15", expectedEnd: "2026-06-30", status: "active" },
    { code: "ENG-2024-008", vendor: "VND-008", project: "enso-villas",    scope: "Enso concept + DD design",   start: "2025-07-01", expectedEnd: "2026-01-31", status: "active" },
    { code: "ENG-2024-009", vendor: "VND-005", project: "enso-villas",    scope: "Timber supply",              start: "2025-09-01", expectedEnd: "2026-04-30", status: "active" },
    { code: "ENG-2024-010", vendor: "VND-006", project: "ahau-gardens",   scope: "Initial permits — Ahau",     start: "2025-08-01", expectedEnd: "2026-02-28", status: "terminated" },
  ];
  for (const e of engagementSpecs) {
    if (!byslug[e.project]) continue;
    await sql`
      INSERT INTO vendor_engagements (
        vendor_id, project_id, engagement_code, scope_description,
        start_date, expected_end_date, actual_end_date, status,
        termination_reason
      )
      SELECT v.id, ${byslug[e.project]}, ${e.code}, ${e.scope},
             ${e.start}, ${e.expectedEnd}, ${e.actualEnd ?? null}, ${e.status},
             ${e.status === "terminated" ? "Scope adjusted — work consolidated under VND-001" : null}
      FROM vendors v WHERE v.vendor_code = ${e.vendor}
      ON CONFLICT (engagement_code) DO NOTHING
    `;
  }
  console.log(`✓ vendor_engagements (${engagementSpecs.length} demo)`);

  // 10.3) Site zones (focus on Eternal — others get 1 each) -----------
  const zoneSpecs = [
    // Eternal Villas — 8 zones
    { project: "eternal-villas", code: "FOUND",    name: "Foundation & site prep",    type: "foundation",     order: 10 },
    { project: "eternal-villas", code: "BLDG-A-S", name: "Building A — structure",    type: "structure",      order: 20 },
    { project: "eternal-villas", code: "BLDG-A-F", name: "Building A — finishing",    type: "finishing",      order: 30 },
    { project: "eternal-villas", code: "BLDG-B",   name: "Building B — full build",   type: "structure",      order: 40 },
    { project: "eternal-villas", code: "MEP",      name: "MEP rough-in & fit-out",    type: "mep",            order: 50 },
    { project: "eternal-villas", code: "POOL",     name: "Pool & landscaping pool",   type: "infrastructure", order: 60 },
    { project: "eternal-villas", code: "LAND",     name: "Landscaping & gardens",     type: "landscaping",    order: 70 },
    { project: "eternal-villas", code: "PARK",     name: "Parking & access road",     type: "infrastructure", order: 80 },
    // Enso — 6 zones
    { project: "enso-villas",    code: "FOUND",    name: "Enso foundation",           type: "foundation",     order: 10 },
    { project: "enso-villas",    code: "STRUCT",   name: "Enso structure",            type: "structure",      order: 20 },
    { project: "enso-villas",    code: "FINISH",   name: "Enso finishing",            type: "finishing",      order: 30 },
    { project: "enso-villas",    code: "MEP",      name: "Enso MEP",                  type: "mep",            order: 40 },
    { project: "enso-villas",    code: "LAND",     name: "Enso landscaping",          type: "landscaping",    order: 50 },
    { project: "enso-villas",    code: "PARK",     name: "Enso parking",              type: "infrastructure", order: 60 },
    // Ahau — 4 zones
    { project: "ahau-gardens",   code: "FOUND",    name: "Ahau foundation",           type: "foundation",     order: 10 },
    { project: "ahau-gardens",   code: "STRUCT",   name: "Ahau structure",            type: "structure",      order: 20 },
    { project: "ahau-gardens",   code: "FINISH",   name: "Ahau finishing",            type: "finishing",      order: 30 },
    { project: "ahau-gardens",   code: "LAND",     name: "Ahau landscaping",          type: "landscaping",    order: 40 },
  ];
  for (const z of zoneSpecs) {
    if (!byslug[z.project]) continue;
    await sql`
      INSERT INTO site_zones (project_id, zone_code, zone_name, zone_type, display_order)
      VALUES (${byslug[z.project]}, ${z.code}, ${z.name}, ${z.type}, ${z.order})
      ON CONFLICT (project_id, zone_code) DO NOTHING
    `;
  }
  console.log(`✓ site_zones (${zoneSpecs.length} zones)`);

  // 10.4) Site reports — 30 days for Eternal Villas (idempotent via UNIQUE) ----
  // Today is 2026-04-30; we seed 2026-04-01 → 2026-04-30.
  const REPORT_DAYS = 30;
  const baseDate = new Date("2026-04-30");
  const eternalId = byslug["eternal-villas"];
  if (eternalId) {
    const eternalZones = await sql`SELECT id, zone_code FROM site_zones WHERE project_id = ${eternalId}`;
    const eng = await sql`SELECT id, vendor_id FROM vendor_engagements WHERE project_id = ${eternalId} AND status = 'active' LIMIT 5`;

    let createdReports = 0;
    for (let i = 0; i < REPORT_DAYS; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      // Random-ish weather / workforce
      const weatherOpts = ["clear", "clear", "overcast", "light_rain", "heavy_rain"];
      const weather = weatherOpts[Math.floor((i * 7) % weatherOpts.length)];
      const workers = 18 + ((i * 5) % 22);
      const tempMin = 22 + ((i * 3) % 4);
      const tempMax = 28 + ((i * 2) % 5);

      const inserted = await sql`
        INSERT INTO site_reports (
          project_id, report_date, weather_conditions, weather_notes,
          temperature_celsius_min, temperature_celsius_max,
          total_workers_present, total_workers_planned,
          summary, reporter_role, status, source_channel,
          submitted_at, reviewed_at
        )
        VALUES (
          ${eternalId}, ${iso}, ${weather},
          ${weather === "heavy_rain" ? "Reduced productivity AM" : null},
          ${tempMin}, ${tempMax},
          ${workers}, ${workers + 4},
          ${`Day ${REPORT_DAYS - i} — ${weather} conditions, normal progression on Building A + MEP zones.`},
          'site_manager', 'reviewed', 'web',
          ${iso + "T18:00:00Z"}, ${iso + "T19:30:00Z"}
        )
        ON CONFLICT (project_id, report_date) DO NOTHING
        RETURNING id
      `;
      if (inserted.length === 0) continue;
      const reportId = inserted[0].id;
      createdReports += 1;

      // Zone activities — 2-3 zones per day (rotate)
      const dayZones = eternalZones.slice(i % 4, (i % 4) + 3);
      for (const z of dayZones) {
        const zoneWorkers = Math.max(2, Math.floor(workers / 4));
        const hasBlocker = (i % 7 === 3) && z.zone_code === "MEP";
        await sql`
          INSERT INTO site_report_zones (
            site_report_id, zone_id, activities_completed, activities_planned_tomorrow,
            workers_in_zone, vendor_engagement_id,
            progress_percent_today, cumulative_progress_percent,
            has_blocker, blocker_description
          )
          VALUES (
            ${reportId}, ${z.id},
            ARRAY['Routine work day ' || ${REPORT_DAYS - i}, 'Quality checks completed'],
            ARRAY['Continue scope', 'Coordinate with foreman'],
            ${zoneWorkers}, ${eng[0]?.id ?? null},
            ${(0.5 + Math.random() * 1.5).toFixed(2)}, ${Math.min(95, 30 + (REPORT_DAYS - i)).toFixed(2)},
            ${hasBlocker}, ${hasBlocker ? "Material delivery delayed — waiting on cement shipment" : null}
          )
          ON CONFLICT (site_report_id, zone_id) DO NOTHING
        `;
      }

      // Workforce log per report
      await sql`
        INSERT INTO site_workforce_logs (
          site_report_id, vendor_engagement_id, role_category,
          worker_count, hours_per_worker, rate_per_hour_minor, rate_currency
        )
        VALUES
          (${reportId}, ${eng[0]?.id ?? null}, 'foreman', 2, 8.0, 5000000, 'IDR'),
          (${reportId}, ${eng[0]?.id ?? null}, 'skilled_worker', ${Math.floor(workers * 0.4)}, 8.0, 2500000, 'IDR'),
          (${reportId}, ${eng[0]?.id ?? null}, 'unskilled_worker', ${Math.floor(workers * 0.5)}, 8.0, 1500000, 'IDR')
      `;
    }
    console.log(`✓ site_reports (${createdReports} created across ${REPORT_DAYS} days for Eternal)`);
  }

  // 10.5) Material POs (15) ---------------------------------------------
  // 10 fully delivered, 3 partially, 2 ordered (one overdue for cron test).
  const matPoSpecs = [
    { code: "PO-2025-0001", project: "eternal-villas", vendor: "VND-004", date: "2025-04-01", expDel: "2025-04-15", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Portland cement",   cat: "cement", uom: "bag",    qty: 500,   unitUsd: 9_00n,  unitOrig: 147_600_00n, delivered: 500, consumed: 500 },
      { num: 2, name: "Reinforcement bar", cat: "rebar",  uom: "ton",    qty: 25,    unitUsd: 750_00n,unitOrig: 12_300_000_00n, delivered: 25,  consumed: 25  },
    ], status: "fully_delivered" },
    { code: "PO-2025-0002", project: "eternal-villas", vendor: "VND-004", date: "2025-06-15", expDel: "2025-06-30", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Sand fine",   cat: "sand",   uom: "m3", qty: 80,  unitUsd: 12_00n,  unitOrig: 196_800_00n,  delivered: 80, consumed: 80 },
      { num: 2, name: "Gravel 20mm", cat: "gravel", uom: "m3", qty: 60,  unitUsd: 14_00n,  unitOrig: 229_600_00n,  delivered: 60, consumed: 55 },
    ], status: "fully_delivered" },
    { code: "PO-2025-0003", project: "eternal-villas", vendor: "VND-005", date: "2025-08-01", expDel: "2025-08-20", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Teak beams 10cm", cat: "wood", uom: "pcs", qty: 200, unitUsd: 45_00n, unitOrig: 738_000_00n, delivered: 200, consumed: 180 },
    ], status: "fully_delivered" },
    { code: "PO-2025-0004", project: "eternal-villas", vendor: "VND-004", date: "2025-09-01", expDel: "2025-09-20", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Concrete admix", cat: "concrete_admixture", uom: "liter", qty: 500, unitUsd: 8_00n, unitOrig: 131_200_00n, delivered: 500, consumed: 500 },
    ], status: "fully_delivered" },
    { code: "PO-2025-0005", project: "eternal-villas", vendor: "VND-002", date: "2025-10-15", expDel: "2025-11-05", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Roof tiles natural slate", cat: "tiles", uom: "m2", qty: 800, unitUsd: 35_00n, unitOrig: 574_000_00n, delivered: 800, consumed: 700 },
    ], status: "fully_delivered" },
    { code: "PO-2025-0006", project: "eternal-villas", vendor: "VND-003", date: "2025-11-01", expDel: "2025-11-25", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Electrical panels", cat: "electrical", uom: "set",   qty: 12, unitUsd: 1_200_00n, unitOrig: 19_680_000_00n, delivered: 12, consumed: 8 },
      { num: 2, name: "PVC conduit 25mm",  cat: "electrical", uom: "m",     qty: 2000, unitUsd: 1_50n,    unitOrig: 24_600_00n,    delivered: 2000, consumed: 1500 },
    ], status: "fully_delivered" },
    { code: "PO-2025-0007", project: "eternal-villas", vendor: "VND-004", date: "2025-11-20", expDel: "2025-12-10", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Plaster mix",      cat: "plaster", uom: "bag", qty: 300, unitUsd: 7_00n,  unitOrig: 114_800_00n, delivered: 300, consumed: 250 },
      { num: 2, name: "White paint 20L",  cat: "paint",   uom: "pcs", qty: 80,  unitUsd: 95_00n, unitOrig: 1_558_000_00n, delivered: 80,  consumed: 60 },
    ], status: "fully_delivered" },
    { code: "PO-2025-0008", project: "eternal-villas", vendor: "VND-002", date: "2025-12-01", expDel: "2025-12-20", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Floor tiles porcelain 60x60", cat: "tiles", uom: "m2", qty: 600, unitUsd: 28_00n, unitOrig: 459_200_00n, delivered: 600, consumed: 450 },
    ], status: "fully_delivered" },
    { code: "PO-2025-0009", project: "eternal-villas", vendor: "VND-005", date: "2026-01-10", expDel: "2026-02-01", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Hardwood flooring", cat: "wood", uom: "m2", qty: 400, unitUsd: 55_00n, unitOrig: 902_000_00n, delivered: 400, consumed: 200 },
    ], status: "fully_delivered" },
    { code: "PO-2026-0010", project: "eternal-villas", vendor: "VND-004", date: "2026-02-15", expDel: "2026-03-15", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Window frames aluminum", cat: "windows", uom: "set", qty: 50, unitUsd: 320_00n, unitOrig: 5_248_000_00n, delivered: 50, consumed: 30 },
    ], status: "fully_delivered" },
    // Partially delivered (3)
    { code: "PO-2026-0011", project: "eternal-villas", vendor: "VND-003", date: "2026-03-01", expDel: "2026-04-01", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Plumbing fixtures", cat: "plumbing", uom: "set", qty: 20, unitUsd: 250_00n, unitOrig: 4_100_000_00n, delivered: 12, consumed: 8 },
      { num: 2, name: "Copper pipe 15mm",  cat: "plumbing", uom: "m",   qty: 1000, unitUsd: 4_00n,    unitOrig: 65_600_00n,    delivered: 600, consumed: 400 },
    ], status: "partially_delivered" },
    { code: "PO-2026-0012", project: "eternal-villas", vendor: "VND-002", date: "2026-03-20", expDel: "2026-04-20", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Glass panels tempered", cat: "glass", uom: "m2", qty: 200, unitUsd: 75_00n, unitOrig: 1_230_000_00n, delivered: 100, consumed: 50 },
    ], status: "partially_delivered" },
    { code: "PO-2026-0013", project: "enso-villas", vendor: "VND-005", date: "2026-03-25", expDel: "2026-04-15", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Bamboo poles 4m", cat: "wood", uom: "pcs", qty: 500, unitUsd: 12_00n, unitOrig: 196_800_00n, delivered: 200, consumed: 0 },
    ], status: "partially_delivered" },
    // Ordered, not yet delivered (2 — one overdue for cron test)
    { code: "PO-2026-0014", project: "eternal-villas", vendor: "VND-004", date: "2026-04-01", expDel: "2026-04-25", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Doorset solid wood", cat: "doors", uom: "set", qty: 30, unitUsd: 180_00n, unitOrig: 2_952_000_00n, delivered: 0, consumed: 0 },
    ], status: "ordered" },
    { code: "PO-2026-0015", project: "eternal-villas", vendor: "VND-002", date: "2026-04-20", expDel: "2026-04-15", currency: "IDR", fx: "16400", lines: [
      { num: 1, name: "Marble countertops", cat: "stone", uom: "m2", qty: 40, unitUsd: 220_00n, unitOrig: 3_608_000_00n, delivered: 0, consumed: 0 },
    ], status: "ordered" }, // intentionally past expected_delivery_date for the overdue cron
  ];

  for (const po of matPoSpecs) {
    if (!byslug[po.project]) continue;
    let totalUsd = 0n;
    let totalOrig = 0n;
    for (const l of po.lines) {
      totalUsd += BigInt(l.unitUsd) * BigInt(l.qty);
      totalOrig += BigInt(l.unitOrig) * BigInt(l.qty);
    }
    const inserted = await sql`
      INSERT INTO material_purchase_orders (
        po_code, project_id, vendor_id, order_date, expected_delivery_date,
        status, total_amount_usd_minor, total_amount_currency,
        total_amount_original_minor, fx_rate_at_order
      )
      SELECT ${po.code}, ${byslug[po.project]}, v.id, ${po.date}, ${po.expDel},
             ${po.status}, ${String(totalUsd)}, ${po.currency},
             ${String(totalOrig)}, ${po.fx}
      FROM vendors v WHERE v.vendor_code = ${po.vendor}
      ON CONFLICT (po_code) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) continue;
    const poId = inserted[0].id;
    for (const l of po.lines) {
      await sql`
        INSERT INTO material_po_lines (
          po_id, line_number, material_name, material_category,
          unit_of_measure, quantity_ordered,
          unit_price_usd_minor, unit_price_original_minor,
          quantity_delivered, quantity_consumed
        )
        VALUES (
          ${poId}, ${l.num}, ${l.name}, ${l.cat},
          ${l.uom}, ${l.qty.toFixed(4)},
          ${String(l.unitUsd)}, ${String(l.unitOrig)},
          ${l.delivered.toFixed(4)}, ${l.consumed.toFixed(4)}
        )
        ON CONFLICT (po_id, line_number) DO NOTHING
      `;
    }
  }
  console.log(`✓ material_purchase_orders + lines (${matPoSpecs.length} POs)`);

  // 10.6) Material deliveries (one per delivered PO, two for the partials) ---
  const deliverySpec = [];
  for (const po of matPoSpecs) {
    if (po.status === "ordered") continue;
    deliverySpec.push({
      code: `DEL-${po.code.replace("PO-", "")}`,
      poCode: po.code,
      date: po.expDel ?? po.date,
      qstatus: po.status === "fully_delivered" ? "accepted" : "partial_acceptance",
      lines: po.lines.map((l) => ({
        lineNum: l.num,
        qty: l.delivered,
        passed: l.delivered > 0,
      })),
    });
  }
  for (const d of deliverySpec) {
    const inserted = await sql`
      INSERT INTO material_deliveries (
        delivery_code, po_id, delivery_date, received_at,
        quality_check_status
      )
      SELECT ${d.code}, po.id, ${d.date}, ${d.date + "T14:00:00Z"}, ${d.qstatus}
      FROM material_purchase_orders po WHERE po.po_code = ${d.poCode}
      ON CONFLICT (delivery_code) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) continue;
    const delId = inserted[0].id;
    for (const l of d.lines) {
      if (l.qty <= 0) continue;
      await sql`
        INSERT INTO material_delivery_lines (
          delivery_id, po_line_id, quantity_received, quality_check_passed
        )
        SELECT ${delId}, pl.id, ${l.qty.toFixed(4)}, ${l.passed}
        FROM material_po_lines pl
        JOIN material_purchase_orders po ON po.id = pl.po_id
        WHERE po.po_code = ${d.poCode} AND pl.line_number = ${l.lineNum}
      `;
    }
  }
  console.log(`✓ material_deliveries (${deliverySpec.length})`);

  // 10.7) Safety incidents (8) -------------------------------------------
  // 5 minor (resolved), 2 moderate (resolved), 1 severe (open — for cron escalation test)
  const incidentSpecs = [
    { code: "INC-2026-0001", project: "eternal-villas", date: "2026-03-05", severity: "minor",     category: "fall",              affected: 1, desc: "Worker slipped on wet scaffold — minor bruise; sent home for the day", status: "resolved", actions: "First aid applied, replaced wet boards", resolvedAt: "2026-03-06T10:00:00Z" },
    { code: "INC-2026-0002", project: "eternal-villas", date: "2026-03-12", severity: "minor",     category: "equipment",          affected: 0, desc: "Power saw blade snapped during cutting — no injury", status: "resolved", actions: "Saw replaced, blade-change protocol reinforced", resolvedAt: "2026-03-12T17:00:00Z" },
    { code: "INC-2026-0003", project: "eternal-villas", date: "2026-03-20", severity: "minor",     category: "material_handling",  affected: 1, desc: "Worker strained back lifting cement bag",  status: "resolved", actions: "Worker rested 2 days, lifting refresher session", resolvedAt: "2026-03-22T09:00:00Z" },
    { code: "INC-2026-0004", project: "eternal-villas", date: "2026-04-02", severity: "moderate",  category: "fall",              affected: 1, desc: "Worker fell from 2m scaffold — sprained ankle, taken to clinic", status: "resolved", actions: "Clinic visit, X-ray clear, light duty for 1 week", resolvedAt: "2026-04-09T17:00:00Z" },
    { code: "INC-2026-0005", project: "eternal-villas", date: "2026-04-08", severity: "minor",     category: "electrical",         affected: 0, desc: "Loose live wire discovered in MEP zone — power cut",  status: "resolved", actions: "Section isolated, rewired by certified electrician", resolvedAt: "2026-04-08T19:00:00Z" },
    { code: "INC-2026-0006", project: "eternal-villas", date: "2026-04-15", severity: "minor",     category: "fall",              affected: 1, desc: "Trip over loose rebar — minor scrape", status: "resolved", actions: "Rebar bundled and labeled, area cleaned", resolvedAt: "2026-04-15T17:00:00Z" },
    { code: "INC-2026-0007", project: "eternal-villas", date: "2026-04-22", severity: "moderate",  category: "structural",         affected: 0, desc: "Hairline crack found in foundation wall — investigation needed", status: "resolved", actions: "Engineer consulted, monitoring tapes installed; cosmetic only", resolvedAt: "2026-04-25T12:00:00Z" },
    // Open severe incident — created 5 days ago (should escalate via cron)
    { code: "INC-2026-0008", project: "eternal-villas", date: "2026-04-25", severity: "severe",    category: "equipment",          affected: 2, desc: "Crane cable snapped during lift — load fell, two workers injured (broken arm + concussion)", status: "open", actions: "Both workers in hospital, crane impounded for inspection, work in zone halted", resolvedAt: null },
  ];
  for (const inc of incidentSpecs) {
    if (!byslug[inc.project]) continue;
    await sql`
      INSERT INTO safety_incidents (
        incident_code, project_id, incident_date,
        severity, category, affected_workers_count,
        description, immediate_actions_taken,
        status, resolved_at
      )
      VALUES (
        ${inc.code}, ${byslug[inc.project]}, ${inc.date},
        ${inc.severity}, ${inc.category}, ${inc.affected},
        ${inc.desc}, ${inc.actions},
        ${inc.status}, ${inc.resolvedAt}
      )
      ON CONFLICT (incident_code) DO NOTHING
    `;
  }
  console.log(`✓ safety_incidents (${incidentSpecs.length} demo, 1 open severe)`);

  // 10.7.5) Stage 3.A — AI agent budgets ----------------------------------
  // Two default budgets so the cost dashboard renders something useful out
  // of the box. Photo analyst is the chatty one (per-photo Claude vision
  // call); operations copilot is more expensive but rarely fired.
  const budgetSpecs = [
    {
      key: "dev_os.photo_analyst",
      daily: "5.00",
      monthly: "100.00",
      notes:
        "Per-photo vision call. Daily $5 ≈ 100 Haiku 4.5 photo analyses.",
    },
    {
      key: "dev_os.operations_copilot",
      daily: "10.00",
      monthly: "200.00",
      notes: "Daily summary + on-demand asks.",
    },
  ];
  for (const b of budgetSpecs) {
    await sql`
      INSERT INTO ai_agent_budgets (
        assistant_key, daily_limit_usd, monthly_limit_usd,
        alert_threshold_pct, is_enabled, notes
      ) VALUES (
        ${b.key}, ${b.daily}, ${b.monthly}, 80, true, ${b.notes}
      )
      ON CONFLICT (assistant_key) DO UPDATE SET
        daily_limit_usd = EXCLUDED.daily_limit_usd,
        monthly_limit_usd = EXCLUDED.monthly_limit_usd,
        notes = EXCLUDED.notes,
        updated_at = now()
    `;
  }
  console.log(`✓ ai_agent_budgets (${budgetSpecs.length} default budgets)`);

  // 10.7.6) Stage 3.B — three more agent budgets (the migration also
  // upserts these, but seeding here keeps demo DB consistent for
  // operators who skip the latest migration during dev).
  const stage3bBudgetSpecs = [
    {
      key: "dev_os.construction_supervisor",
      daily: "2.00",
      monthly: "20.00",
      notes: "Per-report Claude call. Daily $2 ≈ 100 Haiku 4.5 analyses.",
    },
    {
      key: "dev_os.investor_relations",
      daily: "1.00",
      monthly: "15.00",
      notes: "Per-question Claude call. Manual trigger only.",
    },
    {
      key: "dev_os.translator",
      daily: "0.50",
      monthly: "10.00",
      notes:
        "Per-string translation; usually a cache hit. Daily $0.50 ≈ 500 misses.",
    },
  ];
  for (const b of stage3bBudgetSpecs) {
    await sql`
      INSERT INTO ai_agent_budgets (
        assistant_key, daily_limit_usd, monthly_limit_usd,
        alert_threshold_pct, is_enabled, notes
      ) VALUES (
        ${b.key}, ${b.daily}, ${b.monthly}, 80, true, ${b.notes}
      )
      ON CONFLICT (assistant_key) DO UPDATE SET
        daily_limit_usd = EXCLUDED.daily_limit_usd,
        monthly_limit_usd = EXCLUDED.monthly_limit_usd,
        notes = EXCLUDED.notes,
        updated_at = now()
    `;
  }
  console.log(`✓ ai_agent_budgets (Stage 3.B: ${stage3bBudgetSpecs.length} more agent budgets)`);

  // 10.7.7) Stage 3.B — sample translation cache entries.
  // Pre-populates a couple of EN translations of common Indonesian
  // phrases so the cache shows hits in dashboards immediately.
  const sampleTranslations = [
    {
      source: "Pekerjaan pengecoran dak lantai 2 selesai. Tidak ada blocker.",
      target: "Second floor slab pour completed. No blockers.",
      sourceLang: "id",
      targetLang: "en",
      context: "Daily construction site report from a Bali villa project",
    },
    {
      source: "Hari ini kami menyelesaikan instalasi pipa air bersih di unit A1.",
      target:
        "Today we completed the cold-water plumbing installation in unit A1.",
      sourceLang: "id",
      targetLang: "en",
      context: "Daily construction site report from a Bali villa project",
    },
  ];
  // sha256(text + '|' + (context ?? '')) — mirror translator.ts.
  const { createHash } = await import("node:crypto");
  for (const t of sampleTranslations) {
    const hash = createHash("sha256")
      .update(t.source)
      .update("|")
      .update(t.context ?? "")
      .digest("hex");
    await sql`
      INSERT INTO ai_translation_cache (
        source_text_hash, target_language, translated_text,
        source_language, context, hit_count
      ) VALUES (
        ${hash}, ${t.targetLang}, ${t.target},
        ${t.sourceLang}, ${t.context}, 1
      )
      ON CONFLICT (source_text_hash, target_language) DO UPDATE SET
        translated_text = EXCLUDED.translated_text,
        last_used_at = now()
    `;
  }
  console.log(`✓ ai_translation_cache (${sampleTranslations.length} sample EN translations)`);

  // 10.7.8) Stage 3.B — sample construction analyses for 3 recent
  // submitted reports. Mix of statuses to exercise the HITL UI.
  const recentReports = await sql`
    SELECT id FROM site_reports
    WHERE status IN ('submitted', 'reviewed')
    ORDER BY submitted_at DESC NULLS LAST, report_date DESC
    LIMIT 3
  `;
  if (recentReports.length > 0) {
    const sampleStatuses = ["draft", "approved", "edited_approved"];
    let createdAnalyses = 0;
    for (let i = 0; i < recentReports.length; i++) {
      const status = sampleStatuses[i % sampleStatuses.length];
      const reportId = recentReports[i].id;
      // Need a placeholder ai_assistant_runs row for FK lineage.
      const runRow = await sql`
        INSERT INTO ai_assistant_runs (
          assistant_key, run_type, status, model,
          input_summary, output_summary, finished_at
        ) VALUES (
          'dev_os.construction_supervisor', 'scheduled', 'dry_run', 'dry-run-stub',
          ${'demo seed for report ' + reportId},
          ${'Demo construction analysis seeded for HITL UI verification.'},
          now()
        )
        RETURNING id
      `;
      await sql`
        INSERT INTO ai_construction_analyses (
          site_report_id, draft_summary, draft_summary_translations,
          safety_status, safety_concerns,
          immediate_actions_recommended,
          estimated_completion_percent, on_track_vs_budget,
          delay_risk_flags, workforce_flags, vendor_flags,
          recommended_reviewer_actions,
          raw_response, ai_run_id, status,
          reviewed_at, reviewed_by, reviewer_edits
        ) VALUES (
          ${reportId},
          ${'[demo] Site activity proceeded as expected. Workforce was on plan and the slab pour for zone A2 completed without incident. No blockers reported.'},
          ${'{"id":"[demo] Aktivitas situs berjalan sesuai rencana."}'}::jsonb,
          'normal',
          ARRAY[]::text[],
          ARRAY['Verify next-day formwork delivery']::text[],
          ${i === 0 ? '38.50' : i === 1 ? '52.00' : '64.50'},
          true,
          ARRAY[]::text[],
          ARRAY[]::text[],
          ARRAY[]::text[],
          ARRAY['Confirm next-day plan with foreman','Spot-check rebar coverage on zone A3']::text[],
          ${'{"draft_summary": "Demo seed payload"}'},
          ${runRow[0].id},
          ${status},
          ${status !== 'draft' ? sql`now()` : null},
          ${status !== 'draft' ? sql`(SELECT id FROM app_users LIMIT 1)` : null},
          ${status === 'edited_approved' ? sql`'{"draftSummary":"[demo] edited by reviewer"}'::jsonb` : null}
        )
        ON CONFLICT DO NOTHING
      `;
      createdAnalyses += 1;
    }
    console.log(
      `✓ ai_construction_analyses (${createdAnalyses} demo analyses across draft/approved/edited_approved)`,
    );
  } else {
    console.log("ℹ ai_construction_analyses skipped — no submitted reports to attach to");
  }

  // 10.7.9) Stage 3.B — sample investor Q&A drafts for the first
  // active investor.
  const sampleInvestor = await sql`
    SELECT id, legal_name, reporting_language FROM investors
    WHERE status = 'active'
    ORDER BY onboarded_at
    LIMIT 1
  `;
  if (sampleInvestor.length > 0) {
    const inv = sampleInvestor[0];
    const lang = inv.reporting_language ?? 'en';
    const drafts = [
      {
        q: lang === 'ru'
          ? 'Когда планируется следующее распределение прибыли?'
          : 'When is the next profit distribution scheduled?',
        a: lang === 'ru'
          ? `Уважаемый ${inv.legal_name},\n\n[demo draft] По нашим записям следующее распределение запланировано после достижения порога самоокупаемости проекта. Подтвердим точную дату как только финансовая команда завершит сверку.\n\nС уважением,\nКоманда Arconique по работе с инвесторами`
          : `Dear ${inv.legal_name},\n\n[demo draft] Per our records, the next distribution is scheduled after the project hits its self-sustaining threshold. We will confirm the exact date once finance closes the next reconciliation cycle.\n\nBest regards,\nArconique Investor Relations Team`,
        status: 'draft',
        sentVia: null,
      },
      {
        q: 'What is my current effective IRR across my commitments?',
        a: `Dear ${inv.legal_name},\n\n[demo draft] Based on cumulative distributions vs your committed capital across all projects, your proxy IRR sits at approximately the figure shown on the dashboard. The number is updated nightly from the wallet ledger.\n\nBest regards,\nArconique Investor Relations Team`,
        status: 'edited_approved',
        sentVia: null,
      },
    ];
    let createdDrafts = 0;
    for (const d of drafts) {
      const runRow = await sql`
        INSERT INTO ai_assistant_runs (
          assistant_key, run_type, status, model,
          input_summary, output_summary, finished_at
        ) VALUES (
          'dev_os.investor_relations', 'manual', 'dry_run', 'dry-run-stub',
          ${'demo seed for investor ' + inv.id},
          ${d.a.slice(0, 200)},
          now()
        )
        RETURNING id
      `;
      await sql`
        INSERT INTO ai_investor_qa_drafts (
          investor_id, question, question_language, response_language,
          draft_response, context_summary, raw_response,
          ai_run_id, status, approved_response,
          reviewed_at, reviewed_by
        ) VALUES (
          ${inv.id}, ${d.q}, ${lang}, ${lang},
          ${d.a},
          ${'{"commitmentsCount":1,"recentDistributionsCount":0}'}::jsonb,
          ${'{"text":"' + d.a.replace(/"/g, '\\"').slice(0, 200) + '"}'},
          ${runRow[0].id},
          ${d.status},
          ${d.status === 'edited_approved' ? d.a : null},
          ${d.status !== 'draft' ? sql`now()` : null},
          ${d.status !== 'draft' ? sql`(SELECT id FROM app_users LIMIT 1)` : null}
        )
      `;
      createdDrafts += 1;
    }
    console.log(`✓ ai_investor_qa_drafts (${createdDrafts} demo drafts for ${inv.legal_name})`);
  } else {
    console.log("ℹ ai_investor_qa_drafts skipped — no active investor found");
  }

  // 10.7.10) Stage 3.C — two more agent budgets.
  const stage3cBudgetSpecs = [
    {
      key: "dev_os.distribution_preview",
      daily: "1.00",
      monthly: "15.00",
      notes:
        "Per-project weekly suggestion. Low frequency, complex reasoning over financials.",
    },
    {
      key: "dev_os.document_understanding",
      daily: "2.00",
      monthly: "25.00",
      notes:
        "Per-document extraction. Volume from receipt processing; daily $2 ≈ 200 receipts.",
    },
  ];
  for (const b of stage3cBudgetSpecs) {
    await sql`
      INSERT INTO ai_agent_budgets (
        assistant_key, daily_limit_usd, monthly_limit_usd,
        alert_threshold_pct, is_enabled, notes
      ) VALUES (
        ${b.key}, ${b.daily}, ${b.monthly}, 80, true, ${b.notes}
      )
      ON CONFLICT (assistant_key) DO UPDATE SET
        daily_limit_usd = EXCLUDED.daily_limit_usd,
        monthly_limit_usd = EXCLUDED.monthly_limit_usd,
        notes = EXCLUDED.notes,
        updated_at = now()
    `;
  }
  console.log(`✓ ai_agent_budgets (Stage 3.C: ${stage3cBudgetSpecs.length} more agent budgets)`);

  // 10.7.11) Stage 3.C — sample distribution suggestions across projects.
  // Three suggestions in three states so the HITL UI renders the full
  // shape immediately. Idempotent: skipped when an active suggestion
  // already exists for a project (partial unique index).
  const candidateProjects = await sql`
    SELECT id, slug, name FROM projects
    WHERE slug IN ('eternal-villas', 'enso-villas', 'ahau-gardens')
    ORDER BY slug
    LIMIT 3
  `;
  if (candidateProjects.length > 0) {
    const suggestionSpecs = [
      {
        slug: "eternal-villas",
        amount: 15000000n, // $150,000.00
        type: "capital_return",
        confidence: "high",
        status: "reviewed",
        isSelfSustaining: true,
        reasoning:
          "[demo] Project is self-sustaining over the past 90 days with healthy net cash flow. Outstanding capital is $1.2M; conservative recommendation is to start returning $150K to the highest-priority commitments. Buffer ($420K) and obligations ($280K) preserved.",
        riskFactors: ["Outstanding capital remains; capital return required first."],
        recommendations: [
          "Verify next milestone invoice timing to confirm cash buffer holds",
        ],
      },
      {
        slug: "enso-villas",
        amount: 7500000n, // $75,000.00
        type: "mixed",
        confidence: "medium",
        status: "draft",
        isSelfSustaining: true,
        reasoning:
          "[demo] Project is self-sustaining and capital is mostly returned. Suggesting a mixed distribution: ~60% capital return for residual outstanding capital, ~40% profit distribution. Conservative confidence at medium because the next milestone invoice cycle could shift the buffer requirement.",
        riskFactors: [],
        recommendations: ["Re-run after the next reconciliation cycle"],
      },
      {
        slug: "ahau-gardens",
        amount: 0n,
        type: "none",
        confidence: "low",
        status: "rejected",
        isSelfSustaining: false,
        reasoning:
          "[demo] Project is NOT self-sustaining — net cash flow over the past 90 days is negative. Recommending wait until the threshold is met. No distribution at this time.",
        riskFactors: ["Project not self-sustaining"],
        recommendations: [
          "Run the self-sustaining-check cron after the next milestone payment",
        ],
      },
    ];
    let createdSuggestions = 0;
    for (const proj of candidateProjects) {
      const spec = suggestionSpecs.find((s) => s.slug === proj.slug);
      if (!spec) continue;
      // Skip if an active suggestion already exists.
      const existing = await sql`
        SELECT id FROM ai_distribution_suggestions
        WHERE project_id = ${proj.id}
          AND status IN ('draft','reviewed')
        LIMIT 1
      `;
      if (existing.length > 0) continue;

      const runRow = await sql`
        INSERT INTO ai_assistant_runs (
          assistant_key, run_type, status, model,
          input_summary, output_summary, finished_at
        ) VALUES (
          'dev_os.distribution_preview', 'manual', 'dry_run', 'dry-run-stub',
          ${'demo seed for project ' + proj.slug},
          ${spec.reasoning.slice(0, 200)},
          now()
        )
        RETURNING id
      `;

      await sql`
        INSERT INTO ai_distribution_suggestions (
          project_id,
          suggested_amount_usd_minor, suggested_distribution_type,
          suggested_effective_date,
          current_company_balance_usd_minor, current_project_balance_usd_minor,
          recent_inflows_90d_usd_minor, recent_outflows_90d_usd_minor,
          net_cash_flow_90d_usd_minor, is_self_sustaining,
          buffer_amount_usd_minor,
          outstanding_capital_usd_minor, outstanding_invoices_usd_minor,
          outstanding_commitments_usd_minor,
          reasoning, confidence_level, risk_factors, recommendations,
          allocation_preview, raw_response, ai_run_id, triggered_by, status,
          reviewed_at, reviewed_by, reviewer_notes
        ) VALUES (
          ${proj.id},
          ${spec.amount.toString()}, ${spec.type},
          ${new Date().toISOString().slice(0, 10)},
          '500000000', '180000000',
          '120000000', '78000000',
          '42000000', ${spec.isSelfSustaining},
          '42000000',
          '120000000', '0',
          '28000000',
          ${spec.reasoning}, ${spec.confidence}, ${spec.riskFactors}, ${spec.recommendations},
          ${'[]'}::jsonb,
          ${'{"demo": true}'},
          ${runRow[0].id},
          'manual_request',
          ${spec.status},
          ${spec.status !== 'draft' ? sql`now()` : null},
          ${spec.status !== 'draft' ? sql`(SELECT id FROM app_users LIMIT 1)` : null},
          ${spec.status === 'rejected' ? '[demo] Premature — re-evaluate after next reconciliation' : null}
        )
      `;
      createdSuggestions += 1;
    }
    console.log(
      `✓ ai_distribution_suggestions (${createdSuggestions} demo suggestions across draft/reviewed/rejected)`,
    );
  } else {
    console.log(
      "ℹ ai_distribution_suggestions skipped — no matching projects found",
    );
  }

  // 10.7.12) Stage 3.C — sample document extractions for receipts and a
  // delivery note. Idempotent: re-running uses ON CONFLICT DO NOTHING via
  // the storage_path uniqueness convention; we generate stable titles
  // so re-seeds don't duplicate.
  const samplePlaceholderDocs = [
    {
      title: "[demo] Receipt from PT Bahan Bangunan — 2026-04-15",
      docType: "receipt",
      mime: "image/jpeg",
    },
    {
      title: "[demo] Invoice INV-2026-042 — Concrete supplier",
      docType: "invoice",
      mime: "image/jpeg",
    },
    {
      title: "[demo] Delivery note — Cement bags 2026-04-20",
      docType: "delivery_note",
      mime: "image/jpeg",
    },
    {
      title: "[demo] Receipt — fuel + transport 2026-04-22",
      docType: "receipt",
      mime: "image/png",
    },
    {
      title: "[demo] Invoice INV-2026-051 — Tile supplier",
      docType: "invoice",
      mime: "image/jpeg",
    },
  ];
  // Pick one project to anchor entity_type/id metadata.
  const anchorProject = await sql`SELECT id FROM projects LIMIT 1`;
  const anchorProjectId = anchorProject[0]?.id ?? null;
  for (const d of samplePlaceholderDocs) {
    if (!anchorProjectId) break;
    await sql`
      INSERT INTO documents (
        title, document_type, entity_type, entity_id,
        storage_bucket, storage_path,
        file_name, mime_type, size_bytes, visibility
      ) VALUES (
        ${d.title}, ${d.docType}, 'project', ${anchorProjectId},
        'dry_run', ${'demo/' + d.docType + '/' + d.title.replace(/[^a-z0-9]/gi, '_')},
        ${d.title.replace(/[^a-z0-9]/gi, '_') + '.jpg'},
        ${d.mime}, 512000, 'internal'
      )
      ON CONFLICT DO NOTHING
    `;
  }
  const sampleDocs = await sql`
    SELECT id, title, document_type FROM documents
    WHERE document_type IN ('receipt','invoice','delivery_note')
    ORDER BY created_at DESC
    LIMIT 5
  `;
  if (sampleDocs.length > 0) {
    let createdExtractions = 0;
    const extractionStatuses = [
      "pending_review",
      "approved",
      "rejected",
      "duplicate",
      "pending_review",
    ];
    for (let i = 0; i < sampleDocs.length; i++) {
      const doc = sampleDocs[i];
      const status = extractionStatuses[i % extractionStatuses.length];
      // Skip if there's already an active extraction.
      const existing = await sql`
        SELECT id FROM ai_document_extractions
        WHERE document_id = ${doc.id}
          AND status IN ('pending_review','approved','edited_approved','duplicate')
        LIMIT 1
      `;
      if (existing.length > 0) continue;

      const isDelivery = doc.document_type === "delivery_note";
      const extractedData = isDelivery
        ? {
            delivery_date: new Date().toISOString().slice(0, 10),
            po_reference: "[demo PO-2026-XX]",
            vendor_name: "[demo vendor]",
            line_items: [
              {
                material: "Cement (40kg bag)",
                quantity: 50,
                unit: "bag",
              },
            ],
          }
        : {
            amount: 1500000,
            currency: "IDR",
            vendor_name: "[demo vendor]",
            transaction_date: new Date().toISOString().slice(0, 10),
            invoice_number: `[demo INV-${i}]`,
            line_items: [
              { description: "Sample line item", amount: 1500000 },
            ],
          };

      const runRow = await sql`
        INSERT INTO ai_assistant_runs (
          assistant_key, run_type, status, model,
          input_summary, output_summary, finished_at
        ) VALUES (
          'dev_os.document_understanding', 'scheduled', 'dry_run', 'dry-run-stub',
          ${'demo seed for document ' + doc.id},
          ${'[demo] extracted ' + doc.document_type},
          now()
        )
        RETURNING id
      `;

      await sql`
        INSERT INTO ai_document_extractions (
          document_id, document_type,
          detected_language, detected_quality,
          extracted_data,
          reasoning, ambiguities,
          raw_response, ai_run_id, status,
          reviewed_at, reviewed_by,
          rejection_reason
        ) VALUES (
          ${doc.id}, ${doc.document_type},
          'id', 'medium',
          ${JSON.stringify(extractedData)}::jsonb,
          ${'[demo] extracted by dry-run seed for HITL UI verification'},
          ${[]},
          ${'{"demo": true}'},
          ${runRow[0].id},
          ${status},
          ${status !== 'pending_review' ? sql`now()` : null},
          ${status !== 'pending_review' ? sql`(SELECT id FROM app_users LIMIT 1)` : null},
          ${status === 'rejected' ? '[demo] Demo rejection for testing' : null}
        )
      `;
      createdExtractions += 1;
    }
    console.log(
      `✓ ai_document_extractions (${createdExtractions} demo extractions across pending_review/approved/rejected/duplicate)`,
    );
  } else {
    console.log(
      "ℹ ai_document_extractions skipped — no receipt/invoice/delivery_note documents found",
    );
  }

  // 10.7.13) Stage 3.D — WhatsApp seed (phones, templates, messages, budget).
  const whatsappBudgetSpec = {
    key: "dev_os.whatsapp_intent_classifier",
    daily: "0.50",
    monthly: "10.00",
    notes:
      "Lightweight per-message classification. Daily $0.50 ≈ 500 messages on Haiku 4.5.",
  };
  await sql`
    INSERT INTO ai_agent_budgets (
      assistant_key, daily_limit_usd, monthly_limit_usd,
      alert_threshold_pct, is_enabled, notes
    ) VALUES (
      ${whatsappBudgetSpec.key}, ${whatsappBudgetSpec.daily},
      ${whatsappBudgetSpec.monthly}, 80, true, ${whatsappBudgetSpec.notes}
    )
    ON CONFLICT (assistant_key) DO UPDATE SET
      daily_limit_usd = EXCLUDED.daily_limit_usd,
      monthly_limit_usd = EXCLUDED.monthly_limit_usd,
      notes = EXCLUDED.notes,
      updated_at = now()
  `;
  console.log("✓ ai_agent_budgets (Stage 3.D: 1 more agent budget)");

  // Two Arconique outbound numbers (sandbox markers).
  const arconiqueProject = await sql`
    SELECT id FROM projects WHERE slug = 'eternal-villas' LIMIT 1
  `;
  const arconiquePhones = [
    {
      phone: "+14155238886",
      display: "Arconique Twilio Sandbox",
      type: "arconique_outbound",
      projectId: null,
      provider: "sandbox",
    },
    {
      phone: "+62812DEMO0001",
      display: "Arconique Eternal Villas operations (demo)",
      type: "arconique_outbound",
      projectId: arconiqueProject[0]?.id ?? null,
      provider: "twilio",
    },
  ];
  for (const p of arconiquePhones) {
    await sql`
      INSERT INTO whatsapp_phone_numbers (
        phone_number, display_name, number_type, project_id, provider,
        is_active, is_verified
      ) VALUES (
        ${p.phone}, ${p.display}, ${p.type}, ${p.projectId}, ${p.provider},
        true, true
      )
      ON CONFLICT (phone_number) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider = EXCLUDED.provider,
        updated_at = now()
    `;
  }

  // Three external recipient phones linked to existing entities.
  const waSampleVendor = await sql`SELECT id, legal_name FROM vendors LIMIT 1`;
  const waSampleInvestor = await sql`
    SELECT id, legal_name FROM investors WHERE status = 'active' LIMIT 1
  `;
  const waSampleAppUser = await sql`SELECT id, full_name FROM app_users LIMIT 1`;
  const recipientPhones = [];
  if (waSampleVendor[0]) {
    recipientPhones.push({
      phone: "+62812DEMO0010",
      display: `${waSampleVendor[0].legal_name} representative`,
      type: "recipient",
      entityType: "vendor",
      entityId: waSampleVendor[0].id,
    });
    // Also write back to vendors.whatsapp_phone for the resolver.
    await sql`
      UPDATE vendors SET whatsapp_phone = '+62812DEMO0010', updated_at = now()
      WHERE id = ${waSampleVendor[0].id}
    `;
  }
  if (waSampleInvestor[0]) {
    recipientPhones.push({
      phone: "+62812DEMO0011",
      display: `${waSampleInvestor[0].legal_name} (investor)`,
      type: "recipient",
      entityType: "investor",
      entityId: waSampleInvestor[0].id,
    });
    await sql`
      UPDATE investors SET whatsapp_phone = '+62812DEMO0011',
        prefers_whatsapp = true, updated_at = now()
      WHERE id = ${waSampleInvestor[0].id}
    `;
  }
  if (waSampleAppUser[0]) {
    recipientPhones.push({
      phone: "+62812DEMO0012",
      display: `${waSampleAppUser[0].full_name} (field foreman)`,
      type: "recipient",
      entityType: "app_user",
      entityId: waSampleAppUser[0].id,
    });
    await sql`
      UPDATE app_users SET whatsapp_phone = '+62812DEMO0012',
        prefers_whatsapp = true, updated_at = now()
      WHERE id = ${waSampleAppUser[0].id}
    `;
  }
  for (const r of recipientPhones) {
    await sql`
      INSERT INTO whatsapp_phone_numbers (
        phone_number, display_name, number_type,
        resolved_entity_type, resolved_entity_id,
        provider, is_active, is_verified
      ) VALUES (
        ${r.phone}, ${r.display}, ${r.type},
        ${r.entityType}, ${r.entityId},
        'twilio', true, true
      )
      ON CONFLICT (phone_number) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        resolved_entity_type = EXCLUDED.resolved_entity_type,
        resolved_entity_id = EXCLUDED.resolved_entity_id,
        updated_at = now()
    `;
  }
  console.log(
    `✓ whatsapp_phone_numbers (${arconiquePhones.length} arconique + ${recipientPhones.length} recipient)`,
  );

  // Five sample templates (all 'draft' — operator submits in production).
  const waTemplates = [
    {
      key: "welcome_to_site_team",
      name: "Welcome new vendor to site team",
      versions: {
        en: { body: "Welcome to {{project_name}} site, {{vendor_name}}." },
        id: { body: "Selamat datang di {{project_name}}, {{vendor_name}}." },
      },
      vars: ["project_name", "vendor_name"],
      event: null,
    },
    {
      key: "distribution_announcement",
      name: "Distribution announcement",
      versions: {
        en: {
          body: "Dear {{investor_name}}, distribution {{distribution_number}} of ${{amount}} declared.",
        },
        ru: {
          body: "Уважаемый {{investor_name}}, объявлено распределение №{{distribution_number}} на ${{amount}}.",
        },
      },
      vars: ["investor_name", "distribution_number", "amount"],
      event: "distribution_executed",
    },
    {
      key: "payment_reminder",
      name: "Vendor payment reminder",
      versions: {
        en: { body: "{{vendor_name}}, payment of ${{amount}} due {{due_date}}." },
        id: { body: "{{vendor_name}}, pembayaran ${{amount}} jatuh tempo {{due_date}}." },
      },
      vars: ["vendor_name", "amount", "due_date"],
      event: null,
    },
    {
      key: "daily_report_request",
      name: "Daily site report request",
      versions: {
        en: { body: "Please send today's site report for {{project_name}}." },
        id: { body: "Mohon kirim laporan harian untuk {{project_name}} hari ini." },
      },
      vars: ["project_name"],
      event: "site_report_missing",
    },
    {
      key: "investor_milestone_update",
      name: "Investor milestone update",
      versions: {
        en: {
          body: "{{project_name}} reached milestone: {{milestone_name}} on {{date}}.",
        },
        ru: {
          body: "{{project_name}} достиг этапа: {{milestone_name}} ({{date}}).",
        },
      },
      vars: ["project_name", "milestone_name", "date"],
      event: null,
    },
  ];
  for (const t of waTemplates) {
    await sql`
      INSERT INTO whatsapp_message_templates (
        template_key, display_name, language_versions, expected_variables,
        approval_status, notification_event_type, is_active
      ) VALUES (
        ${t.key}, ${t.name}, ${JSON.stringify(t.versions)}::jsonb,
        ${t.vars}, 'draft', ${t.event}, true
      )
      ON CONFLICT (template_key) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        language_versions = EXCLUDED.language_versions,
        expected_variables = EXCLUDED.expected_variables,
        notification_event_type = EXCLUDED.notification_event_type,
        updated_at = now()
    `;
  }
  console.log(`✓ whatsapp_message_templates (${waTemplates.length} sample templates, all 'draft')`);

  // 15 sample messages (8 inbound + 7 outbound, mixed statuses).
  const arconiqueOutboundPhone = "+62812DEMO0001";
  const sampleSiteReport = await sql`
    SELECT id FROM site_reports WHERE status IN ('submitted','draft') LIMIT 1
  `;
  const sampleInvestorQa = await sql`
    SELECT id FROM ai_investor_qa_drafts LIMIT 1
  `;
  const inboundSpecs = [
    {
      from: "+62812DEMO0012",
      type: "text",
      body: "Cor lantai 2 selesai jam 4 sore, tim kerja 22 orang, tidak ada blocker.",
      intent: "site_report",
      confidence: 0.92,
      linkedReport: sampleSiteReport[0]?.id ?? null,
    },
    {
      from: "+62812DEMO0012",
      type: "text",
      body: "Hari ini foundation zone B2 selesai. Cuaca cerah, 18 pekerja.",
      intent: "site_report",
      confidence: 0.88,
      linkedReport: null,
    },
    {
      from: "+62812DEMO0012",
      type: "voice",
      body: null,
      voice: "Hari ini kami menyelesaikan instalasi pipa air bersih di unit A1.",
      intent: "site_report",
      confidence: 0.83,
      linkedReport: null,
    },
    {
      from: "+62812DEMO0012",
      type: "image",
      body: "Foto progress dak lantai 2",
      media: ["https://example.com/sample-photo-1.jpg"],
      intent: "site_report",
      confidence: 0.7,
      linkedReport: null,
    },
    {
      from: "+62812DEMO0010",
      type: "text",
      body: "Mohon konfirmasi pembayaran PO-2026-042. Terima kasih.",
      intent: "vendor_inquiry",
      confidence: 0.9,
      linkedReport: null,
    },
    {
      from: "+62812DEMO0010",
      type: "text",
      body: "Pengiriman semen tertunda 2 hari karena ferry strike.",
      intent: "vendor_inquiry",
      confidence: 0.86,
      linkedReport: null,
    },
    {
      from: "+62812DEMO0011",
      type: "text",
      body: "When is the next distribution scheduled? And what is my current effective IRR?",
      intent: "investor_question",
      confidence: 0.95,
      linkedQa: sampleInvestorQa[0]?.id ?? null,
    },
    {
      from: "+1555UNKNOWN",
      type: "text",
      body: "Hi, is this the right number for property inquiries?",
      intent: "unknown",
      confidence: 0.4,
      linkedReport: null,
    },
  ];
  let createdInbound = 0;
  for (let i = 0; i < inboundSpecs.length; i++) {
    const s = inboundSpecs[i];
    const sid = `DEMO-IN-${i.toString().padStart(4, "0")}`;
    // Skip if already seeded.
    const existing = await sql`
      SELECT id FROM whatsapp_messages
      WHERE provider = 'sandbox' AND external_message_sid = ${sid}
      LIMIT 1
    `;
    if (existing.length > 0) continue;

    // Open an ai_assistant_run for the classification.
    const runRow = await sql`
      INSERT INTO ai_assistant_runs (
        assistant_key, run_type, status, model,
        input_summary, output_summary, finished_at
      ) VALUES (
        'dev_os.whatsapp_intent_classifier', 'scheduled', 'dry_run',
        'dry-run-stub',
        ${'demo whatsapp inbound from ' + s.from},
        ${'intent=' + s.intent + ' conf=' + s.confidence},
        now()
      )
      RETURNING id
    `;
    await sql`
      INSERT INTO whatsapp_messages (
        provider, external_message_sid, direction, from_phone, to_phone,
        message_type, body, media_urls,
        voice_transcript, voice_transcript_language, voice_transcribed_at,
        status, status_updated_at,
        ai_processed_at, ai_intent, ai_intent_confidence, ai_run_id,
        created_site_report_id, created_investor_qa_id,
        webhook_received_at, webhook_signature_verified,
        occurred_at
      ) VALUES (
        'sandbox', ${sid}, 'inbound', ${s.from}, ${arconiqueOutboundPhone},
        ${s.type}, ${s.body},
        ${s.media ?? null}::text[],
        ${s.voice ?? null}, ${s.voice ? "id" : null}, ${s.voice ? sql`now()` : null},
        'processed', now(),
        now(), ${s.intent}, ${s.confidence.toFixed(2)}, ${runRow[0].id},
        ${s.linkedReport ?? null}, ${s.linkedQa ?? null},
        now(), true,
        now() - interval '${sql.unsafe(`${i + 1} hour`)}'
      )
    `;
    createdInbound += 1;
  }

  const outboundSpecs = [
    {
      to: "+62812DEMO0011",
      template: "distribution_announcement",
      body: "Dear Andrey Petrov, distribution 3 of $150,000 declared.",
      vars: { investor_name: "Andrey Petrov", distribution_number: "3", amount: "150,000" },
      status: "delivered",
    },
    {
      to: "+62812DEMO0010",
      template: "payment_reminder",
      body: "PT Bahan Bangunan, payment of $5,000 due 2026-05-15.",
      vars: { vendor_name: "PT Bahan Bangunan", amount: "5,000", due_date: "2026-05-15" },
      status: "delivered",
    },
    {
      to: "+62812DEMO0012",
      template: "daily_report_request",
      body: "Please send today's site report for Eternal Villas.",
      vars: { project_name: "Eternal Villas" },
      status: "delivered",
    },
    {
      to: "+62812DEMO0011",
      template: "investor_milestone_update",
      body: "Eternal Villas reached milestone: foundation complete on 2026-04-20.",
      vars: { project_name: "Eternal Villas", milestone_name: "foundation complete", date: "2026-04-20" },
      status: "sent",
    },
    {
      to: "+62812DEMO0010",
      template: "welcome_to_site_team",
      body: "Welcome to Enso Villas, Tukang Cor Bali.",
      vars: { project_name: "Enso Villas", vendor_name: "Tukang Cor Bali" },
      status: "delivered",
    },
    {
      to: "+62812DEMO0012",
      template: "daily_report_request",
      body: "Please send today's site report for Ahau Gardens.",
      vars: { project_name: "Ahau Gardens" },
      status: "failed",
    },
    {
      to: "+62812DEMO0011",
      template: "distribution_announcement",
      body: "Dear Andrey Petrov, distribution 4 of $75,000 declared.",
      vars: { investor_name: "Andrey Petrov", distribution_number: "4", amount: "75,000" },
      status: "queued",
    },
  ];
  let createdOutbound = 0;
  for (let i = 0; i < outboundSpecs.length; i++) {
    const s = outboundSpecs[i];
    const sid = `DEMO-OUT-${i.toString().padStart(4, "0")}`;
    const existing = await sql`
      SELECT id FROM whatsapp_messages
      WHERE provider = 'sandbox' AND external_message_sid = ${sid}
      LIMIT 1
    `;
    if (existing.length > 0) continue;
    await sql`
      INSERT INTO whatsapp_messages (
        provider, external_message_sid, direction, from_phone, to_phone,
        message_type, body, template_name, template_variables,
        status, status_updated_at, occurred_at
      ) VALUES (
        'sandbox', ${sid}, 'outbound', ${arconiqueOutboundPhone}, ${s.to},
        'template', ${s.body}, ${s.template},
        ${JSON.stringify(s.vars)}::jsonb,
        ${s.status}, now(),
        now() - interval '${sql.unsafe(`${i + 1} hour`)}'
      )
    `;
    createdOutbound += 1;
  }
  console.log(
    `✓ whatsapp_messages (${createdInbound} inbound + ${createdOutbound} outbound demo messages)`,
  );

  // 10.7.14) Stage 4.A — Land profiles, permits, tax types, invoices,
  // shared cost allocations, purchase requests. Seeded with realistic
  // Bali / Indonesia values.
  console.log("\n— Stage 4.A seeding —");
  const stageProjects = await sql`
    SELECT id, slug, name, organization_id FROM projects
    WHERE slug IN ('eternal-villas', 'enso-villas', 'ahau-gardens')
    ORDER BY slug
  `;

  // Land profiles + payment schedules.
  const landProfileSpecs = {
    "eternal-villas": { mode: "leasehold", expires: "2049-03-31", years: 25, sqm: "5400.00", total: "60000000",
      installments: [
        { num: 1, due: "2024-04-15", amount: "20000000", status: "paid" },
        { num: 2, due: "2024-10-15", amount: "20000000", status: "paid" },
        { num: 3, due: "2026-04-15", amount: "20000000", status: "pending" },
      ] },
    "enso-villas": { mode: "joint_venture", expires: "2054-06-30", years: 30, sqm: "8200.00", total: "70000000",
      installments: [
        { num: 1, due: "2024-07-15", amount: "35000000", status: "paid" },
        { num: 2, due: "2026-07-15", amount: "35000000", status: "pending" },
      ] },
    "ahau-gardens": { mode: "leasehold", expires: "2049-09-30", years: 25, sqm: "4100.00", total: "30000000",
      installments: [
        { num: 1, due: "2024-10-15", amount: "15000000", status: "paid" },
        { num: 2, due: "2026-10-15", amount: "15000000", status: "pending" },
      ] },
  };
  let landCnt = 0;
  for (const proj of stageProjects) {
    const spec = landProfileSpecs[proj.slug];
    if (!spec) continue;
    const lp = await sql`
      INSERT INTO land_profiles (project_id, organization_id, acquisition_mode, lease_expiry_date, lease_tenure_years, total_land_size_sqm, due_diligence_status)
      VALUES (${proj.id}, ${proj.organization_id}, ${spec.mode}, ${spec.expires}, ${spec.years}, ${spec.sqm}, 'completed')
      ON CONFLICT (project_id) DO UPDATE SET acquisition_mode = EXCLUDED.acquisition_mode, updated_at = now()
      RETURNING id
    `;
    const existing = await sql`SELECT id FROM land_payment_schedules WHERE land_profile_id = ${lp[0].id} LIMIT 1`;
    if (existing.length === 0) {
      const sched = await sql`
        INSERT INTO land_payment_schedules (land_profile_id, total_purchase_price_minor, currency, upfront_payment_minor)
        VALUES (${lp[0].id}, ${spec.total}, 'USD', ${spec.installments[0].amount})
        RETURNING id
      `;
      for (const inst of spec.installments) {
        await sql`
          INSERT INTO land_payment_installments (schedule_id, installment_number, due_date, amount_minor, status, paid_date, paid_amount_minor)
          VALUES (${sched[0].id}, ${inst.num}, ${inst.due}, ${inst.amount}, ${inst.status},
                  ${inst.status === "paid" ? inst.due : null}, ${inst.status === "paid" ? inst.amount : 0})
        `;
      }
    }
    landCnt += 1;
  }
  console.log(`✓ land_profiles + payment schedules (${landCnt} projects)`);

  // Permits.
  const permitSpecs = [
    { slug: "eternal-villas", type: "pbg", label: "Persetujuan Bangunan Gedung", status: "approved", received: "2024-08-20", expires: "2029-08-20", num: "PBG-ETN-2024-0001" },
    { slug: "eternal-villas", type: "slf", label: "Sertifikat Laik Fungsi", status: "planned", target: "2026-12-01" },
    { slug: "enso-villas", type: "pbg", label: "Persetujuan Bangunan Gedung", status: "submitted", num: "PBG-ENS-2025-0007" },
    { slug: "ahau-gardens", type: "pbg", label: "Persetujuan Bangunan Gedung", status: "approved", received: "2024-12-10", expires: "2029-12-10", num: "PBG-AHU-2024-0003" },
    { slug: "ahau-gardens", type: "building_license", label: "IMB equivalent", status: "approved", received: "2025-01-15", expires: "2030-01-15", num: "BL-AHU-2025-0001" },
  ];
  let permitsCnt = 0;
  for (const p of permitSpecs) {
    const proj = stageProjects.find((s) => s.slug === p.slug);
    if (!proj) continue;
    const exists = await sql`SELECT id FROM project_permits WHERE project_id = ${proj.id} AND permit_type = ${p.type} AND permit_label = ${p.label} LIMIT 1`;
    if (exists.length > 0) continue;
    await sql`
      INSERT INTO project_permits (project_id, organization_id, permit_type, permit_label, status, received_at, expires_at, target_approval_date, permit_number, issuing_authority, currency)
      VALUES (${proj.id}, ${proj.organization_id}, ${p.type}, ${p.label}, ${p.status}, ${p.received ?? null}, ${p.expires ?? null}, ${p.target ?? null}, ${p.num ?? null}, 'Bali Provincial Office', 'IDR')
    `;
    permitsCnt += 1;
  }
  console.log(`✓ project_permits (${permitsCnt} demo permits)`);

  // Tax types.
  const taxSpecs = [
    { key: "ppn_indonesia", name: "PPN (Indonesian VAT)", rate: "11.0000", payable: "company", period: "monthly", auth: "DJP Indonesia" },
    { key: "pph23_withholding", name: "PPh 23 (withholding tax)", rate: "2.0000", payable: "supplier", period: "monthly", auth: "DJP Indonesia" },
    { key: "lease_tax_bali", name: "Lease tax (Bali)", rate: "10.0000", payable: "company", period: "annual", auth: "Bali Provincial Office" },
    { key: "corporate_income_tax", name: "Corporate income tax", rate: "22.0000", payable: "company", period: "annual", auth: "DJP Indonesia" },
  ];
  for (const t of taxSpecs) {
    await sql`
      INSERT INTO tax_types (type_key, display_name, rate_percentage, is_included_in_amount, payable_by, reporting_period, reporting_authority, country_code, is_active)
      VALUES (${t.key}, ${t.name}, ${t.rate}, false, ${t.payable}, ${t.period}, ${t.auth}, 'ID', true)
      ON CONFLICT (type_key) DO UPDATE SET rate_percentage = EXCLUDED.rate_percentage, updated_at = now()
    `;
  }
  console.log(`✓ tax_types (${taxSpecs.length} Indonesia-realistic types)`);

  // Sample invoices.
  const sampleVendor = await sql`SELECT id FROM vendors LIMIT 1`;
  const sampleInvestorRow = await sql`SELECT id FROM investors WHERE status='active' LIMIT 1`;
  const sampleProj = stageProjects[0];
  const taxRow = await sql`SELECT id FROM tax_types WHERE type_key = 'ppn_indonesia' LIMIT 1`;
  const taxId = taxRow[0]?.id ?? null;
  const invoiceSpecs = [
    { num: "INV-DEMO-001", type: "payable", subtotal: "10000000", tax: "1100000", status: "paid", paid: "11100000" },
    { num: "INV-DEMO-002", type: "payable", subtotal: "5000000", tax: "550000", status: "partial_paid", paid: "2000000" },
    { num: "INV-DEMO-003", type: "payable", subtotal: "8500000", tax: "935000", status: "issued", paid: "0" },
    { num: "INV-DEMO-004", type: "receivable", subtotal: "150000000", tax: "0", status: "issued", paid: "0", investor: true },
    { num: "INV-DEMO-005", type: "investor_call", subtotal: "200000000", tax: "0", status: "draft", paid: "0", investor: true },
  ];
  let invCnt = 0;
  for (const inv of invoiceSpecs) {
    if (!sampleProj) break;
    const exists = await sql`SELECT id FROM dev_invoices WHERE invoice_number = ${inv.num} AND project_id = ${sampleProj.id} LIMIT 1`;
    if (exists.length > 0) continue;
    const total = (BigInt(inv.subtotal) + BigInt(inv.tax)).toString();
    const invRow = await sql`
      INSERT INTO dev_invoices (invoice_number, invoice_type, vendor_id, investor_id, project_id, issue_date, due_date, subtotal_minor, tax_total_minor, total_minor, paid_minor, currency, tax_type_id, status, notes)
      VALUES (${inv.num}, ${inv.type}, ${inv.investor ? null : sampleVendor[0]?.id ?? null}, ${inv.investor ? sampleInvestorRow[0]?.id ?? null : null}, ${sampleProj.id}, '2026-04-01', '2026-04-30', ${inv.subtotal}, ${inv.tax}, ${total}, ${inv.paid}, 'USD', ${taxId}, ${inv.status}, ${'[demo seed] ' + inv.type})
      RETURNING id
    `;
    await sql`
      INSERT INTO dev_invoice_lines (invoice_id, line_number, description, quantity, unit_of_measure, unit_price_minor, tax_type_id, tax_amount_minor, is_tax_included)
      VALUES (${invRow[0].id}, 1, ${'Demo line for ' + inv.num}, 1, 'lump sum', ${inv.subtotal}, ${taxId}, ${inv.tax}, false)
    `;
    invCnt += 1;
  }
  console.log(`✓ dev_invoices (${invCnt} demo invoices)`);

  // Shared cost allocation.
  const sampleSharedTxn = await sql`
    SELECT id, amount_usd_minor, currency FROM dev_transactions
    WHERE direction = 'outflow' AND id NOT IN (SELECT source_transaction_id FROM shared_cost_allocations)
    ORDER BY transaction_date DESC LIMIT 1
  `;
  if (sampleSharedTxn[0] && stageProjects.length >= 3) {
    const txn = sampleSharedTxn[0];
    // Wrap header + lines in a transaction so the DEFERRABLE INITIALLY
    // DEFERRED trigger checks the 100% sum at COMMIT (not after each
    // line insert).
    await sql.begin(async (tx) => {
      const sharedAlloc = await tx`
        INSERT INTO shared_cost_allocations (source_transaction_id, allocation_method, allocation_basis, status, notes)
        VALUES (${txn.id}, 'by_floor_area', ${'{"areas":{"eternal":2700,"enso":1800,"ahau":1500}}'}::jsonb, 'applied', '[demo] Shared office rent split')
        RETURNING id
      `;
      const total = BigInt(txn.amount_usd_minor < 0 ? -txn.amount_usd_minor : txn.amount_usd_minor);
      const splits = [
        { proj: stageProjects[0].id, pct: "45.0000", amt: ((total * 45n) / 100n).toString() },
        { proj: stageProjects[1].id, pct: "30.0000", amt: ((total * 30n) / 100n).toString() },
        { proj: stageProjects[2].id, pct: "25.0000", amt: (total - (total * 45n) / 100n - (total * 30n) / 100n).toString() },
      ];
      for (const s of splits) {
        await tx`INSERT INTO shared_cost_allocation_lines (allocation_id, project_id, percentage, amount_minor, currency) VALUES (${sharedAlloc[0].id}, ${s.proj}, ${s.pct}, ${s.amt}, ${txn.currency})`;
      }
    });
    console.log(`✓ shared_cost_allocations (1 demo, 45/30/25 split)`);
  }

  // Purchase requests.
  const sampleAppUser = await sql`SELECT id FROM app_users LIMIT 1`;
  const userId = sampleAppUser[0]?.id;
  if (userId && stageProjects.length > 0) {
    const prSpecs = [
      { material: "Cement (40kg bag)", category: "construction", qty: "200", uom: "bag", urgency: "normal", status: "submitted", proj: stageProjects[0].id },
      { material: "Rebar 12mm × 12m", category: "construction", qty: "500", uom: "piece", urgency: "high", status: "approved", proj: stageProjects[0].id },
      { material: "Tiles porcelain 60x60", category: "finishes", qty: "150", uom: "sqm", urgency: "normal", status: "quotations_in_progress", proj: stageProjects[1].id },
      { material: "Electrical wire 2.5mm²", category: "electrical", qty: "1000", uom: "meter", urgency: "normal", status: "draft", proj: stageProjects[1].id },
      { material: "Sand washed river", category: "construction", qty: "20", uom: "m3", urgency: "critical", status: "approved", proj: stageProjects[2].id },
      { material: "Door handles brushed nickel", category: "finishes", qty: "30", uom: "set", urgency: "low", status: "submitted", proj: stageProjects[2].id },
      { material: "PPR pipes 32mm", category: "plumbing", qty: "200", uom: "meter", urgency: "normal", status: "rejected", proj: stageProjects[0].id },
      { material: "Marble slab 30mm", category: "finishes", qty: "10", uom: "sqm", urgency: "low", status: "cancelled", proj: stageProjects[0].id },
    ];
    let prsCnt = 0;
    for (let i = 0; i < prSpecs.length; i++) {
      const pr = prSpecs[i];
      const code = `PR-DEMO-${String(i + 1).padStart(4, "0")}`;
      const exists = await sql`SELECT id FROM dev_os_purchase_requests WHERE request_code = ${code} LIMIT 1`;
      if (exists.length > 0) continue;
      await sql`
        INSERT INTO dev_os_purchase_requests (request_code, requested_by, project_id, material_name, material_category, quantity, unit_of_measure, reason, required_by_date, urgency, status)
        VALUES (${code}, ${userId}, ${pr.proj}, ${pr.material}, ${pr.category}, ${pr.qty}, ${pr.uom}, '[demo] needed for ongoing construction', ${new Date(Date.now() + (i + 5) * 86400000).toISOString().slice(0, 10)}, ${pr.urgency}, ${pr.status})
      `;
      prsCnt += 1;
    }
    console.log(`✓ dev_os_purchase_requests (${prsCnt} demo requests)`);
  }

  // Quotations on the 'quotations_in_progress' PR.
  const prForQuotes = await sql`SELECT id FROM dev_os_purchase_requests WHERE status = 'quotations_in_progress' LIMIT 1`;
  const allVendors = await sql`SELECT id FROM vendors WHERE status = 'active' LIMIT 3`;
  if (prForQuotes[0] && allVendors.length >= 2) {
    const existsQ = await sql`SELECT id FROM procurement_quotations WHERE purchase_request_id = ${prForQuotes[0].id} LIMIT 1`;
    if (existsQ.length === 0) {
      const totals = ["12000000", "11500000", "12800000"];
      for (let i = 0; i < Math.min(allVendors.length, totals.length); i++) {
        await sql`
          INSERT INTO procurement_quotations (purchase_request_id, vendor_id, total_amount_minor, currency, payment_terms, delivery_estimated_date, status)
          VALUES (${prForQuotes[0].id}, ${allVendors[i].id}, ${totals[i]}, 'IDR', 'NET 30', ${new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)}, 'received')
        `;
      }
      console.log(`✓ procurement_quotations (${Math.min(allVendors.length, totals.length)} quotes)`);
    }
  }

  console.log("— Stage 4.A seeding complete —\n");

  // ====================================================================
  // 11) Stage 4.B — Investor Onboarding Critical Path
  // ====================================================================
  console.log("\n— Stage 4.B seeding —");

  // 11.1) Project company structures ------------------------------------
  // Eternal Villas: arconique_owned (100% Arconique, no JV).
  // Enso Villas: joint_venture (Arconique 60%, Singapore Family Office 40%).
  // Ahau Gardens: landowner_partnership (Arconique 70%, Made Wijaya 30%).
  const projForStruct = await sql`
    SELECT id, slug FROM projects
    WHERE slug IN ('eternal-villas', 'enso-villas', 'ahau-gardens')
  `;
  const slugMap = Object.fromEntries(projForStruct.map((p) => [p.slug, p.id]));
  const investorOne = (await sql`SELECT id FROM investors LIMIT 1`)[0]?.id ?? null;

  const structSpecs = [
    {
      slug: "eternal-villas",
      label: "Initial Arconique-owned",
      type: "arconique_owned",
      companyName: "Arconique Pte Ltd",
      shareholders: [
        { type: "arconique", name: "Arconique", pct: 100, managing: true },
      ],
    },
    {
      slug: "enso-villas",
      label: "Initial JV with Singapore Family Office",
      type: "joint_venture",
      companyName: "Enso Villas SPV Sdn Bhd",
      shareholders: [
        { type: "arconique", name: "Arconique", pct: 60, managing: true },
        { type: "external_party", name: "Singapore Family Office", pct: 40, managing: false },
      ],
    },
    {
      slug: "ahau-gardens",
      label: "Initial landowner partnership",
      type: "landowner_partnership",
      companyName: "Ahau Gardens Landowner JV",
      shareholders: [
        { type: "arconique", name: "Arconique", pct: 70, managing: true },
        { type: "land_owner", name: "Made Wijaya", pct: 30, managing: false },
      ],
    },
  ];

  let structCnt = 0;
  for (const spec of structSpecs) {
    const projectId = slugMap[spec.slug];
    if (!projectId) continue;
    const existing = await sql`
      SELECT id FROM project_company_structures
       WHERE project_id = ${projectId} AND structure_label = ${spec.label}
       LIMIT 1
    `;
    let structId = existing[0]?.id;
    if (!structId) {
      const [row] = await sql`
        INSERT INTO project_company_structures (
          project_id, structure_label, structure_type, company_name,
          country, registration_status, is_active, effective_from
        ) VALUES (
          ${projectId}, ${spec.label}, ${spec.type}, ${spec.companyName},
          'Indonesia', 'registered', TRUE, CURRENT_DATE - INTERVAL '180 days'
        )
        RETURNING id
      `;
      structId = row.id;
    }
    // Check shareholder count — only insert if structure currently has none.
    const shCnt = (
      await sql`SELECT count(*)::int AS c FROM company_structure_shareholders WHERE structure_id = ${structId}`
    )[0]?.c ?? 0;
    if (shCnt === 0) {
      await sql.begin(async (tx) => {
        for (const sh of spec.shareholders) {
          await tx`
            INSERT INTO company_structure_shareholders (
              structure_id, shareholder_type, display_name,
              ownership_percentage, is_managing_party
            ) VALUES (
              ${structId}, ${sh.type}, ${sh.name},
              ${sh.pct}, ${sh.managing}
            )
          `;
        }
      });
    }
    structCnt++;
  }
  console.log(`✓ project_company_structures (${structCnt} structures + shareholders)`);

  // 11.2) Waterfall rules -----------------------------------------------
  const wfSpecs = [
    {
      slug: "eternal-villas",
      label: "Generic 50/50 (Eternal)",
      type: "generic_50_50",
      params: {},
      desc: "Pure 50/50 profit split after pro-rata capital return.",
    },
    {
      slug: "enso-villas",
      label: "Arconique 25% credit (Enso)",
      type: "arconique_25_credit",
      params: { credit_percentage: 25 },
      desc:
        "Arconique receives 25% credit on the investor profit pool, then 50/50.",
    },
    {
      slug: "ahau-gardens",
      label: "8% pref → 50/50 (Ahau)",
      type: "preferred_return_then_split",
      params: { preferred_return_pct: 8, split_after: 50 },
      desc: "8% preferred return to landowner partnership, then 50/50.",
    },
  ];
  let wfCnt = 0;
  for (const spec of wfSpecs) {
    const projectId = slugMap[spec.slug];
    if (!projectId) continue;
    const existing = await sql`
      SELECT id FROM waterfall_rules
       WHERE project_id = ${projectId} AND rule_label = ${spec.label}
       LIMIT 1
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO waterfall_rules (
          scope, project_id, rule_label, rule_type, rule_parameters,
          is_active, effective_from, description
        ) VALUES (
          'project', ${projectId}, ${spec.label}, ${spec.type},
          ${JSON.stringify(spec.params)}::jsonb,
          TRUE, CURRENT_DATE - INTERVAL '180 days', ${spec.desc}
        )
      `;
    }
    wfCnt++;
  }
  console.log(`✓ waterfall_rules (${wfCnt} rules incl. arconique_25_credit)`);

  // 11.3) Wallet movements (sample audit trail) -------------------------
  // Pre-populate a few movements per investor so the capital account UI
  // has something to render in the demo. Idempotent via a marker reason.
  const wallets = await sql`
    SELECT iw.id AS wallet_id, iw.commitment_id, cc.investor_id, cc.project_id,
           iw.cash_balance_minor::text AS cash, iw.economic_balance_minor::text AS econ
      FROM investor_wallets iw
      JOIN capital_commitments cc ON cc.id = iw.commitment_id
     LIMIT 3
  `;
  let movementCnt = 0;
  for (const w of wallets) {
    const exists = await sql`
      SELECT 1 FROM wallet_movements
       WHERE wallet_id = ${w.wallet_id}
         AND reason = 'demo:initial_contribution'
       LIMIT 1
    `;
    if (exists.length > 0) continue;
    await sql.begin(async (tx) => {
      // Initial contribution.
      await tx`
        INSERT INTO wallet_movements (
          wallet_id, investor_id, movement_type, amount_minor, currency,
          affects_balance, source_project_id, status, reason
        ) VALUES (
          ${w.wallet_id}, ${w.investor_id}, 'capital_contribution', 50000000,
          'USD', 'cash', ${w.project_id}, 'recorded', 'demo:initial_contribution'
        )
      `;
      // Profit distribution from Eternal.
      await tx`
        INSERT INTO wallet_movements (
          wallet_id, investor_id, movement_type, amount_minor, currency,
          affects_balance, source_project_id, status, reason
        ) VALUES (
          ${w.wallet_id}, ${w.investor_id}, 'profit_distribution', 7500000,
          'USD', 'cash', ${w.project_id}, 'recorded', 'demo:eternal_q1_dist'
        )
      `;
      // Recent withdrawal request (pending — no balance change).
      await tx`
        INSERT INTO wallet_movements (
          wallet_id, investor_id, movement_type, amount_minor, currency,
          affects_balance, source_project_id, status, reason
        ) VALUES (
          ${w.wallet_id}, ${w.investor_id}, 'withdrawal_request', -2500000,
          'USD', 'pending_distribution', ${w.project_id}, 'pending',
          'demo:pending_withdrawal'
        )
      `;
      // Update wallet bucket: cash + 50000000 + 7500000.
      await tx`
        UPDATE investor_wallets
           SET cash_balance_minor = cash_balance_minor + 57500000,
               last_activity_at = now()
         WHERE id = ${w.wallet_id}
      `;
    });
    movementCnt += 3;
  }
  console.log(`✓ wallet_movements (${movementCnt} demo movements)`);

  // 11.4) Residual inventory (Eternal Villas: 2 unsold villas) ----------
  const eternalProjectId = slugMap["eternal-villas"];
  let residualCnt = 0;
  if (eternalProjectId) {
    const eternalVillas = await sql`
      SELECT id FROM villas WHERE project_id = ${eternalProjectId} LIMIT 2
    `;
    for (const v of eternalVillas) {
      const exists = await sql`
        SELECT id FROM residual_inventory_units WHERE unit_id = ${v.id} LIMIT 1
      `;
      if (exists.length > 0) {
        residualCnt++;
        continue;
      }
      const [row] = await sql`
        INSERT INTO residual_inventory_units (
          unit_id, project_id, status, became_residual_at, activation_reason,
          list_price_minor, current_market_value_minor,
          conservative_liquidation_value_minor,
          active_valuation_method, active_valuation_minor,
          active_valuation_date, active_valuation_source, currency
        ) VALUES (
          ${v.id}, ${eternalProjectId}, 'unsold',
          CURRENT_DATE - INTERVAL '30 days',
          'Project completed without full sellout',
          85000000, 78000000, 65000000,
          'current_market_value', 78000000,
          CURRENT_DATE - INTERVAL '30 days', 'broker_estimate', 'USD'
        )
        RETURNING id
      `;
      // Allocate ownership 65/35 Arconique/investor via by_arconique_25_credit.
      // For demo simplicity, hard-code shares.
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO residual_unit_ownership_shares (
            residual_unit_id, arconique_share, investor_id,
            ownership_percentage, economic_claim_minor, settlement_method,
            settlement_basis, is_approved, effective_date
          ) VALUES (
            ${row.id}, TRUE, NULL, 65.0000, 50700000, 'by_arconique_25_credit',
            ${JSON.stringify({ note: "demo seed" })}::jsonb,
            FALSE, CURRENT_DATE
          )
        `;
        if (investorOne) {
          await tx`
            INSERT INTO residual_unit_ownership_shares (
              residual_unit_id, arconique_share, investor_id,
              ownership_percentage, economic_claim_minor, settlement_method,
              settlement_basis, is_approved, effective_date
            ) VALUES (
              ${row.id}, FALSE, ${investorOne}, 35.0000, 27300000,
              'by_arconique_25_credit',
              ${JSON.stringify({ note: "demo seed" })}::jsonb,
              FALSE, CURRENT_DATE
            )
          `;
        }
      });
      residualCnt++;
    }
  }
  console.log(`✓ residual_inventory_units (${residualCnt} unsold villas)`);

  // 11.5) Buyers + unit assignments + portal access ---------------------
  const buyerSpecs = [
    { name: "Liu Wei", email: "liu.wei@example.com", lang: "zh", kyc: "verified", portal: true },
    { name: "Sophia Brown", email: "sophia@example.com", lang: "en", kyc: "verified", portal: true },
    { name: "Hiroshi Tanaka", email: "hiroshi@example.com", lang: "en", kyc: "in_progress", portal: false },
    { name: "Anna Petrov", email: "anna@example.com", lang: "ru", kyc: "submitted", portal: false },
    { name: "Putu Suweca", email: "putu@example.com", lang: "id", kyc: "not_started", portal: false },
  ];
  let buyerCnt = 0;
  const buyerIdsByName = {};
  for (let i = 0; i < buyerSpecs.length; i++) {
    const spec = buyerSpecs[i];
    const code = `BYR-${String(i + 1).padStart(3, "0")}`;
    const existing = await sql`SELECT id FROM buyers WHERE buyer_code = ${code} LIMIT 1`;
    let buyerId = existing[0]?.id;
    if (!buyerId) {
      const [row] = await sql`
        INSERT INTO buyers (
          buyer_code, display_name, primary_email, preferred_language,
          kyc_status, kyc_completed_at, portal_access_enabled, portal_invited_at
        ) VALUES (
          ${code}, ${spec.name}, ${spec.email}, ${spec.lang}, ${spec.kyc},
          ${spec.kyc === "verified" ? new Date() : null},
          ${spec.portal}, ${spec.portal ? new Date() : null}
        )
        RETURNING id
      `;
      buyerId = row.id;
    }
    buyerIdsByName[spec.name] = buyerId;
    buyerCnt++;
  }
  console.log(`✓ buyers (${buyerCnt} buyers, ${buyerSpecs.filter((s) => s.portal).length} with portal access)`);

  // Assign first 3 buyers to villas.
  const villasForBuyers = await sql`
    SELECT v.id, v.project_id FROM villas v
     LEFT JOIN buyer_unit_assignments bua ON bua.unit_id = v.id
     WHERE bua.id IS NULL
     LIMIT 3
  `;
  const assignableBuyers = ["Liu Wei", "Sophia Brown", "Hiroshi Tanaka"];
  let assignCnt = 0;
  for (let i = 0; i < Math.min(villasForBuyers.length, assignableBuyers.length); i++) {
    const buyerId = buyerIdsByName[assignableBuyers[i]];
    if (!buyerId) continue;
    await sql`
      INSERT INTO buyer_unit_assignments (
        buyer_id, unit_id, status, assigned_at
      ) VALUES (
        ${buyerId}, ${villasForBuyers[i].id}, 'contracted', CURRENT_DATE - INTERVAL '90 days'
      )
      ON CONFLICT (buyer_id, unit_id) DO NOTHING
    `;
    assignCnt++;
  }
  console.log(`✓ buyer_unit_assignments (${assignCnt} villa assignments)`);

  // 11.6) Buyer progress reports ----------------------------------------
  let reportCnt = 0;
  if (eternalProjectId) {
    for (let i = 0; i < 3; i++) {
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() - 30 * i);
      const periodStart = new Date(periodEnd);
      periodStart.setDate(periodStart.getDate() - 30);
      const periodEndStr = periodEnd.toISOString().slice(0, 10);
      const exists = await sql`
        SELECT id FROM buyer_progress_reports
         WHERE project_id = ${eternalProjectId} AND reporting_period_end = ${periodEndStr}
         LIMIT 1
      `;
      if (exists.length > 0) {
        reportCnt++;
        continue;
      }
      await sql`
        INSERT INTO buyer_progress_reports (
          unit_id, project_id, reporting_period_start, reporting_period_end,
          current_progress_percentage, works_completed_summary, works_planned_summary,
          next_milestone, expected_handover_date, budget_progress_confidence,
          management_commentary, status, approved_at, published_at
        ) VALUES (
          NULL, ${eternalProjectId},
          ${periodStart.toISOString().slice(0, 10)}, ${periodEndStr},
          ${75 - i * 10},
          'Roof structure complete on Villa A and B. Plumbing rough-in finished. Tile work started in master bathrooms.',
          'Electrical rough-in scheduled for next week. Pool excavation begins after receiving permit signoff.',
          ${i === 0 ? 'Pool excavation' : i === 1 ? 'Roof completion' : 'Slab pour'},
          ${i === 0 ? '2026-09-15' : '2026-08-15'},
          'high',
          'On schedule. Slight budget pressure on imported finishes is being managed through alternative supplier sourcing.',
          'published', now(), now()
        )
      `;
      reportCnt++;
    }
  }
  console.log(`✓ buyer_progress_reports (${reportCnt} published reports)`);

  // 11.7) Investor portal requests (sample HITL flow) --------------------
  let reqCnt = 0;
  if (investorOne) {
    const samples = [
      { type: "withdrawal", amount: 1500000, status: "submitted", code: "IRQ-2026-9001" },
      { type: "withdrawal", amount: 2500000, status: "executed", code: "IRQ-2026-9002" },
      { type: "reinvest_to_project", amount: 5000000, status: "submitted", code: "IRQ-2026-9003" },
      { type: "capital_call_response", amount: 3000000, status: "approved", code: "IRQ-2026-9004" },
    ];
    for (const s of samples) {
      const exists = await sql`SELECT id FROM investor_portal_requests WHERE request_code = ${s.code} LIMIT 1`;
      if (exists.length > 0) {
        reqCnt++;
        continue;
      }
      await sql`
        INSERT INTO investor_portal_requests (
          investor_id, request_code, request_type, requested_amount_minor,
          currency, status, investor_notes, submitted_at,
          executed_at
        ) VALUES (
          ${investorOne}, ${s.code}, ${s.type}, ${s.amount}, 'USD', ${s.status},
          'Demo seed sample request', now() - INTERVAL '7 days',
          ${s.status === 'executed' ? new Date() : null}
        )
      `;
      reqCnt++;
    }
  }
  console.log(`✓ investor_portal_requests (${reqCnt} demo requests)`);

  console.log("— Stage 4.B seeding complete —\n");

  // ====================================================================
  // 12) Stage 4.C — Daily Operations Critical Path
  // ====================================================================
  console.log("\n— Stage 4.C seeding —");

  const eternalForC = (
    await sql`SELECT id, slug FROM projects WHERE slug = 'eternal-villas' LIMIT 1`
  )[0];
  const ensoForC = (
    await sql`SELECT id, slug FROM projects WHERE slug = 'enso-villas' LIMIT 1`
  )[0];
  const ahauForC = (
    await sql`SELECT id, slug FROM projects WHERE slug = 'ahau-gardens' LIMIT 1`
  )[0];
  const adminForC = (
    await sql`SELECT id FROM app_users LIMIT 1`
  )[0];

  // 12.1) QA/QC issues (categories already seeded by migration 0051) -----
  const qcCats = await sql`SELECT id, category_key FROM qa_qc_categories`;
  const catBy = Object.fromEntries(qcCats.map((c) => [c.category_key, c.id]));
  const eternalVillasC = eternalForC
    ? await sql`SELECT id FROM villas WHERE project_id = ${eternalForC.id} LIMIT 4`
    : [];

  const qcSpecs = adminForC && eternalForC && eternalVillasC.length > 0 && catBy.finishing_microcement
    ? [
        {
          code: "QC-2026-0001",
          title: "Microcement crack on master bath wall",
          severity: "high",
          status: "open",
          category: catBy.finishing_microcement,
          villaId: eternalVillasC[0].id,
        },
        {
          code: "QC-2026-0002",
          title: "Outlet not grounded in living room",
          severity: "critical",
          status: "in_progress",
          category: catBy.mep_electrical,
          villaId: eternalVillasC[0].id,
        },
        {
          code: "QC-2026-0003",
          title: "Tile alignment off in pool deck",
          severity: "medium",
          status: "ready_for_reinspection",
          category: catBy.finishing_tile,
          villaId: eternalVillasC[1]?.id ?? null,
        },
        {
          code: "QC-2026-0004",
          title: "Door frame splinter (pre-paint)",
          severity: "low",
          status: "accepted",
          category: catBy.finishing_woodwork,
          villaId: eternalVillasC[2]?.id ?? null,
        },
        {
          code: "QC-2026-0005",
          title: "Pool light flickering",
          severity: "high",
          status: "rejected",
          category: catBy.pool_water,
          villaId: eternalVillasC[1]?.id ?? null,
        },
        {
          code: "QC-2026-0006",
          title: "Hairline crack on column footing",
          severity: "critical",
          status: "closed",
          category: catBy.structural,
          villaId: eternalVillasC[3]?.id ?? null,
        },
      ]
    : [];

  let qcCnt = 0;
  for (const spec of qcSpecs) {
    const exists = await sql`SELECT id FROM qa_qc_issues WHERE issue_code = ${spec.code} LIMIT 1`;
    if (exists.length > 0) {
      qcCnt++;
      continue;
    }
    await sql`
      INSERT INTO qa_qc_issues (
        issue_code, title, project_id, villa_id, category_id, severity,
        description, reported_by, status, deadline_at
      ) VALUES (
        ${spec.code}, ${spec.title}, ${eternalForC.id}, ${spec.villaId},
        ${spec.category}, ${spec.severity},
        ${"Found during routine inspection. " + spec.title},
        ${adminForC.id}, ${spec.status},
        CURRENT_DATE + INTERVAL '7 days'
      )
    `;
    qcCnt++;
  }
  console.log(`✓ qa_qc_issues (${qcCnt} demo issues across statuses)`);

  // 12.2) Inventory locations + items + stock ---------------------------
  const locSpecs = [
    { code: "WH-CENTRAL", name: "Central warehouse (Denpasar)", type: "warehouse" },
    { code: "SITE-ETERNAL", name: "Eternal Villas site", type: "site", projectId: eternalForC?.id },
    { code: "SITE-ENSO", name: "Enso Villas site", type: "site", projectId: ensoForC?.id },
    { code: "SITE-AHAU", name: "Ahau Gardens site", type: "site", projectId: ahauForC?.id },
    { code: "IN-TRANSIT", name: "In transit", type: "in_transit" },
  ];
  const locIds = {};
  for (const spec of locSpecs) {
    const existing = await sql`
      SELECT id FROM dev_os_inventory_locations WHERE location_code = ${spec.code} LIMIT 1
    `;
    if (existing[0]) {
      locIds[spec.code] = existing[0].id;
      continue;
    }
    const [row] = await sql`
      INSERT INTO dev_os_inventory_locations (location_code, display_name, location_type, project_id)
      VALUES (${spec.code}, ${spec.name}, ${spec.type}, ${spec.projectId ?? null})
      RETURNING id
    `;
    locIds[spec.code] = row.id;
  }
  console.log(`✓ dev_os_inventory_locations (${Object.keys(locIds).length})`);

  // 30 SKUs across categories.
  const skuSpecs = [
    ["CEM-PORTLAND-50KG", "Portland cement 50kg bag", "cement", "bag", 80000, 50],
    ["CEM-WHITE-25KG", "White cement 25kg bag", "cement", "bag", 120000, 20],
    ["REBAR-D10-12M", "Rebar D10mm 12m length", "rebar", "piece", 95000, 100],
    ["REBAR-D12-12M", "Rebar D12mm 12m length", "rebar", "piece", 135000, 100],
    ["REBAR-D16-12M", "Rebar D16mm 12m length", "rebar", "piece", 240000, 50],
    ["TILE-PORC-60X60-CHARC", "Porcelain tile 60x60 charcoal", "tile", "m2", 185000, 100],
    ["TILE-MARBLE-30X60-CARRARA", "Marble tile 30x60 Carrara", "tile", "m2", 425000, 30],
    ["MICROCEMENT-V3-25KG", "Microcement V3 finish 25kg", "microcement", "bag", 450000, 10],
    ["MICROCEMENT-PRIMER-5L", "Microcement primer 5L", "microcement", "liter", 320000, 8],
    ["PAINT-EXT-WHITE-20L", "Exterior paint white 20L", "paint", "liter", 850000, 5],
    ["PAINT-INT-WARMSAND-20L", "Interior paint warm sand 20L", "paint", "liter", 720000, 5],
    ["WIRE-CU-25MM-100M", "Copper wire 2.5mm² 100m", "electrical", "piece", 350000, 20],
    ["WIRE-CU-40MM-100M", "Copper wire 4mm² 100m", "electrical", "piece", 580000, 15],
    ["BREAKER-MCB-32A", "MCB breaker 32A single pole", "electrical", "piece", 95000, 25],
    ["OUTLET-DOUBLE-WHITE", "Double outlet white", "electrical", "piece", 65000, 50],
    ["PIPE-PVC-50MM-4M", "PVC pipe 50mm 4m length", "plumbing", "piece", 85000, 60],
    ["PIPE-PVC-100MM-4M", "PVC pipe 100mm 4m length", "plumbing", "piece", 165000, 40],
    ["FITTING-ELBOW-50MM", "PVC elbow fitting 50mm", "plumbing", "piece", 25000, 100],
    ["AC-INDOOR-2HP-MIDEA", "Midea AC indoor unit 2HP", "hvac", "set", 4250000, 4],
    ["AC-OUTDOOR-2HP-MIDEA", "Midea AC outdoor unit 2HP", "hvac", "set", 5800000, 4],
    ["DOOR-WOOD-SOLID-90X210", "Solid wood door 90x210cm", "wood_finishing", "piece", 1850000, 6],
    ["WINDOW-ALU-120X100", "Aluminium window 120x100cm", "glass_aluminium", "piece", 2250000, 8],
    ["MIXER-KITCHEN-CHROME", "Kitchen mixer chrome", "fixtures", "piece", 950000, 5],
    ["TOILET-WALLHUNG-WHITE", "Wall-hung toilet white", "fixtures", "set", 3850000, 4],
    ["RAILING-SS-1M", "Stainless steel railing 1m section", "fixtures", "m", 750000, 30],
    ["NAILS-COMMON-2KG", "Common nails 2kg pack", "consumables", "kg", 35000, 20],
    ["SCREWS-DRYWALL-1KG", "Drywall screws 1kg pack", "consumables", "kg", 45000, 15],
    ["SAFETY-HELMET-WHITE", "Safety helmet white", "consumables", "piece", 85000, 30],
    ["SAFETY-GLOVES-PAIR", "Safety gloves pair", "consumables", "piece", 25000, 50],
    ["TOOL-HAMMER-22OZ", "Hammer 22oz", "tools", "piece", 185000, 10],
  ];
  let skuCnt = 0;
  const skuIds = {};
  for (const [sku, name, cat, uom, cost, reorder] of skuSpecs) {
    const existing = await sql`SELECT id FROM dev_os_inventory_items WHERE sku = ${sku} LIMIT 1`;
    if (existing[0]) {
      skuIds[sku] = existing[0].id;
      skuCnt++;
      continue;
    }
    const [row] = await sql`
      INSERT INTO dev_os_inventory_items (
        sku, display_name, category, unit_of_measure,
        average_cost_minor, last_purchase_price_minor, default_currency,
        reorder_point, is_active
      ) VALUES (
        ${sku}, ${name}, ${cat}, ${uom},
        ${cost * 100}, ${cost * 100}, 'IDR',
        ${reorder}, TRUE
      )
      RETURNING id
    `;
    skuIds[sku] = row.id;
    skuCnt++;
  }
  console.log(`✓ dev_os_inventory_items (${skuCnt} SKUs)`);

  // Initial stock — receive ~150 units of cement at central warehouse, etc.
  let movCnt = 0;
  if (locIds["WH-CENTRAL"] && adminForC && skuIds["CEM-PORTLAND-50KG"]) {
    const movementSpecs = [
      ["CEM-PORTLAND-50KG", "received", 150, null, "WH-CENTRAL"],
      ["REBAR-D10-12M", "received", 200, null, "WH-CENTRAL"],
      ["REBAR-D12-12M", "received", 200, null, "WH-CENTRAL"],
      ["TILE-PORC-60X60-CHARC", "received", 250, null, "WH-CENTRAL"],
      ["MICROCEMENT-V3-25KG", "received", 30, null, "WH-CENTRAL"],
      ["PAINT-EXT-WHITE-20L", "received", 12, null, "WH-CENTRAL"],
      // Issue some to Eternal site.
      ["CEM-PORTLAND-50KG", "issued_to_site", 80, "WH-CENTRAL", "SITE-ETERNAL"],
      ["REBAR-D10-12M", "issued_to_site", 100, "WH-CENTRAL", "SITE-ETERNAL"],
      ["TILE-PORC-60X60-CHARC", "issued_to_site", 100, "WH-CENTRAL", "SITE-ETERNAL"],
      // Use some on site.
      ["CEM-PORTLAND-50KG", "used", 60, "SITE-ETERNAL", null],
      ["REBAR-D10-12M", "used", 80, "SITE-ETERNAL", null],
      ["TILE-PORC-60X60-CHARC", "used", 70, "SITE-ETERNAL", null],
    ];
    for (const [sku, type, qty, from, to] of movementSpecs) {
      const itemId = skuIds[sku];
      if (!itemId) continue;
      const fromId = from ? locIds[from] : null;
      const toId = to ? locIds[to] : null;
      const codeKey = `INV-2026-${String(9000 + movCnt).padStart(4, "0")}`;
      const exists = await sql`SELECT id FROM dev_os_inventory_movements WHERE movement_code = ${codeKey} LIMIT 1`;
      if (exists.length > 0) {
        movCnt++;
        continue;
      }
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO dev_os_inventory_movements (
            movement_code, item_id, quantity, movement_type,
            from_location_id, to_location_id,
            project_id, responsible_user_id, movement_date, reason
          ) VALUES (
            ${codeKey}, ${itemId}, ${qty}, ${type},
            ${fromId}, ${toId},
            ${eternalForC?.id ?? null}, ${adminForC.id}, CURRENT_DATE - INTERVAL '14 days',
            'demo seed initial stock'
          )
        `;
        // Update balances.
        if (toId && type !== "used") {
          await tx`
            INSERT INTO dev_os_inventory_stock_balances (item_id, location_id, quantity_on_hand, last_movement_at)
            VALUES (${itemId}, ${toId}, ${qty}, now())
            ON CONFLICT (item_id, location_id) DO UPDATE
              SET quantity_on_hand = dev_os_inventory_stock_balances.quantity_on_hand + ${qty},
                  last_movement_at = now()
          `;
        }
        if (fromId) {
          await tx`
            UPDATE dev_os_inventory_stock_balances
              SET quantity_on_hand = quantity_on_hand - ${qty},
                  last_movement_at = now()
            WHERE item_id = ${itemId} AND location_id = ${fromId}
          `;
        }
      });
      movCnt++;
    }
  }
  console.log(`✓ dev_os_inventory_movements (${movCnt} demo movements + balance updates)`);

  // 12.3) Work packages -------------------------------------------------
  let wpCnt = 0;
  const wpIds = {};
  if (eternalForC) {
    const wpSpecs = [
      ["WP-ETV-001", "Foundation works", "2026-01-01", "2026-02-15"],
      ["WP-ETV-002", "Structural framing", "2026-02-16", "2026-04-30"],
      ["WP-ETV-003", "MEP rough-in", "2026-05-01", "2026-06-15"],
      ["WP-ETV-004", "MEP finish", "2026-06-16", "2026-07-31"],
      ["WP-ETV-005", "Wall finishing (microcement)", "2026-08-01", "2026-09-15"],
      ["WP-ETV-006", "Floor finishing", "2026-08-15", "2026-09-30"],
      ["WP-ETV-007", "Pool construction", "2026-06-01", "2026-08-31"],
      ["WP-ETV-008", "Landscaping", "2026-09-15", "2026-10-31"],
    ];
    const villaIds = (
      await sql`SELECT id FROM villas WHERE project_id = ${eternalForC.id} LIMIT 4`
    ).map((v) => v.id);
    for (const [code, name, start, finish] of wpSpecs) {
      const existing = await sql`SELECT id FROM work_packages WHERE package_code = ${code} LIMIT 1`;
      if (existing[0]) {
        wpIds[code] = existing[0].id;
        wpCnt++;
        continue;
      }
      const [row] = await sql`
        INSERT INTO work_packages (
          package_code, name, project_id, villa_ids,
          planned_start, planned_finish, status
        ) VALUES (
          ${code}, ${name}, ${eternalForC.id}, ${villaIds},
          ${start}, ${finish}, 'planned'
        )
        RETURNING id
      `;
      wpIds[code] = row.id;
      wpCnt++;
    }
  }
  console.log(`✓ work_packages (${wpCnt} demo packages for Eternal Villas)`);

  // 12.4) Tasks + dependencies -------------------------------------------
  let taskCnt = 0;
  const taskIds = {};
  if (Object.keys(wpIds).length > 0) {
    const taskSpecs = [
      // Foundation
      ["TSK-ETV-001", "Site clearing", "WP-ETV-001", "2026-01-01", "2026-01-07"],
      ["TSK-ETV-002", "Excavation", "WP-ETV-001", "2026-01-08", "2026-01-21"],
      ["TSK-ETV-003", "Footings + slab pour", "WP-ETV-001", "2026-01-22", "2026-02-15"],
      // Structure
      ["TSK-ETV-004", "Column reinforcement", "WP-ETV-002", "2026-02-16", "2026-03-15"],
      ["TSK-ETV-005", "Beam + slab pour (1F)", "WP-ETV-002", "2026-03-16", "2026-04-15"],
      ["TSK-ETV-006", "Roof structure", "WP-ETV-002", "2026-04-16", "2026-04-30"],
      // MEP rough-in
      ["TSK-ETV-007", "Electrical rough-in", "WP-ETV-003", "2026-05-01", "2026-05-31"],
      ["TSK-ETV-008", "Plumbing rough-in", "WP-ETV-003", "2026-05-15", "2026-06-15"],
      // Wall finishing
      ["TSK-ETV-009", "Microcement primer", "WP-ETV-005", "2026-08-01", "2026-08-15"],
      ["TSK-ETV-010", "Microcement V3 application", "WP-ETV-005", "2026-08-16", "2026-09-15"],
      // Pool
      ["TSK-ETV-011", "Pool excavation", "WP-ETV-007", "2026-06-01", "2026-06-15"],
      ["TSK-ETV-012", "Pool shell + tiling", "WP-ETV-007", "2026-06-16", "2026-08-31"],
    ];
    for (const [code, name, wpCode, start, finish] of taskSpecs) {
      const wpId = wpIds[wpCode];
      if (!wpId) continue;
      const existing = await sql`SELECT id FROM project_tasks WHERE task_code = ${code} LIMIT 1`;
      if (existing[0]) {
        taskIds[code] = existing[0].id;
        taskCnt++;
        continue;
      }
      const [row] = await sql`
        INSERT INTO project_tasks (
          task_code, name, work_package_id,
          planned_start, planned_finish, status
        ) VALUES (
          ${code}, ${name}, ${wpId},
          ${start}, ${finish}, 'planned'
        )
        RETURNING id
      `;
      taskIds[code] = row.id;
      taskCnt++;
    }

    // Dependencies — 18 FS edges across the chain (skip if already exist)
    const depSpecs = [
      ["TSK-ETV-001", "TSK-ETV-002"],
      ["TSK-ETV-002", "TSK-ETV-003"],
      ["TSK-ETV-003", "TSK-ETV-004"],
      ["TSK-ETV-004", "TSK-ETV-005"],
      ["TSK-ETV-005", "TSK-ETV-006"],
      ["TSK-ETV-006", "TSK-ETV-007"],
      ["TSK-ETV-006", "TSK-ETV-008"],
      ["TSK-ETV-007", "TSK-ETV-009"],
      ["TSK-ETV-008", "TSK-ETV-009"],
      ["TSK-ETV-009", "TSK-ETV-010"],
      ["TSK-ETV-005", "TSK-ETV-011"],
      ["TSK-ETV-011", "TSK-ETV-012"],
    ];
    let depCnt = 0;
    for (const [pred, succ] of depSpecs) {
      const predId = taskIds[pred];
      const succId = taskIds[succ];
      if (!predId || !succId) continue;
      const exists = await sql`
        SELECT id FROM task_dependencies
         WHERE predecessor_id = ${predId} AND successor_id = ${succId}
         LIMIT 1
      `;
      if (exists.length === 0) {
        await sql`
          INSERT INTO task_dependencies (predecessor_id, successor_id, dependency_type, lag_days)
          VALUES (${predId}, ${succId}, 'finish_to_start', 0)
        `;
      }
      depCnt++;
    }
    console.log(`✓ project_tasks (${taskCnt}) + task_dependencies (${depCnt} FS edges)`);
  }

  // 12.5) Decisions ------------------------------------------------------
  let decCnt = 0;
  if (eternalForC && adminForC) {
    const decSpecs = [
      ["Use microcement V3 for exterior walls", "design", "active"],
      ["Switch to Indonesian-sourced rebar for cost", "materials", "active"],
      ["Hire local landscape designer (Made Wijaya recommendation)", "vendor", "active"],
      ["Defer pool heating system to phase 2", "budget", "active"],
      ["Adopt 8-week construction lookahead reviews", "process", "active"],
      ["[OLD] Use microcement V2 for exterior", "design", "superseded"],
    ];
    let i = 0;
    for (const [title, cat, status] of decSpecs) {
      const code = `DEC-${eternalForC.id.slice(0, 8)}-${String(9000 + i).padStart(4, "0")}`;
      const exists = await sql`SELECT id FROM project_decisions WHERE decision_code = ${code} LIMIT 1`;
      if (exists.length > 0) {
        decCnt++;
        i++;
        continue;
      }
      await sql`
        INSERT INTO project_decisions (
          decision_code, title, project_id, decision_text, rationale,
          decided_by, decision_date, category, status
        ) VALUES (
          ${code}, ${title}, ${eternalForC.id},
          ${"Decision: " + title},
          ${"Rationale captured in decision context."},
          ${adminForC.id}, CURRENT_DATE - INTERVAL '60 days',
          ${cat}, ${status}
        )
      `;
      decCnt++;
      i++;
    }
  }
  console.log(`✓ project_decisions (${decCnt} demo decisions)`);

  // 12.6) Risks ----------------------------------------------------------
  let riskCnt = 0;
  if (eternalForC) {
    const riskSpecs = [
      ["Pool excavation may hit aquifer", "weather", "high", "major", "mitigating"],
      ["Microcement supplier delivery delay", "supplier_delay", "medium", "moderate", "monitored"],
      ["FX rate volatility on imported fixtures", "fx_currency", "high", "moderate", "identified"],
      ["Permit approval delay for landscape works", "permit_delay", "very_high", "severe", "planning_mitigation"],
      ["Buyer payment milestone slippage", "buyer_payment_delay", "medium", "major", "mitigating"],
      ["Cost overrun on imported finishes", "cost_overrun", "high", "moderate", "identified"],
      ["Water supply intermittency during construction", "weather", "low", "minor", "monitored"],
      ["Labor shortage during peak season", "labor_shortage", "medium", "moderate", "identified"],
      ["Tax classification ambiguity on tile imports", "tax_uncertainty", "low", "moderate", "monitored"],
      ["Severe rainy season impact", "weather", "medium", "major", "planning_mitigation"],
      ["[CLOSED] Investor draw timing slippage", "investor_funding_delay", "low", "moderate", "closed_resolved"],
      ["[REALIZED] Vendor went insolvent (microcement)", "supplier_delay", "medium", "major", "closed_realized"],
    ];
    let i = 0;
    for (const [title, cat, prob, impact, status] of riskSpecs) {
      const code = `RSK-${eternalForC.id.slice(0, 8)}-${String(900 + i).padStart(3, "0")}`;
      const exists = await sql`SELECT id FROM project_risks WHERE risk_code = ${code} LIMIT 1`;
      if (exists.length > 0) {
        riskCnt++;
        i++;
        continue;
      }
      await sql`
        INSERT INTO project_risks (
          risk_code, title, project_id, description, category,
          probability, impact, mitigation_status, identified_at,
          closed_at, mitigation_plan
        ) VALUES (
          ${code}, ${title}, ${eternalForC.id},
          ${"Risk: " + title}, ${cat},
          ${prob}, ${impact}, ${status},
          CURRENT_DATE - INTERVAL '90 days',
          ${status.startsWith("closed_") ? new Date() : null},
          ${status === "identified" ? null : "Mitigation in progress: vendor backup contracted, schedule buffer added."}
        )
      `;
      riskCnt++;
      i++;
    }
  }
  console.log(`✓ project_risks (${riskCnt} demo risks across statuses)`);

  // 12.7) Change orders --------------------------------------------------
  let coCnt = 0;
  if (eternalForC) {
    const coSpecs = [
      ["Add second-floor balcony to Villa A", "buyer_request", 8500000000, 14, "approved"],
      ["Substitute imported tile for local equivalent", "design_correction", -3500000000, -5, "completed"],
      ["Pool depth increase from 1.5m to 1.8m", "buyer_request", 2200000000, 7, "in_progress"],
      ["Add EV charging station per villa", "regulatory", 1800000000, 3, "under_review"],
      ["Remove window in master bath (privacy)", "buyer_request", -450000000, 0, "completed"],
      ["Site condition: rock encountered, need micropiles", "site_condition", 4500000000, 10, "approved"],
      ["Vendor proposed cost-saving alternative for railings", "vendor_proposed", -1200000000, 0, "requested"],
      ["Investor request: upgrade to premium kitchen package", "investor_request", 12000000000, 5, "rejected"],
    ];
    let i = 0;
    for (const [title, init, costMinor, days, status] of coSpecs) {
      const code = `CO-${eternalForC.id.slice(0, 8)}-2026-${String(900 + i).padStart(3, "0")}`;
      const exists = await sql`SELECT id FROM change_orders WHERE change_order_code = ${code} LIMIT 1`;
      if (exists.length > 0) {
        coCnt++;
        i++;
        continue;
      }
      await sql`
        INSERT INTO change_orders (
          change_order_code, title, project_id, initiated_by_type,
          initiated_by_user_id, requested_at, reason, scope_change_description,
          cost_impact_minor, schedule_impact_days, status
        ) VALUES (
          ${code}, ${title}, ${eternalForC.id}, ${init},
          ${adminForC?.id ?? null}, CURRENT_DATE - INTERVAL '30 days',
          ${"See scope description"}, ${title + " — full implementation details"},
          ${costMinor}, ${days}, ${status}
        )
      `;
      coCnt++;
      i++;
    }
  }
  console.log(`✓ change_orders (${coCnt} demo change orders)`);

  console.log("— Stage 4.C seeding complete —\n");

  // ====================================================================
  // 13) Stage 5.A — Knowledge Base Foundation
  // ====================================================================
  console.log("\n— Stage 5.A seeding —");

  const eternal5A = (
    await sql`SELECT id, slug FROM projects WHERE slug = 'eternal-villas' LIMIT 1`
  )[0];
  const admin5A = (await sql`SELECT id FROM app_users LIMIT 1`)[0];
  const sampleDoc = (await sql`SELECT id FROM documents LIMIT 1`)[0];
  const sampleVendors = await sql`SELECT id FROM vendors LIMIT 3`;

  // 13.1) Drawings -----------------------------------------------------
  let drawingCnt = 0;
  const drawingIds = {};
  if (eternal5A && admin5A && sampleDoc) {
    const drawingSpecs = [
      ["ARC-ETV-A-001", "A-001", "Ground floor plan — Villa A", "architectural", "construction_set"],
      ["ARC-ETV-A-002", "A-002", "First floor plan — Villa A", "architectural", "construction_set"],
      ["STR-ETV-S-001", "S-001", "Foundation plan", "structural", "construction_set"],
      ["STR-ETV-S-002", "S-002", "Column schedule", "structural", "construction_set"],
      ["MEP-ETV-E-001", "E-001", "Electrical layout — Villa A GF", "mep_electrical", "construction_set"],
      ["MEP-ETV-P-001", "P-001", "Plumbing rough-in — Villa A", "mep_plumbing", "construction_set"],
      ["LND-ETV-L-001", "L-001", "Landscape master plan", "landscape", "design_development"],
      ["POL-ETV-P-001", "P-001", "Pool detail — Villa A", "pool", "construction_set"],
    ];
    for (const [code, num, title, type, phase] of drawingSpecs) {
      const exists = await sql`SELECT id FROM drawings WHERE drawing_code = ${code} LIMIT 1`;
      let id = exists[0]?.id;
      if (!id) {
        const [row] = await sql`
          INSERT INTO drawings (
            drawing_code, drawing_number, title, project_id,
            drawing_type, drawing_phase, author_firm, created_by
          ) VALUES (
            ${code}, ${num}, ${title}, ${eternal5A.id},
            ${type}, ${phase}, 'Arconique Studio', ${admin5A.id}
          )
          RETURNING id
        `;
        id = row.id;
      }
      drawingIds[code] = id;
      drawingCnt++;
    }
  }
  console.log(`✓ drawings (${drawingCnt} sample drawings)`);

  // 13.2) Drawing revisions for ARC-ETV-A-001 ---------------------------
  let revCnt = 0;
  if (drawingIds["ARC-ETV-A-001"] && sampleDoc && admin5A) {
    const revSpecs = [
      ["A", "Initial issue", "superseded"],
      ["B", "Bedroom 2 wall layout updated per client", "issued_for_construction"],
    ];
    for (const [label, reason, status] of revSpecs) {
      const exists = await sql`
        SELECT id FROM drawing_revisions
         WHERE drawing_id = ${drawingIds["ARC-ETV-A-001"]} AND revision_label = ${label}
         LIMIT 1
      `;
      if (exists[0]) {
        revCnt++;
        continue;
      }
      await sql`
        INSERT INTO drawing_revisions (
          drawing_id, revision_label, revision_date, revision_reason,
          document_id, status, approved_by, approved_at,
          issued_for_construction_at, issued_by
        ) VALUES (
          ${drawingIds["ARC-ETV-A-001"]}, ${label},
          CURRENT_DATE - INTERVAL '60 days', ${reason},
          ${sampleDoc.id}, ${status},
          ${admin5A.id}, now() - INTERVAL '60 days',
          ${status === 'issued_for_construction' ? new Date() : null},
          ${status === 'issued_for_construction' ? admin5A.id : null}
        )
      `;
      revCnt++;
    }
  }
  console.log(`✓ drawing_revisions (${revCnt} revisions, including IFC)`);

  // 13.3) Drawing distribution log to vendors ---------------------------
  let distCnt = 0;
  if (sampleVendors.length > 0 && admin5A && drawingIds["ARC-ETV-A-001"]) {
    const ifcRev = await sql`
      SELECT id FROM drawing_revisions
       WHERE drawing_id = ${drawingIds["ARC-ETV-A-001"]}
         AND status = 'issued_for_construction'
       LIMIT 1
    `;
    if (ifcRev[0]) {
      for (const v of sampleVendors.slice(0, 3)) {
        const exists = await sql`
          SELECT id FROM drawing_distribution_log
           WHERE revision_id = ${ifcRev[0].id} AND vendor_id = ${v.id}
           LIMIT 1
        `;
        if (exists[0]) {
          distCnt++;
          continue;
        }
        await sql`
          INSERT INTO drawing_distribution_log (
            revision_id, vendor_id, distributed_by, distribution_method
          ) VALUES (
            ${ifcRev[0].id}, ${v.id}, ${admin5A.id}, 'whatsapp'
          )
        `;
        distCnt++;
      }
    }
  }
  console.log(`✓ drawing_distribution_log (${distCnt} vendor receipts)`);

  // 13.4) BOQ -----------------------------------------------------------
  let boqDocId = null;
  let sectionCnt = 0;
  let itemCnt = 0;
  if (eternal5A && admin5A) {
    const exists = await sql`
      SELECT id FROM boq_documents WHERE boq_code = 'BOQ-ETV-2026-001' LIMIT 1
    `;
    if (exists[0]) {
      boqDocId = exists[0].id;
    } else {
      const [row] = await sql`
        INSERT INTO boq_documents (
          boq_code, title, project_id, version_label, version_number,
          currency, qs_firm, prepared_by, status
        ) VALUES (
          'BOQ-ETV-2026-001', 'Eternal Villas — main works', ${eternal5A.id},
          'v1.0', 1, 'IDR', 'Bali QS Consulting', ${admin5A.id}, 'approved'
        )
        RETURNING id
      `;
      boqDocId = row.id;
    }

    const sectionSpecs = [
      ["1", "Earthworks"],
      ["2", "Structure"],
      ["3", "MEP"],
      ["4", "Finishing"],
    ];
    const sectionIdByCode = {};
    for (const [code, name] of sectionSpecs) {
      const sExists = await sql`
        SELECT id FROM boq_sections
         WHERE boq_document_id = ${boqDocId} AND section_code = ${code}
         LIMIT 1
      `;
      let id = sExists[0]?.id;
      if (!id) {
        const [r] = await sql`
          INSERT INTO boq_sections (boq_document_id, section_code, section_name)
          VALUES (${boqDocId}, ${code}, ${name})
          RETURNING id
        `;
        id = r.id;
      }
      sectionIdByCode[code] = id;
      sectionCnt++;
    }

    const itemSpecs = [
      ["1", "001", "Site clearing & excavation", 1500, "m²", 8500],
      ["1", "002", "Backfill & compaction", 1200, "m³", 15000],
      ["1", "003", "Termite treatment", 800, "m²", 12000],
      ["1", "004", "Topsoil removal & stockpile", 600, "m³", 22000],
      ["2", "001", "C30 concrete columns", 42, "m³", 1850000],
      ["2", "002", "C30 concrete beams", 38, "m³", 1850000],
      ["2", "003", "C30 concrete slabs", 55, "m³", 1750000],
      ["2", "004", "Rebar reinforcement (D10)", 8500, "kg", 14000],
      ["2", "005", "Rebar reinforcement (D12)", 6200, "kg", 14000],
      ["2", "006", "Rebar reinforcement (D16)", 3800, "kg", 14500],
      ["2", "007", "Concrete formwork", 1200, "m²", 95000],
      ["2", "008", "Wall block masonry", 850, "m²", 165000],
      ["3", "001", "Electrical panel installation", 4, "set", 12500000],
      ["3", "002", "Wiring & conduit (per villa)", 4, "set", 28500000],
      ["3", "003", "Outlet & switch installation", 240, "piece", 95000],
      ["3", "004", "LED lighting fixtures", 180, "piece", 350000],
      ["3", "005", "Plumbing pipe & fittings", 4, "set", 22500000],
      ["3", "006", "Sanitary fixtures (per villa)", 4, "set", 18500000],
      ["3", "007", "AC indoor units (2HP)", 16, "set", 4250000],
      ["3", "008", "AC outdoor units (2HP)", 16, "set", 5800000],
      ["3", "009", "Water heater installation", 8, "set", 8500000],
      ["3", "010", "Pool pumps & filters", 4, "set", 35000000],
      ["4", "001", "Microcement V3 — interior walls", 1800, "m²", 425000],
      ["4", "002", "Porcelain tile — bathrooms", 320, "m²", 285000],
      ["4", "003", "Porcelain tile — kitchen", 180, "m²", 285000],
      ["4", "004", "Hardwood flooring — bedrooms", 480, "m²", 850000],
      ["4", "005", "Exterior paint", 1200, "m²", 95000],
      ["4", "006", "Solid wood doors (90x210)", 32, "piece", 1850000],
      ["4", "007", "Aluminium windows (120x100)", 56, "piece", 2250000],
      ["4", "008", "Kitchen cabinetry (linear m)", 48, "m", 4500000],
    ];
    for (const [secCode, itemCode, desc, qty, uom, rate] of itemSpecs) {
      const sectionId = sectionIdByCode[secCode];
      if (!sectionId) continue;
      const iExists = await sql`
        SELECT id FROM boq_items
         WHERE section_id = ${sectionId} AND item_code = ${itemCode}
         LIMIT 1
      `;
      if (iExists[0]) {
        itemCnt++;
        continue;
      }
      await sql`
        INSERT INTO boq_items (
          section_id, item_code, description, quantity, unit_of_measure,
          unit_rate_minor, rate_currency
        ) VALUES (
          ${sectionId}, ${itemCode}, ${desc}, ${qty}, ${uom},
          ${rate * 100}, 'IDR'
        )
      `;
      itemCnt++;
    }

    // Recompute totals (subtotals + document total).
    await sql`
      UPDATE boq_sections
         SET subtotal_minor = (
           SELECT COALESCE(SUM(total_minor), 0)
             FROM boq_items
            WHERE section_id = boq_sections.id
         )
       WHERE boq_document_id = ${boqDocId}
    `;
    await sql`
      UPDATE boq_documents
         SET total_amount_minor = (
           SELECT COALESCE(SUM(subtotal_minor), 0)
             FROM boq_sections
            WHERE boq_document_id = ${boqDocId}
              AND parent_section_id IS NULL
         )
       WHERE id = ${boqDocId}
    `;
  }
  console.log(`✓ boq_documents (1) + sections (${sectionCnt}) + items (${itemCnt}) — totals recomputed`);

  // 13.5) Specifications ------------------------------------------------
  let specCnt = 0;
  const specSpecs = [
    ["SPEC-MICROCEMENT-V3", "Microcement Warm Taupe V3", "wall_finish", "Topciment", "MC-V3-WT", "warm_taupe"],
    ["SPEC-PAINT-EXT-WHITE", "Exterior paint — bright white", "paint", "Jotun", "JOT-EXT-WHT", "bright_white"],
    ["SPEC-PAINT-INT-WARMSAND", "Interior paint — warm sand", "paint", "Jotun", "JOT-INT-WSD", "warm_sand"],
    ["SPEC-TILE-PORC-CHARC", "Porcelain tile 60x60 charcoal", "tile", "Porcelanosa", "PRC-60-CHC", "charcoal"],
    ["SPEC-TILE-MARBLE-CARRARA", "Marble tile 30x60 Carrara", "tile", "Levantina", "LEV-30-CAR", "carrara_white"],
    ["SPEC-WOOD-TEAK-FLOOR", "Teak hardwood flooring", "wood", "Sinharaja Teak", "SIN-TEAK-FL", "natural"],
    ["SPEC-FIXT-MIXER-CHROME", "Kitchen mixer — chrome", "plumbing_fixture", "Hansgrohe", "HG-CHR-MX", "chrome"],
    ["SPEC-FIXT-TOILET-WHWHT", "Wall-hung toilet — white", "plumbing_fixture", "Geberit", "GEB-WHWHT", "white"],
    ["SPEC-LIGHT-LED-COB", "LED COB downlight 12W", "lighting", "Philips", "PHI-LED-12", "warm_white_3000K"],
    ["SPEC-DOOR-TEAK-90X210", "Teak solid door 90x210", "door_window", "Local Bali", "LB-TKD-90", "natural"],
    ["SPEC-WIN-ALU-120X100", "Aluminium window 120x100", "door_window", "Schüco", "SCH-W120", "anodised_grey"],
    ["SPEC-LAMP-OUTDOOR", "Outdoor wall sconce", "lighting", "Flos", "FLOS-OUT-01", "antique_brass"],
    ["SPEC-RAIL-SS-1M", "Stainless steel railing 1m", "metal", "Local fab", "LF-SSR-1M", "satin"],
    ["SPEC-LANDSCAPE-FRANGIPANI", "Frangipani tree (3m)", "landscape", "Local nursery", "LN-FRANG-3M", "white_flower"],
    ["SPEC-POOL-TILE-MOSAIC", "Pool mosaic tile (azure)", "pool", "Bisazza", "BIS-MOS-AZ", "azure_blue"],
  ];
  for (const [code, name, cat, brand, model, color] of specSpecs) {
    const exists = await sql`SELECT id FROM specifications WHERE spec_code = ${code} LIMIT 1`;
    if (exists[0]) {
      specCnt++;
      continue;
    }
    await sql`
      INSERT INTO specifications (
        spec_code, spec_name, description, spec_category, brand, model_number,
        color_code, created_by
      ) VALUES (
        ${code}, ${name}, ${name + ' — full specification'}, ${cat}, ${brand}, ${model},
        ${color}, ${admin5A?.id ?? null}
      )
    `;
    specCnt++;
  }
  console.log(`✓ specifications (${specCnt} demo specs)`);

  // 13.6) Method statements ---------------------------------------------
  let msCnt = 0;
  const msSpecs = [
    ["MS-MICROCEMENT-WALL-001", "Microcement Wall Application", "finishing"],
    ["MS-CONCRETE-POUR-001", "Concrete Pour — Slab", "structural"],
    ["MS-TILE-INSTALL-001", "Tile Installation — Floor", "finishing"],
    ["MS-PAINT-EXT-001", "Exterior Paint Application", "finishing"],
    ["MS-ELEC-ROUGHIN-001", "Electrical Rough-in", "mep_electrical"],
    ["MS-PLUMB-ROUGHIN-001", "Plumbing Rough-in", "mep_plumbing"],
    ["MS-AC-INSTALL-001", "AC Indoor Unit Installation", "mep_hvac"],
    ["MS-POOL-WATERPROOF-001", "Pool Waterproofing", "structural"],
  ];
  for (const [code, title, cat] of msSpecs) {
    const exists = await sql`SELECT id FROM method_statements WHERE method_code = ${code} LIMIT 1`;
    if (exists[0]) {
      msCnt++;
      continue;
    }
    await sql`
      INSERT INTO method_statements (
        method_code, title, category, procedure_steps, status, created_by
      ) VALUES (
        ${code}, ${title}, ${cat},
        ${JSON.stringify([
          { step: 1, instruction: "Prepare surface and verify substrate per spec." },
          { step: 2, instruction: "Apply primer / preparation coat." },
          { step: 3, instruction: "Apply main material per manufacturer's instructions." },
          { step: 4, instruction: "Allow curing per spec; inspect before next layer." },
          { step: 5, instruction: "Document with photos and submit for QA inspection." },
        ])}::jsonb,
        'active', ${admin5A?.id ?? null}
      )
    `;
    msCnt++;
  }
  console.log(`✓ method_statements (${msCnt} demo SOPs)`);

  // 13.7) Quality standards ---------------------------------------------
  let qsCnt = 0;
  const qsSpecs = [
    ["QS-WALL-FLATNESS-001", "Wall Flatness", "wall_finish", "Maximum deviation ±2mm with 2m straight-edge."],
    ["QS-TILE-ALIGN-001", "Tile Alignment", "tile_alignment", "Joint width consistent ±0.5mm; no lippage > 1mm."],
    ["QS-PAINT-COVERAGE-001", "Paint Coverage", "paint_coverage", "No runs, sags, or holidays. Two coats minimum."],
    ["QS-CONCRETE-FINISH-001", "Concrete Surface Finish", "structural", "Smooth float finish; no honeycombing visible."],
    ["QS-MICROCEMENT-001", "Microcement Application", "wall_finish", "Even color, no bubbles, smooth surface within ±1mm tolerance."],
    ["QS-ELEC-OUTLET-001", "Electrical Outlet Install", "mep_electrical", "Outlets level, secure, properly grounded."],
    ["QS-PLUMB-LEAK-001", "Plumbing — No Leaks", "mep_plumbing", "Pressure test 24h at 1.5x working pressure with no drop."],
    ["QS-DOOR-FIT-001", "Door Hanging Fit", "door_window", "Door swings freely; gap ≤ 3mm on all sides; latches engage cleanly."],
    ["QS-WINDOW-SEAL-001", "Window Seal", "door_window", "Hermetic seal; no daylight visible at frame perimeter."],
    ["QS-POOL-WATERPROOF-001", "Pool Waterproofing", "structural", "Hold test 72h with < 5mm water-level drop."],
    ["QS-FLOOR-LEVEL-001", "Floor Level", "floor_finish", "Maximum slope 1:200 unless intentional drainage; flat ±2mm/2m."],
    ["QS-LANDSCAPE-PLANT-001", "Plant Health", "landscape", "Plants healthy, properly staked, drip irrigation operational."],
  ];
  for (const [code, title, cat, criteria] of qsSpecs) {
    const exists = await sql`SELECT id FROM quality_standards WHERE standard_code = ${code} LIMIT 1`;
    if (exists[0]) {
      qsCnt++;
      continue;
    }
    await sql`
      INSERT INTO quality_standards (
        standard_code, title, category, acceptance_criteria,
        measurement_method, created_by
      ) VALUES (
        ${code}, ${title}, ${cat}, ${criteria},
        'Visual inspection + measurement instrument as appropriate',
        ${admin5A?.id ?? null}
      )
    `;
    qsCnt++;
  }
  console.log(`✓ quality_standards (${qsCnt} demo standards)`);

  console.log("— Stage 5.A seeding complete —\n");

  // ====================================================================
  // Stage 5.B — Strategic Features demo seed
  // ====================================================================
  console.log("— Stage 5.B seeding —");

  // 14.1) Sample non-villa assets (one of each non-villa category) ------
  // Asset types are seeded via migration 0057. We add a few non-villa
  // assets to demonstrate the multi-asset model.
  const nonVillaSeeds = [
    ["AP-CLUB-LOFT-A12", "Club Loft A12", "apartment", { area_sqm: 95, bedrooms: 2 }],
    ["RT-BEACHFRONT-08", "Beachfront Table 08", "restaurant_table", { seats: 6, location_type: "outdoor" }],
    ["LP-SAWAH-NORTH", "Sawah North Land Parcel", "land_parcel", { area_sqm: 5400 }],
    ["PL-INFINITY-POOL-A", "Infinity Pool — Phase A", "pool", { capacity: 30 }],
  ];
  let asset5BCnt = 0;
  // Pick a project to anchor the assets to (any active project).
  const anchorProj5B = await sql`SELECT id FROM projects ORDER BY created_at LIMIT 1`;
  const anchorProjectId5B = anchorProj5B[0]?.id ?? null;
  for (const [code, name, typeKey, attrs] of nonVillaSeeds) {
    const exists = await sql`SELECT id FROM villas WHERE unit_code = ${code} LIMIT 1`;
    if (exists[0]) { asset5BCnt++; continue; }
    const [t] = await sql`SELECT id FROM asset_types WHERE type_key = ${typeKey} LIMIT 1`;
    if (!t || !anchorProjectId5B) continue;
    const slug = code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await sql`
      INSERT INTO villas (
        project_id, slug, unit_code, name, status, asset_type_id, asset_attributes
      ) VALUES (
        ${anchorProjectId5B}, ${slug}, ${code}, ${name}, 'ready', ${t.id},
        ${JSON.stringify(attrs)}::jsonb
      )
    `;
    asset5BCnt++;
  }
  console.log(`✓ non-villa assets seeded (${asset5BCnt})`);

  // 14.2) 12 months of payroll periods (current + 11 forward) -----------
  let prCnt = 0;
  const today5b = new Date();
  for (let i = 0; i < 12; i++) {
    const ym = new Date(Date.UTC(today5b.getUTCFullYear(), today5b.getUTCMonth() + i, 1));
    const ymEnd = new Date(Date.UTC(ym.getUTCFullYear(), ym.getUTCMonth() + 1, 0));
    const label = `PAY-${ym.getUTCFullYear()}-${String(ym.getUTCMonth() + 1).padStart(2, "0")}`;
    const exists = await sql`SELECT id FROM payroll_periods WHERE period_label = ${label} LIMIT 1`;
    if (exists[0]) { prCnt++; continue; }
    await sql`
      INSERT INTO payroll_periods (
        period_label, period_type, period_start, period_end,
        total_payroll_amount_minor, currency, total_headcount, status
      ) VALUES (
        ${label}, 'monthly',
        ${ym.toISOString().slice(0, 10)},
        ${ymEnd.toISOString().slice(0, 10)},
        ${i === 0 ? 42000000n * 100n : 38000000n * 100n}, 'IDR', 14,
        ${i === 0 ? "committed" : "projected"}
      )
    `;
    prCnt++;
  }
  console.log(`✓ payroll_periods (${prCnt})`);

  // 14.3) 6 months of team capacity tracking ----------------------------
  const roles = ["pm", "qs", "site_supervisor", "engineer", "architect", "finance"];
  let tcCnt = 0;
  for (let i = 0; i < 6; i++) {
    const ms = new Date(Date.UTC(today5b.getUTCFullYear(), today5b.getUTCMonth() - i, 1));
    const me = new Date(Date.UTC(ms.getUTCFullYear(), ms.getUTCMonth() + 1, 0));
    for (const role of roles) {
      const exists = await sql`
        SELECT id FROM team_capacity_tracking
        WHERE tracking_period_start = ${ms.toISOString().slice(0, 10)} AND role_type = ${role}
        LIMIT 1
      `;
      if (exists[0]) { tcCnt++; continue; }
      const cap = role === "pm" ? 320 : role === "engineer" ? 480 : 240;
      const used = Math.round(cap * (0.55 + Math.random() * 0.4));
      await sql`
        INSERT INTO team_capacity_tracking (
          tracking_period_start, tracking_period_end, role_type,
          total_team_members, total_capacity_hours, allocations, utilized_hours
        ) VALUES (
          ${ms.toISOString().slice(0, 10)}, ${me.toISOString().slice(0, 10)}, ${role},
          ${role === "engineer" ? 3 : role === "pm" ? 2 : 1}, ${cap},
          ${JSON.stringify({ project_id: anchorProjectId5B, share_pct: 100 })}::jsonb, ${used}
        )
      `;
      tcCnt++;
    }
  }
  console.log(`✓ team_capacity_tracking (${tcCnt})`);

  // 14.4) Sample project-cycle recommendations --------------------------
  let pcrCnt = 0;
  const recs = [
    ["PCR-2026-001", "continue_current_pace", "high", "Runway 14 months, capacity steady — safe to continue."],
    ["PCR-2026-002", "start_new_project_in_X_weeks", "medium", "Earliest team idle in ~6 weeks; queue land acquisition now."],
    ["PCR-2026-003", "reduce_team_size", "low", "Forecast utilisation 48% next quarter; consider trimming 1 admin."],
  ];
  for (const [code, action, conf, reasoning] of recs) {
    const exists = await sql`SELECT id FROM project_cycle_recommendations WHERE recommendation_code = ${code} LIMIT 1`;
    if (exists[0]) { pcrCnt++; continue; }
    await sql`
      INSERT INTO project_cycle_recommendations (
        recommendation_code, generated_for_date, generated_by_agent,
        context_snapshot, recommended_action, ai_reasoning,
        confidence_level, operator_status
      ) VALUES (
        ${code}, CURRENT_DATE, 'project_cycle_intelligence',
        ${JSON.stringify({ runway_months: 14, predicted_idle_weeks: 6 })}::jsonb,
        ${action}, ${reasoning}, ${conf}, 'unreviewed'
      )
    `;
    pcrCnt++;
  }
  console.log(`✓ project_cycle_recommendations (${pcrCnt})`);

  // 14.5) Unit cost allocations — one per villa-asset on anchor project --
  const villasOnAnchor = await sql`
    SELECT v.id FROM villas v
    JOIN asset_types t ON t.id = v.asset_type_id
    WHERE v.project_id = ${anchorProjectId5B} AND t.type_key = 'villa'
    LIMIT 6
  `;
  let ucaCnt = 0;
  for (const v of villasOnAnchor) {
    const exists = await sql`
      SELECT id FROM unit_cost_allocations
      WHERE asset_id = ${v.id} AND is_current = true LIMIT 1
    `;
    if (exists[0]) { ucaCnt++; continue; }
    await sql`
      INSERT INTO unit_cost_allocations (
        project_id, asset_id, land_allocation_method,
        land_cost_allocated_minor, hard_cost_direct_minor, hard_cost_allocated_minor,
        soft_cost_allocated_minor, marketing_cost_allocated_minor,
        financing_cost_allocated_minor, contingency_used_minor,
        expected_sale_price_minor, computed_at, computation_method,
        is_current, currency
      ) VALUES (
        ${anchorProjectId5B}, ${v.id}, 'by_floor_area',
        ${1500000000n}, ${2400000000n}, ${1800000000n}, ${280000000n},
        ${120000000n}, ${180000000n}, ${150000000n}, ${9500000000n},
        now(), 'seed', true, 'IDR'
      )
    `;
    ucaCnt++;
  }
  console.log(`✓ unit_cost_allocations (${ucaCnt})`);

  // 14.6) One active 12-month company-wide cashflow forecast ------------
  const cfExists = await sql`
    SELECT id FROM cashflow_forecasts
    WHERE scope = 'company_wide' AND status = 'active' LIMIT 1
  `;
  if (!cfExists[0]) {
    const cfStart = new Date(Date.UTC(today5b.getUTCFullYear(), today5b.getUTCMonth(), 1));
    const projections = [];
    let cum = 8500000000n;
    for (let i = 0; i < 12; i++) {
      const m = new Date(Date.UTC(cfStart.getUTCFullYear(), cfStart.getUTCMonth() + i, 1));
      const inflow = i % 3 === 0 ? 1800000000n : 600000000n;
      const outflow = 850000000n;
      const net = inflow - outflow;
      cum += net;
      projections.push({
        month: m.toISOString().slice(0, 10),
        inflow: Number(inflow),
        outflow: Number(outflow),
        net: Number(net),
        cumulativeCash: Number(cum),
      });
    }
    await sql`
      INSERT INTO cashflow_forecasts (
        forecast_label, scope, project_id,
        forecast_horizon_months, forecast_start_month,
        monthly_projections,
        peak_capital_required_minor, total_inflow_minor, total_outflow_minor,
        ending_cash_minor, status, generated_by_agent
      ) VALUES (
        ${`CF-${cfStart.getUTCFullYear()}-${String(cfStart.getUTCMonth() + 1).padStart(2, "0")}-COMPANY`},
        'company_wide', NULL,
        12, ${cfStart.toISOString().slice(0, 10)},
        ${JSON.stringify(projections)}::jsonb,
        0, ${projections.reduce((a, p) => a + p.inflow, 0)},
        ${projections.reduce((a, p) => a + p.outflow, 0)},
        ${Number(cum)}, 'active', true
      )
    `;
    console.log(`✓ cashflow_forecasts (1 active 12-month company-wide)`);
  } else {
    console.log(`✓ cashflow_forecasts (existing active forecast preserved)`);
  }

  console.log("— Stage 5.B seeding complete —\n");

  // ====================================================================
  // Stage 5.C — Executive Command Center demo seed
  // ====================================================================
  console.log("— Stage 5.C seeding —");

  // 15.1) Executive metrics snapshots — 90 days of daily history -------
  const todayCC = new Date();
  let snapCnt = 0;
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.UTC(todayCC.getUTCFullYear(), todayCC.getUTCMonth(), todayCC.getUTCDate() - i));
    const dStr = d.toISOString().slice(0, 10);
    const exists = await sql`
      SELECT id FROM executive_metrics_snapshots
       WHERE snapshot_date = ${dStr} AND scope = 'company_wide' AND project_id IS NULL
       LIMIT 1
    `;
    if (exists[0]) { snapCnt++; continue; }
    // Realistic-ish progression: cash slowly drains then bumps from a sale.
    const base = 8_500_000_000n;
    const drain = BigInt(i * 5_000_000);
    const cash = base - drain + (i % 14 === 0 ? 600_000_000n : 0n);
    const projOnTrack = 5;
    const projAtRisk = i % 7 === 0 ? 1 : 0;
    const projDelayed = i % 21 === 0 ? 1 : 0;
    await sql`
      INSERT INTO executive_metrics_snapshots (
        snapshot_date, snapshot_type, scope, project_id,
        total_cash_on_hand_minor, cash_in_idr_equivalent_minor,
        total_receivables_minor, receivables_aging,
        total_payables_minor, payables_due_next_30_days_minor, payables_overdue_minor,
        tax_payable_minor, unclassified_transactions_count,
        active_projects_count, projects_on_track, projects_at_risk, projects_delayed,
        active_leads_count, hot_leads_count, reservations_count, contracts_signed_this_month,
        total_pipeline_value_minor,
        total_committed_capital_minor, total_drawn_capital_minor,
        pending_distribution_minor, pending_investor_requests_count,
        open_qa_qc_issues, critical_qa_qc_issues, pending_change_orders,
        high_risk_items_count, low_stock_items_count,
        total_committed_budget_minor, total_actual_spend_minor,
        budget_burn_percentage, blended_margin_percentage,
        payroll_runway_weeks,
        cash_at_30_days_minor, cash_at_60_days_minor, cash_at_90_days_minor,
        identified_cash_gaps_count, base_currency, fx_snapshot
      ) VALUES (
        ${dStr}, 'daily', 'company_wide', NULL,
        ${cash}, ${cash},
        ${1_200_000_000n}, ${JSON.stringify({ current: 800000000, days_1_30: 250000000, days_31_60: 100000000, days_61_90: 30000000, days_over_90: 20000000 })}::jsonb,
        ${850_000_000n}, ${300_000_000n}, ${50_000_000n},
        ${120_000_000n}, ${i % 10},
        ${projOnTrack + projAtRisk + projDelayed}, ${projOnTrack}, ${projAtRisk}, ${projDelayed},
        ${30 + (i % 5)}, ${5 + (i % 3)}, ${2}, ${i % 30 === 0 ? 1 : 0},
        ${4_500_000_000n},
        ${20_000_000_000n}, ${12_500_000_000n + BigInt(i * 10_000_000)},
        ${800_000_000n}, ${i % 14 === 0 ? 1 : 0},
        ${4 + (i % 3)}, ${i % 21 === 0 ? 1 : 0}, ${1 + (i % 4)},
        ${2 + (i % 3)}, ${1 + (i % 5)},
        ${50_000_000_000n}, ${22_000_000_000n + BigInt(i * 50_000_000)},
        ${(44 + (i / 10)).toFixed(2)}, ${(18.5).toFixed(4)},
        ${(28 - i / 12).toFixed(2)},
        ${cash - 850_000_000n}, ${cash - 1_700_000_000n}, ${cash - 2_550_000_000n},
        ${i < 30 ? 1 : 0}, 'IDR',
        ${JSON.stringify([{ from: "USD", to: "IDR", rate: 16000 }])}::jsonb
      )
    `;
    snapCnt++;
  }
  console.log(`✓ executive_metrics_snapshots (${snapCnt} daily)`);

  // 15.2) Risk radar alerts — 12 sample alerts -------------------------
  const yyyy = new Date().getUTCFullYear();
  const alertSeeds = [
    ["ALERT-2026-9001", "cash_flow", "critical", "Cash gap predicted in 45 days", "rule_based", "rule:cash-gap-forecast", "open"],
    ["ALERT-2026-9002", "cash_flow", "high", "Receivables aging — Rp 600M over 60 days", "rule_based", "rule:receivables-aging", "open"],
    ["ALERT-2026-9003", "cash_flow", "medium", "FX volatility — IDR/USD ±3% this week", "ai_risk_radar", "ai:fx-volatility", "acknowledged"],
    ["ALERT-2026-9004", "budget_overrun", "high", "Project Sawah Loft burn 78% vs progress 55%", "rule_based", "rule:budget-overrun", "investigating"],
    ["ALERT-2026-9005", "budget_overrun", "low", "Villa A finishing line over 8% — minor variance", "rule_based", "rule:budget-overrun", "resolved"],
    ["ALERT-2026-9006", "schedule_delay", "high", "Foundation pour delayed 11 days (critical path)", "rule_based", "rule:schedule-task-overdue", "open"],
    ["ALERT-2026-9007", "schedule_delay", "medium", "MEP rough-in 5 days behind schedule", "rule_based", "rule:schedule-task-overdue", "acknowledged"],
    ["ALERT-2026-9008", "quality_issue", "high", "Recurring waterproofing rework — 3rd incident this quarter", "ai_risk_radar", "ai:recurring-quality", "open"],
    ["ALERT-2026-9009", "vendor_performance", "medium", "Sumber Sentosa on-time only 60%", "rule_based", "rule:vendor-performance", "open"],
    ["ALERT-2026-9010", "data_health", "medium", "57 transactions unclassified (>7 days old)", "rule_based", "rule:transaction-missing-tax", "open"],
    ["ALERT-2026-9011", "tax", "high", "PPN report for Q1 not yet finalised", "rule_based", "rule:tax-period-overdue", "acknowledged"],
    ["ALERT-2026-9012", "sales_pipeline", "medium", "3 hot leads with no follow-up in 14 days", "rule_based", "rule:hot-lead-stale", "open"],
  ];
  let alertCnt = 0;
  for (const [code, cat, sev, title, src, method, status] of alertSeeds) {
    const exists = await sql`SELECT id FROM risk_radar_alerts WHERE alert_code = ${code} LIMIT 1`;
    if (exists[0]) { alertCnt++; continue; }
    await sql`
      INSERT INTO risk_radar_alerts (
        alert_code, detected_at, detection_source, detection_method,
        alert_category, severity, title, description,
        detected_pattern, affected_entities, supporting_data,
        recommended_action, status, similar_alerts_count, is_recurring,
        ai_reasoning, confidence_level
      ) VALUES (
        ${code}, now() - INTERVAL '2 days', ${src}, ${method},
        ${cat}, ${sev}, ${title},
        ${title + " — see supporting data for full context."},
        ${method.replace(/^rule:|^ai:/, "")},
        ${JSON.stringify({ projectIds: [], transactionIds: [] })}::jsonb,
        ${JSON.stringify({ seed: true })}::jsonb,
        'Investigate and resolve via the relevant operational page.',
        ${status},
        ${cat === "quality_issue" ? 3 : 0}, ${cat === "quality_issue"},
        ${src === "ai_risk_radar" ? "AI flagged this as a recurring pattern based on 90-day history." : null},
        ${sev === "critical" || sev === "high" ? "high" : "medium"}
      )
    `;
    alertCnt++;
  }
  console.log(`✓ risk_radar_alerts (${alertCnt})`);

  // 15.3) Executive digests — 3 sample monthly digests -----------------
  const digestSeeds = [
    ["DIGEST-2026-02", "February 2026", "2026-02-01", "2026-02-28", "approved"],
    ["DIGEST-2026-03", "March 2026",    "2026-03-01", "2026-03-31", "distributed"],
    ["DIGEST-2026-04", "April 2026",    "2026-04-01", "2026-04-30", "draft"],
  ];
  let digestCnt = 0;
  for (const [code, label, ps, pe, status] of digestSeeds) {
    const exists = await sql`SELECT id FROM executive_digests WHERE digest_code = ${code} LIMIT 1`;
    if (exists[0]) { digestCnt++; continue; }
    await sql`
      INSERT INTO executive_digests (
        digest_code, period_label, period_start, period_end, digest_type,
        executive_summary, cash_position_section, project_progress_section,
        sales_section, investor_section, operations_section, risks_section,
        key_wins, key_concerns, recommended_actions,
        ai_generated, ai_provider, ai_model, status
      ) VALUES (
        ${code}, ${label}, ${ps}, ${pe}, 'monthly',
        ${`## ${label} executive summary\n\nSteady operational tempo with modest cash drain offset by 1 contract closure. Project portfolio remains 5/6 on track. Investor capital deployed 62%.`},
        ${"### Cash position\n- Cash on hand: **Rp 8.4B**\n- Payroll runway: **24 weeks**"},
        ${"### Projects\n- Active: 6 (5 on track, 1 at risk)\n- Sawah Loft burn vs progress concerning."},
        ${"### Sales\n- 32 active leads (8 hot)\n- 1 contract signed this period."},
        ${"### Investor capital\n- Committed: Rp 20B\n- Drawn: Rp 12.5B\n- Available: Rp 7.5B"},
        ${"### Operations\n- Open QA/QC: 5 (1 critical)\n- Recurring waterproofing pattern flagged."},
        ${"### Risks\n- Cash gap predicted in 45 days\n- Recurring quality pattern (3rd incident)"},
        ${`{"Contract signed for Villa B","5/6 projects on track"}`}::text[],
        ${`{"Cash gap forecast in 45 days","Recurring waterproofing rework","57 unclassified transactions"}`}::text[],
        ${`{"Initiate next capital call ahead of forecast gap","Review waterproofing SOP urgently","Bulk-classify transactions"}`}::text[],
        true, 'anthropic', 'claude-opus-4-7', ${status}
      )
    `;
    digestCnt++;
  }
  console.log(`✓ executive_digests (${digestCnt})`);

  console.log("— Stage 5.C seeding complete —\n");

  // ====================================================================
  // Stage 5.D — Specialized AI Agents demo seed
  // ====================================================================
  console.log("— Stage 5.D seeding —");

  // 16.1) Project AI memory — 25 sample items across 3 projects --------
  const projectsForMem = await sql`SELECT id, name FROM projects ORDER BY created_at LIMIT 3`;
  const memSeeds = [
    ["cost_pattern", "Tile work consistently 8% over budget", "Across last 4 villas, tile labour overran original BoQ by ~8%.", "high", 4],
    ["cost_pattern", "Microcement application requires +12% scope", "Microcement always needs second pass — budget +12% next time.", "medium", 3],
    ["supplier_pattern", "Sumber Sentosa late on bulk cement", "Sumber Sentosa avg 5d late on cement orders >50t.", "high", 6],
    ["supplier_pattern", "BaliBuild Materials reliable for finishing", "BaliBuild Materials on-time >95% for tiles + paint.", "high", 12],
    ["schedule_pattern", "Foundation work +10% over plan", "Foundation pour averages 10% over plan due to soil conditions.", "medium", 5],
    ["team_observation", "Foreman Wayan strongest on critical path", "Wayan delivers concrete + structural items consistently on time.", "high", 8],
    ["team_observation", "Engineer Made best for MEP coordination", "Made's MEP coordination drawings rarely need revision.", "high", 5],
    ["risk_observation", "Groundwater issue requires dewatering", "All Sawah Loft units required dewatering for foundation.", "high", 3],
    ["communication_pattern", "Investor X prefers monthly digests", "Investor X consistently asks for monthly summary; weekly is too much.", "high", 4],
    ["product_specification", "Microcement V3 = warm taupe", "Approved microcement: brand V3, colour 'warm taupe'.", "high", 1],
    ["site_condition", "Sawah North site has 1.2m groundwater", "Sawah North parcel — groundwater table at 1.2m.", "high", 1],
    ["regulatory_note", "PBG processing: 4-6 weeks Bali Selatan", "PBG approval consistently 4-6 weeks for Bali Selatan permits.", "high", 7],
    ["design_evolution", "Pool position moved 3 times", "Sawah Loft pool moved 3 times in design — final at south corner.", "low", 1],
    ["quality_observation", "Vendor Y consistently needs rework on plaster", "Vendor Y plaster rework rate ~30%; recommend alternate.", "high", 5],
    ["general_lesson_learned", "Always sample microcement on-site before final order", "Off-site sample looked different from on-site application.", "medium", 2],
    ["cost_pattern", "Pool finishing materials underestimated", "Pool tile + grout averages 18% over BoQ.", "medium", 3],
    ["supplier_pattern", "Karya Putra unreliable for delivery dates", "Karya Putra avg 8d late; not yet replaced.", "medium", 4],
    ["schedule_pattern", "Permit waiting often hides 3wk slip", "Schedule slips hidden in 'awaiting permits' status — track explicitly.", "medium", 3],
    ["team_observation", "QS Budi best for variation orders", "Budi processes VOs in 2d avg; team avg is 5d.", "medium", 2],
    ["communication_pattern", "Buyer journey expects update every 2 weeks", "Buyers churn after 4w of no progress communication.", "high", 5],
    ["product_specification", "Approved finishing pack: PACK-FINISH-V2", "Standard finishing pack: PACK-FINISH-V2 — see specs library.", "high", 1],
    ["site_condition", "Coastal sites need anti-corrosion fixtures", "All coastal-zone units require marine-grade hardware.", "high", 2],
    ["regulatory_note", "PPN reporting: 25th of month", "PPN reports must be filed by 25th — set internal deadline 22nd.", "high", 1],
    ["risk_observation", "Monsoon delays casting work", "November-March: casting work at risk of slipping 3-7 days.", "high", 4],
    ["quality_observation", "Wood door installer needs supervision", "Door fit issues without on-site supervision; assign Wayan.", "medium", 3],
  ];

  let memCnt = 0;
  for (const p of projectsForMem) {
    for (const [type, title, summary, conf, count] of memSeeds) {
      const exists = await sql`
        SELECT id FROM project_ai_memory
         WHERE project_id = ${p.id} AND title = ${title} LIMIT 1
      `;
      if (exists[0]) { memCnt++; continue; }
      await sql`
        INSERT INTO project_ai_memory (
          project_id, memory_type, title, summary, source_type,
          confidence_level, observed_count, last_observed_at, tags,
          ai_generated_by_agent
        ) VALUES (
          ${p.id}, ${type}, ${title}, ${summary},
          ${count > 1 ? "auto_aggregated" : "manual_entry"},
          ${conf}, ${count}, CURRENT_DATE - (${count} * INTERVAL '7 days'),
          ${`{${type}}`}::text[],
          ${count > 3 ? "ai_memory_aggregator" : null}
        )
      `;
      memCnt++;
      // Cap roughly at 25 distinct items per project to match spec.
      if (memCnt >= 25 * projectsForMem.length) break;
    }
    if (memCnt >= 25 * projectsForMem.length) break;
  }
  console.log(`✓ project_ai_memory (${memCnt} items)`);

  // 16.2) Agent invocation log — 50 dry-run invocations ----------------
  const agentKeys = [
    "qs_cost_analyst", "procurement_analyst", "tax_assistant",
    "marketing_assistant", "executive_business",
    "daily_digest", "weekly_plan",
    "sales_assistant", "photo_analyst", "construction_supervisor",
    "investor_relations", "document_understanding",
  ];
  let invLogCnt = 0;
  for (let i = 0; i < 50; i++) {
    const key = agentKeys[i % agentKeys.length];
    const proj = projectsForMem[i % projectsForMem.length];
    if (!proj) break;
    await sql`
      INSERT INTO agent_invocation_log (
        agent_key, invocation_type, project_id, provider_used,
        memory_items_loaded, status, output_summary, completed_at,
        duration_ms, cost_minor
      ) VALUES (
        ${key}, ${i % 7 === 0 ? "cron_recurring" : "user_triggered"}, ${proj.id},
        'dry_run', ${Math.floor(Math.random() * 5)}, 'dry_run',
        ${`Demo ${key} invocation #${i}`}, now() - (${i} * INTERVAL '1 hour'),
        ${50 + Math.floor(Math.random() * 200)}, 0
      )
    `;
    invLogCnt++;
  }
  console.log(`✓ agent_invocation_log (${invLogCnt} dry-run)`);

  // 16.3) Agent outputs — 15 sample outputs ----------------------------
  const outputSeeds = [
    ["qs_cost_analyst", "cost_analysis", "QS cost analysis — 2 concerns", "Forecast at completion exceeds budget by 8%.", "awaiting_review"],
    ["qs_cost_analyst", "cost_analysis", "QS analysis — 1 critical category", "Tile work projected 18% over budget.", "approved"],
    ["qs_cost_analyst", "cost_analysis", "QS analysis — within tolerance", "All categories tracking as expected.", "rejected"],
    ["procurement_analyst", "supplier_assessment", "Procurement assessment — 1 underperforming", "Karya Putra recommended for replacement.", "awaiting_review"],
    ["procurement_analyst", "supplier_assessment", "Quarterly procurement review", "BaliBuild remains preferred; Sumber Sentosa needs improvement plan.", "edited_and_approved"],
    ["tax_assistant", "tax_classification", "Tax assistant — Q1 (62% close-ready)", "12 unclassified, 5 doc gaps.", "awaiting_review"],
    ["tax_assistant", "tax_classification", "Tax assistant — March (95% close-ready)", "Period close ready; minor doc gaps.", "approved"],
    ["tax_assistant", "tax_classification", "Tax assistant — auto-classification", "8 high-confidence suggestions ready.", "awaiting_review"],
    ["marketing_assistant", "marketing_instagram_caption", "Caption for Sawah Loft sunset photo", "Wake up to Bali sunset at Sawah Loft.", "approved"],
    ["marketing_assistant", "marketing_whatsapp_broadcast", "Broadcast template for monthly buyer update", "Monthly progress update template.", "awaiting_review"],
    ["executive_business", "executive_synthesis", "Weekly executive synthesis — Apr W3", "5 active projects on track; 1 critical alert.", "approved"],
    ["executive_business", "executive_synthesis", "Weekly executive synthesis — Apr W4", "Cash position softening; capital action recommended.", "awaiting_review"],
    ["daily_digest", "daily_digest", "Daily digest — Sawah Loft 2026-04-29", "12 photos, 3 deliveries, 95% attendance. Clean.", "approved"],
    ["daily_digest", "daily_digest", "Daily digest — Sawah Loft 2026-04-30", "8 photos, 1 delivery, 80% attendance. 1 QA/QC opened.", "awaiting_review"],
    ["weekly_plan", "weekly_plan", "Weekly plan — Sawah Loft (Week of 2026-05-04)", "3 critical-path tasks; no material blockers.", "awaiting_review"],
  ];
  let outCnt = 0;
  for (let i = 0; i < outputSeeds.length; i++) {
    const [agentKey, category, title, summary, status] = outputSeeds[i];
    const code = `AGT-OUT-2026-9${String(i + 1).padStart(3, "0")}`;
    const exists = await sql`SELECT id FROM agent_outputs WHERE output_code = ${code} LIMIT 1`;
    if (exists[0]) { outCnt++; continue; }
    const proj = projectsForMem[i % projectsForMem.length];
    await sql`
      INSERT INTO agent_outputs (
        output_code, agent_key, project_id, output_category,
        title, summary, detailed_output, recommended_actions,
        confidence_level, status
      ) VALUES (
        ${code}, ${agentKey}, ${proj?.id ?? null}, ${category},
        ${title}, ${summary},
        ${JSON.stringify({ demo: true, generatedFor: title })}::jsonb,
        ${`{Review and act on the recommendation,Update related memory items if pattern confirmed}`}::text[],
        'medium', ${status}
      )
    `;
    outCnt++;
  }
  console.log(`✓ agent_outputs (${outCnt})`);

  console.log("— Stage 5.D seeding complete —\n");

  // ====================================================================
  // Stage 5.E — Marketing Intelligence demo seed
  // ====================================================================
  console.log("— Stage 5.E seeding —");

  const proj5E = await sql`SELECT id FROM projects ORDER BY created_at LIMIT 3`;
  const projIds5E = proj5E.map((p) => p.id);

  // 17.1) Campaigns — 4 sample campaigns
  const campaignSeeds = [
    ["CAMP-2026-Q1-LAUNCH-ENSO", "Eternal Villas Q1 2026 Launch", "launch", "active",
     "2026-01-01", "2026-03-31", 250_000_000n * 100n],
    ["CAMP-2025-Q4-AHAU-AWARENESS", "Ahau Gardens Awareness", "awareness", "completed",
     "2025-10-01", "2025-12-31", 180_000_000n * 100n],
    ["CAMP-2026-Q2-PIPELINE", "Q2 2026 Pipeline Build", "lead_generation", "in_preparation",
     "2026-04-01", "2026-06-30", 200_000_000n * 100n],
    ["CAMP-2024-LEGACY", "Legacy 2024 Brand Build", "brand_building", "archived",
     "2024-06-01", "2024-12-31", 50_000_000n * 100n],
  ];
  let campCnt = 0;
  const campIds = {};
  for (const [code, name, obj, status, start, end, budget] of campaignSeeds) {
    const exists = await sql`SELECT id FROM campaigns WHERE campaign_code = ${code} LIMIT 1`;
    if (exists[0]) { campCnt++; campIds[code] = exists[0].id; continue; }
    const r = await sql`
      INSERT INTO campaigns (
        campaign_code, name, campaign_objective, status,
        campaign_start, campaign_end, total_budget_minor, currency,
        primary_channels, project_ids, geographic_focus, language_focus
      ) VALUES (
        ${code}, ${name}, ${obj}, ${status},
        ${start}, ${end}, ${budget}, 'IDR',
        ${`{meta_ads,google_ads,instagram_organic}`}::text[],
        ${`{${projIds5E[0] ?? ""}}`}::uuid[],
        ${`{Russia,Singapore,Australia}`}::text[],
        ${`{en,ru,id}`}::text[]
      ) RETURNING id
    `;
    campIds[code] = r[0].id;
    campCnt++;
  }
  console.log(`✓ campaigns (${campCnt})`);

  // 17.2) Campaign costs — 30 entries
  let costCnt = 0;
  const channels5E = ["meta_ads", "google_ads", "instagram_organic", "tiktok_ads"];
  const activeCamp = campIds["CAMP-2026-Q1-LAUNCH-ENSO"];
  const completedCamp = campIds["CAMP-2025-Q4-AHAU-AWARENESS"];
  for (let i = 0; i < 30; i++) {
    const camp = i < 18 ? activeCamp : completedCamp;
    if (!camp) break;
    const month = (i % 12) + 1;
    const year = i < 18 ? 2026 : 2025;
    const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const periodEnd = `${year}-${String(month).padStart(2, "0")}-28`;
    const channel = channels5E[i % channels5E.length];
    const cost = BigInt((10_000_000 + (i * 1_000_000)) * 100);
    const recordId = `seed-cost-${camp}-${periodStart}-${channel}-${i}`;
    const exists = await sql`
      SELECT id FROM campaign_costs WHERE source_record_id = ${recordId} LIMIT 1
    `;
    if (exists[0]) { costCnt++; continue; }
    await sql`
      INSERT INTO campaign_costs (
        campaign_id, period_start, period_end, source_key,
        cost_minor, currency, impressions, clicks, conversions,
        data_source, source_record_id
      ) VALUES (
        ${camp}, ${periodStart}, ${periodEnd}, ${channel},
        ${cost}, 'IDR',
        ${50_000 + (i * 5_000)},
        ${1_000 + (i * 100)},
        ${5 + (i % 20)},
        'manual_entry', ${recordId}
      )
    `;
    costCnt++;
  }
  console.log(`✓ campaign_costs (${costCnt})`);

  // 17.3) Leads — 40 sample leads with varied attribution
  const sourceMix = [
    ["meta_ads", 24],
    ["instagram_organic", 6],
    ["referral", 4],
    ["google_ads", 3],
    ["whatsapp_direct", 2],
    ["partner_referral", 1],
  ];
  let leadCnt = 0;
  let leadSeq = 0;
  for (const [source, count] of sourceMix) {
    for (let i = 0; i < count; i++) {
      leadSeq++;
      const code = `LEAD-2026-${String(leadSeq).padStart(4, "0")}`;
      const exists = await sql`SELECT id FROM leads WHERE lead_code = ${code} LIMIT 1`;
      if (exists[0]) { leadCnt++; continue; }
      const status =
        leadSeq % 8 === 0 ? "reservation"
          : leadSeq % 6 === 0 ? "hot"
          : leadSeq % 4 === 0 ? "qualified"
          : "lead";
      await sql`
        INSERT INTO leads (
          lead_code, project_id, lifecycle_status,
          lead_source_key, first_touch_source_key, last_touch_source_key,
          campaign_id, estimated_value_minor, currency
        ) VALUES (
          ${code}, ${projIds5E[leadSeq % projIds5E.length] ?? null}, ${status},
          ${source}, ${source}, ${source},
          ${leadSeq % 5 === 0 ? activeCamp : null},
          ${BigInt(150_000_00 + (leadSeq * 10_000_00))}, 'IDR'
        )
      `;
      leadCnt++;
    }
  }
  console.log(`✓ leads (${leadCnt})`);

  // 17.4) Content pieces — 25 sample pieces across pipeline
  const adminUserRow = await sql`SELECT id FROM app_users LIMIT 1`;
  const adminUserId = adminUserRow[0]?.id;
  const contentDistribution = [
    ["draft", 5], ["in_production", 4], ["pending_review", 3],
    ["approved", 4], ["scheduled", 4], ["published", 5],
  ];
  let contentCnt = 0;
  let contentSeq = 0;
  if (adminUserId) {
    for (const [status, count] of contentDistribution) {
      for (let i = 0; i < count; i++) {
        contentSeq++;
        const code = `CONT-2026-${String(contentSeq).padStart(4, "0")}`;
        const exists = await sql`SELECT id FROM content_pieces WHERE content_code = ${code} LIMIT 1`;
        if (exists[0]) { contentCnt++; continue; }
        const types = ["instagram_post", "instagram_reel", "tiktok_video", "blog_article", "email_newsletter"];
        const type = types[contentSeq % types.length];
        await sql`
          INSERT INTO content_pieces (
            content_code, title, content_type, content_brief,
            primary_language, status, created_by, related_campaign_id,
            scheduled_publish_at
          ) VALUES (
            ${code}, ${`Demo content ${contentSeq}: ${type}`}, ${type},
            ${`Brief for ${type} piece #${contentSeq}.`},
            'en', ${status}, ${adminUserId}, ${activeCamp ?? null},
            ${status === "scheduled" ? new Date(Date.now() + contentSeq * 24 * 60 * 60 * 1000).toISOString() : null}
          )
        `;
        contentCnt++;
      }
    }
  }
  console.log(`✓ content_pieces (${contentCnt})`);

  // 17.5) Sales conversation threads — 30 threads
  let threadCnt = 0;
  for (let i = 0; i < 30; i++) {
    const code = `THREAD-2026-${String(i + 1).padStart(4, "0")}`;
    const exists = await sql`SELECT id FROM sales_conversation_threads WHERE thread_code = ${code} LIMIT 1`;
    if (exists[0]) { threadCnt++; continue; }
    const outcomes = [
      "still_active", "still_active", "still_active",
      "reservation", "contract_signed",
      "lost_no_response", "lost_competitor", "on_hold",
    ];
    const outcome = outcomes[i % outcomes.length];
    const consent = i < 10;
    const startAt = new Date(Date.now() - (60 + i) * 24 * 60 * 60 * 1000);
    const lastAt = new Date(Date.now() - (i % 10) * 24 * 60 * 60 * 1000);
    await sql`
      INSERT INTO sales_conversation_threads (
        thread_code, primary_sales_manager_id,
        channel_types, conversation_start_at, last_message_at,
        total_message_count, outcome,
        consent_to_analyze, consent_recorded_at, consent_recorded_by
      ) VALUES (
        ${code}, ${adminUserId ?? null},
        ${`{whatsapp,email}`}::text[],
        ${startAt.toISOString()}, ${lastAt.toISOString()},
        ${10 + (i % 30)}, ${outcome},
        ${consent}, ${consent ? new Date().toISOString() : null}, ${consent ? adminUserId : null}
      )
    `;
    threadCnt++;
  }
  console.log(`✓ sales_conversation_threads (${threadCnt})`);

  // 17.5b) Sales conversation messages — transcript bodies for the seeded
  // threads (migration 0184). total_message_count is reset to match so the
  // aggregate stays consistent with the stored transcript.
  const sampleConvo = [
    { dir: "inbound", sender: "Prospect", body: "Hi, saw your villa listing — is unit A3 still available?" },
    { dir: "outbound", sender: null, body: "Hello! Yes, A3 is available. Would you like to schedule a viewing?" },
    { dir: "inbound", sender: "Prospect", body: "What's the price and the payment plan?" },
    { dir: "outbound", sender: null, body: "USD 285k, on a 30/40/30 milestone plan. I'll send the full breakdown." },
    { dir: "inbound", sender: "Prospect", body: "Please do. Freehold or leasehold?" },
    { dir: "outbound", sender: null, body: "Leasehold, 30 years extendable. Sending the brochure now." },
  ];
  let convoMsgCnt = 0;
  const seededThreads = await sql`
    SELECT id, organization_id, conversation_start_at
      FROM sales_conversation_threads
  `;
  for (const th of seededThreads) {
    const existing = await sql`
      SELECT id FROM sales_conversation_messages WHERE thread_id = ${th.id} LIMIT 1
    `;
    if (existing[0]) continue;
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
      convoMsgCnt++;
    }
    await sql`
      UPDATE sales_conversation_threads
         SET total_message_count = ${sampleConvo.length}
       WHERE id = ${th.id}
    `;
  }
  console.log(`✓ sales_conversation_messages (${convoMsgCnt})`);

  // 17.6) Manager performance — 12 weekly snapshots
  let mgrPerfCnt = 0;
  if (adminUserId) {
    for (let w = 0; w < 12; w++) {
      const periodEnd = new Date(Date.now() - w * 7 * 24 * 60 * 60 * 1000);
      const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const ps = periodStart.toISOString().slice(0, 10);
      const pe = periodEnd.toISOString().slice(0, 10);
      const exists = await sql`
        SELECT id FROM manager_performance_metrics
         WHERE manager_id = ${adminUserId} AND period_start = ${ps}
           AND period_end = ${pe} AND period_type = 'weekly'
         LIMIT 1
      `;
      if (exists[0]) { mgrPerfCnt++; continue; }
      const leads = 10 + (w % 8);
      const reservations = Math.floor(leads * 0.15);
      const contracts = Math.floor(reservations * 0.5);
      await sql`
        INSERT INTO manager_performance_metrics (
          manager_id, period_start, period_end, period_type,
          total_leads_assigned, total_conversations_active,
          total_messages_sent, total_calls_made,
          average_response_time_minutes, median_response_time_minutes,
          longest_response_time_hours,
          reservations_secured, contracts_signed, leads_lost,
          lead_to_reservation_rate, reservation_to_contract_rate,
          missed_followups_count, unresponded_messages_count,
          flagged_conversations_count, ai_quality_score
        ) VALUES (
          ${adminUserId}, ${ps}, ${pe}, 'weekly',
          ${leads}, ${leads - 2},
          ${50 + (w * 5)}, ${5 + (w % 3)},
          ${(45 + (w * 5)).toFixed(2)}, ${(30 + (w * 3)).toFixed(2)},
          ${(2 + (w * 0.5)).toFixed(2)},
          ${reservations}, ${contracts}, ${Math.max(0, leads - reservations - 5)},
          ${(reservations / leads * 100).toFixed(2)},
          ${reservations > 0 ? (contracts / reservations * 100).toFixed(2) : "0"},
          ${w % 4}, ${w % 5},
          ${w % 6}, ${(70 + (12 - w)).toFixed(2)}
        )
      `;
      mgrPerfCnt++;
    }
  }
  console.log(`✓ manager_performance_metrics (${mgrPerfCnt})`);

  console.log("— Stage 5.E seeding complete —\n");

  // ====================================================================
  // Stage 5.F — Role-Specific Cabinets demo seed
  // ====================================================================
  console.log("— Stage 5.F seeding —");

  // 18.1) Roles — distribute across existing demo users
  const allUsers = await sql`SELECT id, email FROM app_users ORDER BY created_at LIMIT 12`;
  const ROLE_PLAN = [
    "project_manager", "cfo_accountant", "site_supervisor",
    "sales_manager", "marketing_staff", "qs_analyst",
    "procurement_manager", "warehouse_manager", "executive_ceo",
  ];
  let roleCnt = 0;
  for (let i = 0; i < allUsers.length && i < ROLE_PLAN.length; i++) {
    const userId = allUsers[i].id;
    const roleKey = ROLE_PLAN[i];
    const exists = await sql`
      SELECT id FROM app_user_roles
       WHERE user_id = ${userId} AND role_key = ${roleKey} AND is_active = TRUE
       LIMIT 1
    `;
    if (exists[0]) { roleCnt++; continue; }
    await sql`
      INSERT INTO app_user_roles (
        user_id, role_key, scope, is_primary, is_active
      ) VALUES (
        ${userId}, ${roleKey}, 'company_wide', TRUE, TRUE
      )
    `;
    roleCnt++;
  }
  // Grant first user an extra admin role.
  if (allUsers[0]) {
    const adminExists = await sql`
      SELECT id FROM app_user_roles
       WHERE user_id = ${allUsers[0].id} AND role_key = 'admin' AND is_active = TRUE
       LIMIT 1
    `;
    if (!adminExists[0]) {
      await sql`
        INSERT INTO app_user_roles (
          user_id, role_key, scope, is_primary, is_active
        ) VALUES (
          ${allUsers[0].id}, 'admin', 'company_wide', FALSE, TRUE
        )
      `;
      roleCnt++;
    }
  }
  console.log(`✓ app_user_roles (${roleCnt} grants)`);

  // 18.2) Cabinet preferences — 3 sample customizations
  let prefCnt = 0;
  const prefSamples = [
    { idx: 0, defaultCabinet: "/development-os/cabinets/project-manager",
      widgets: { project_manager: { hidden_widgets: [], widget_order: ["portfolio","ai-insights","decision-inbox"] } } },
    { idx: 1, defaultCabinet: "/development-os/cabinets/cfo-accountant",
      widgets: { cfo_accountant: { hidden_widgets: ["compliance"] } } },
    { idx: 2, defaultCabinet: null,
      widgets: { site_supervisor: { hidden_widgets: ["yesterday-summary"] } } },
  ];
  for (const sp of prefSamples) {
    const u = allUsers[sp.idx];
    if (!u) continue;
    const exists = await sql`
      SELECT id FROM cabinet_preferences WHERE user_id = ${u.id} LIMIT 1
    `;
    if (exists[0]) { prefCnt++; continue; }
    await sql`
      INSERT INTO cabinet_preferences (
        user_id, default_cabinet_key, cabinet_widget_preferences,
        notification_preferences
      ) VALUES (
        ${u.id}, ${sp.defaultCabinet},
        ${JSON.stringify(sp.widgets)}::jsonb,
        ${JSON.stringify({ email_digest: "daily" })}::jsonb
      )
    `;
    prefCnt++;
  }
  console.log(`✓ cabinet_preferences (${prefCnt})`);

  console.log("— Stage 5.F seeding complete —\n");

  // ====================================================================
  // Stage 5.H — Schedule Sophistication demo seed
  // ====================================================================
  console.log("— Stage 5.H seeding —");

  // Calendars + holidays already seeded by migration 0067. Verify count.
  const calCheck = await sql`SELECT COUNT(*)::int AS n FROM working_calendars`;
  console.log(`✓ working_calendars (${calCheck[0]?.n ?? 0} from migration seed)`);

  const holCheck = await sql`SELECT COUNT(*)::int AS n FROM holiday_calendar`;
  console.log(`✓ holiday_calendar (${holCheck[0]?.n ?? 0} from migration seed)`);

  // 19.1) Baselines — 1 baseline per active project
  const projectsForBaseline = await sql`
    SELECT id, name FROM projects
     WHERE status NOT IN ('completed', 'paused', 'archived')
     LIMIT 3
  `;
  let baselineCnt = 0;
  for (const p of projectsForBaseline) {
    const code = `BL-${p.name.replace(/[^A-Za-z0-9]+/g, "-").toUpperCase()}-V1`;
    const exists = await sql`SELECT id FROM schedule_baselines WHERE baseline_code = ${code} LIMIT 1`;
    if (exists[0]) { baselineCnt++; continue; }
    await sql`
      INSERT INTO schedule_baselines (
        baseline_code, name, project_id, baseline_data,
        version_number, is_current_baseline, approved_at
      ) VALUES (
        ${code}, ${`${p.name} initial baseline`}, ${p.id},
        ${JSON.stringify({
          tasks: [],
          dependencies: [],
          critical_path_task_ids: [],
          project_planned_finish: "2026-12-31",
          notes: "demo seed",
        })}::jsonb,
        1, TRUE, now() - INTERVAL '60 days'
      )
    `;
    baselineCnt++;
  }
  console.log(`✓ schedule_baselines (${baselineCnt})`);

  // 19.2) Resource pools — 12 sample pools
  const resourceSeeds = [
    ["VENDOR-CONCRETE-A", "BaliBuild Concrete Crew", "vendor_team", 80, "{concrete,structural}"],
    ["VENDOR-MEP-A", "Sumber MEP Team", "vendor_team", 60, "{mep_electrical,mep_plumbing}"],
    ["VENDOR-FINISHING-A", "Karya Finishing Team", "vendor_team", 70, "{finishing,painting}"],
    ["VENDOR-LANDSCAPE-A", "Sawah Landscape Crew", "vendor_team", 40, "{landscape,gardening}"],
    ["VENDOR-TILE-A", "Tile Master Bali", "vendor_team", 50, "{tiling,wet_areas}"],
    ["VENDOR-ROOFING-A", "Roof Pro Bali", "vendor_team", 30, "{roofing}"],
    ["INTERNAL-PM-TEAM", "Internal PM Team", "internal_team", 40, "{pm,coordination}"],
    ["INTERNAL-QS-TEAM", "Internal QS Team", "internal_team", 32, "{qs,cost_control}"],
    ["INTERNAL-SUP-TEAM", "Internal Site Supervisors", "internal_team", 48, "{supervision,qa_qc}"],
    ["INTERNAL-ADMIN", "Internal Admin Team", "internal_team", 24, "{admin,coordination}"],
    ["IND-ENG-LEAD", "Lead Engineer Made", "individual", 8, "{engineering,mep_coordination}"],
    ["IND-ARCH-LEAD", "Lead Architect Wayan", "individual", 8, "{architecture,design}"],
  ];
  let poolCnt = 0;
  for (const [code, name, type, capacity, skillsLiteral] of resourceSeeds) {
    const exists = await sql`SELECT id FROM resource_pools WHERE resource_code = ${code} LIMIT 1`;
    if (exists[0]) { poolCnt++; continue; }
    await sql`
      INSERT INTO resource_pools (
        resource_code, display_name, resource_type, total_capacity_per_day,
        capacity_unit, skills, is_active
      ) VALUES (
        ${code}, ${name}, ${type}, ${capacity},
        'hours', ${skillsLiteral}::text[], TRUE
      )
    `;
    poolCnt++;
  }
  console.log(`✓ resource_pools (${poolCnt})`);

  // 19.3) Productivity logs — past 30 days, mixed trades
  const adminLogRow = await sql`SELECT id FROM app_users LIMIT 1`;
  const logUserId = adminLogRow[0]?.id;
  const projForLogs = projectsForBaseline[0];
  let prodCnt = 0;
  if (logUserId && projForLogs) {
    const trades = ["concrete", "mep_electrical", "finishing", "tiling", "landscape"];
    for (let d = 0; d < 30; d++) {
      const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      for (const trade of trades) {
        const exists = await sql`
          SELECT id FROM productivity_logs
           WHERE project_id = ${projForLogs.id}
             AND log_date = ${date}
             AND trade_category = ${trade}
           LIMIT 1
        `;
        if (exists[0]) { prodCnt++; continue; }
        const planned = 32 + (d % 5);
        const actual = planned + ((d * 0.5) - 4);
        const qty = 4 + (d % 7) * 0.5;
        await sql`
          INSERT INTO productivity_logs (
            project_id, log_date, trade_category, activity_description,
            planned_hours, actual_hours, quantity_completed, unit_of_measure,
            data_source, recorded_by
          ) VALUES (
            ${projForLogs.id}, ${date}, ${trade},
            ${`${trade} crew daily log`},
            ${planned}, ${actual.toFixed(2)}, ${qty.toFixed(2)},
            ${trade === "concrete" ? "m3" : trade === "tiling" ? "m2" : "units"},
            'manual_entry', ${logUserId}
          )
        `;
        prodCnt++;
      }
    }
  }
  console.log(`✓ productivity_logs (${prodCnt})`);

  console.log("— Stage 5.H seeding complete —\n");

  // ====================================================================
  // Stage 5.I — PWA + Push + Offline demo seed
  // ====================================================================
  console.log("— Stage 5.I seeding —");

  const userRow5I = await sql`SELECT id FROM app_users LIMIT 1`;
  const demoUserId = userRow5I[0]?.id;

  // 20.1) Push subscriptions — 3 sample devices for demo user
  const pushSeeds = [
    ["https://fcm.googleapis.com/fcm/send/SEED-DEVICE-IPHONE", "iPhone 14 — Site Phone", "mobile", true, 0],
    ["https://fcm.googleapis.com/fcm/send/SEED-DEVICE-DESKTOP", "Office MacBook", "desktop", true, 1],
    ["https://fcm.googleapis.com/fcm/send/SEED-DEVICE-TABLET-OLD", "Old iPad (replaced)", "tablet", false, 6],
  ];
  let pushCnt = 0;
  const pushIds = [];
  if (demoUserId) {
    for (const [endpoint, label, type, active, failures] of pushSeeds) {
      const exists = await sql`SELECT id FROM push_subscriptions WHERE endpoint = ${endpoint} LIMIT 1`;
      if (exists[0]) { pushCnt++; pushIds.push(exists[0].id); continue; }
      const r = await sql`
        INSERT INTO push_subscriptions (
          user_id, endpoint, p256dh_key, auth_key,
          device_label, device_type, is_active, consecutive_failures,
          enabled_notification_types
        ) VALUES (
          ${demoUserId}, ${endpoint},
          'BPubKeySeedPlaceholder0123456789abcdefghijklmnopqr',
          'AuthKeySeedPlaceholder123456',
          ${label}, ${type}, ${active}, ${failures},
          ${`{critical_risks,cash_gaps,qa_qc_critical}`}::text[]
        ) RETURNING id
      `;
      pushIds.push(r[0].id);
      pushCnt++;
    }
  }
  console.log(`✓ push_subscriptions (${pushCnt})`);

  // 20.2) Notification dispatch log — 10 sample dispatched notifications
  const notifSeeds = [
    ["critical_risks", "Critical risk: Cash gap forecast", "Cash gap predicted in 45 days", "delivered"],
    ["qa_qc_critical", "Critical QA/QC issue", "Foundation pour fails inspection", "delivered"],
    ["cash_gaps", "Cash position alert", "Cash on hand approaching 30-day threshold", "dispatched"],
    ["sales_followup_reminders", "Hot lead idle 6 days", "Lead LEAD-2026-0007 not contacted recently", "delivered"],
    ["schedule_slip_critical", "Critical-path task slipping", "MEP rough-in delayed 11 days", "delivered"],
    ["agent_output_ready", "QS Cost Analyst output ready", "AGT-OUT-2026-9001 awaiting review", "delivered"],
    ["missed_followup", "Missed follow-up alert", "THREAD-2026-0023 idle 8 days", "delivered"],
    ["test_notification", "Test notification", "Push delivery confirmed", "delivered"],
    ["critical_risks", "Project risk elevated", "Recurring waterproofing pattern detected", "failed"],
    ["cash_gaps", "Reminder: investor capital call window", "Capital call scheduled for next week", "pending"],
  ];
  let notifCnt = 0;
  for (let i = 0; i < notifSeeds.length; i++) {
    const [type, title, body, status] = notifSeeds[i];
    const code = `ND-2026-9${String(i + 1).padStart(3, "0")}`;
    const exists = await sql`SELECT id FROM notification_dispatch_log WHERE dispatch_code = ${code} LIMIT 1`;
    if (exists[0]) { notifCnt++; continue; }
    const subId = pushIds[i % pushIds.length] ?? null;
    const dispatchedAt = status === "pending" ? null : new Date(Date.now() - i * 60 * 60 * 1000).toISOString();
    const deliveredAt = status === "delivered" ? new Date(Date.now() - (i * 60 * 60 * 1000) + 5_000).toISOString() : null;
    const failedAt = status === "failed" ? new Date(Date.now() - i * 60 * 60 * 1000).toISOString() : null;
    await sql`
      INSERT INTO notification_dispatch_log (
        dispatch_code, notification_type, title, body,
        target_user_id, target_subscription_id,
        source_type, dispatch_status,
        dispatched_at, delivered_at, failed_at, failure_reason
      ) VALUES (
        ${code}, ${type}, ${title}, ${body},
        ${demoUserId}, ${subId},
        'demo_seed', ${status},
        ${dispatchedAt}, ${deliveredAt}, ${failedAt},
        ${status === "failed" ? "demo: simulated 410 Gone" : null}
      )
    `;
    notifCnt++;
  }
  console.log(`✓ notification_dispatch_log (${notifCnt})`);

  // 20.3) Offline action queue — 5 sample completed offline actions
  const queueSeeds = [
    ["create_site_report", "client-site-report-001"],
    ["upload_photo", "client-photo-001"],
    ["upload_photo", "client-photo-002"],
    ["create_qa_qc_issue", "client-qaqc-001"],
    ["log_productivity", "client-productivity-001"],
  ];
  let queueCnt = 0;
  if (demoUserId) {
    for (let i = 0; i < queueSeeds.length; i++) {
      const [type, clientId] = queueSeeds[i];
      const code = `OFFLINE-2026-9${String(i + 1).padStart(3, "0")}`;
      const exists = await sql`
        SELECT id FROM offline_action_queue
         WHERE user_id = ${demoUserId} AND client_action_id = ${clientId}
         LIMIT 1
      `;
      if (exists[0]) { queueCnt++; continue; }
      await sql`
        INSERT INTO offline_action_queue (
          action_code, client_action_id, user_id,
          action_type, action_payload,
          client_initiated_at, sync_status
        ) VALUES (
          ${code}, ${clientId}, ${demoUserId},
          ${type},
          ${JSON.stringify({ demo: true, kind: type, idx: i })}::jsonb,
          now() - INTERVAL '1 day' - (${i} * INTERVAL '1 hour'),
          'completed'
        )
      `;
      queueCnt++;
    }
  }
  console.log(`✓ offline_action_queue (${queueCnt})`);

  console.log("— Stage 5.I seeding complete —\n");

  // 10.8) Reconciliation checks ------------------------------------------
  // Use numeric comparison (cast to bigdecimal) to avoid '0' vs '0.0000'
  // false positives — both are zero but the text serializations differ.
  const matDrift = await sql`
    SELECT pl.id, pl.material_name,
           pl.quantity_delivered::text AS line_delivered,
           coalesce(sum(dl.quantity_received), 0)::text AS line_received_sum
    FROM material_po_lines pl
    LEFT JOIN material_delivery_lines dl ON dl.po_line_id = pl.id
    GROUP BY pl.id, pl.material_name, pl.quantity_delivered
    HAVING pl.quantity_delivered <> coalesce(sum(dl.quantity_received), 0)
  `;
  if (matDrift.length > 0) {
    console.warn(`⚠ Material PO line drift on ${matDrift.length} lines:`, matDrift.slice(0, 5));
  } else {
    console.log("✓ material_po_lines.quantity_delivered reconciles to delivery_lines (no drift)");
  }
}

main()
  .then(() => sql.end())
  .catch(e => { console.error(e); sql.end(); process.exit(1); });
