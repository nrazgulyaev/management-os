# Perf — unstable_cache candidates (plan, not applied) — 2026-06

The perf phase identified these 15 hot, per-org, SAFE-to-cache read aggregates. **NOT applied** — `unstable_cache` cannot serialize bigint (cache raw `::text` rows) and org must be resolved OUTSIDE the cache callback (cookies banned inside) + passed as a key-part. Reference: the already-cached `getPortfolioMetrics`. Greenlight the ones you want and I'll wire them carefully with explicit revalidation.

## getOperationalHealthTiles
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/dashboard/dashboard-cabinet-queries.ts
- Why safe: Hot: rendered on /dashboard Overview (page.tsx:124). Per-org owner_stay_requests COUNT + delegates to getOperationsKpis (4 COUNT subqueries incl. villa→project IN-subqueries for tickets/service). orgId from requireOrgId() (cookies) — safe key. Open-ticket / pending-request counts change a few times/hour, not per-request. Sibling getPortfolioMetrics in the SAME file is already cached this exact way.
- Recommendation: Resolve orgId = await requireOrgId().catch(()=>null) FIRST (already done). Wrap the owner_stay_requests COUNT db.execute in unstable_cache(async()=>{ const db=getDb(); if(!db) return null; const rows=await db.execute<{pending:string}>(sql`...organization_id = ${orgId}`); return rowsOf<{pending:string}>(rows)[0] ?? null; }, ['dash','ops-health-pending', orgId], { revalidate: 60 })(). Keep getOperationsKpis() call outside (cache it separately, see next row). Parse Number(pending) AFTER the cache. Cached payload is {pending:string} — no bigint.

## getOperationsKpis
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/operations/operations-cabinet-queries.ts
- Why safe: Hot: /dashboard/operations (page.tsx:99) AND reused inside getOperationalHealthTiles, so caching it fixes two pages. Single round-trip but 4 COUNT subqueries, two with villa IN (SELECT id FROM villas WHERE project_id IN (SELECT ...)) nested scans. orgId via requireOrgId(). Counts of today's turnovers/arrivals/open tickets are inherently 'trail by 60s is fine'.
- Recommendation: orgId already resolved before the query. Wrap just the db.execute returning {turnovers,arrivals,tickets_open,service_open} (all ::text) in unstable_cache(async()=>rowsOf<...>(await db.execute(sql`...${orgId}...`))[0] ?? null, ['ops','kpis', orgId], { revalidate: 60 })(). Build the OperationsKpis object (Number(...) coercions, the always-0 preventiveDue/housekeepingTasks) outside. No bigint in the row.

## getVillaStatusBoard
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/operations/operations-cabinet-queries.ts
- Why safe: Hot: /dashboard/operations status tiles (page.tsx:100). Per-villa EXISTS(active booking) correlated subquery over all org villas + project-scoped filter — O(villas) booking lookups. orgId via requireOrgId(). Villa occupancy state changes at check-in/out granularity, comfortably cacheable for 60s.
- Recommendation: Resolve orgId via requireOrgId() above the cache (it currently does requireOrgId() without catch — keep that, or .catch(()=>null) and early-return []). Wrap the db.execute returning {id,unit_code,status,has_active_booking} (all text/text-bool) in unstable_cache(..., ['ops','villa-status-board', orgId], { revalidate: 60 })(). Do the state-derivation switch (ready/occupied/cleaning/...) on the cached rows outside. No bigint.

## getFinanceKpis
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/finance/finance-cabinet-queries.ts
- Why safe: Hot: /dashboard/finance (page.tsx:201). Heavy: COUNT(DISTINCT (owner_id,villa_id)) over bookings⋈ownership_shares + a SUM(gross_amount) MTD, both org-scoped (organization_id on bookings AND ownership_shares). Money roll-up that changes when bookings land — minutes-fresh is fine. Classic 'expensive + changes infrequently' KPI band.
- Recommendation: Add orgId = await requireOrgId() ABOVE the cache (already resolved at line 61). Wrap the db.execute returning {pending_statements,revenue_mtd} (both ::text) in unstable_cache(async()=>rowsOf<{pending_statements:string;revenue_mtd:string}>(await db.execute(sql`...${orgId}...`))[0] ?? null, ['finance','kpis', orgId], { revalidate: 120 })(). Keep the netMtdUsd arithmetic and usdToIdrMinor() (→bigint) OUTSIDE — the cached row has zero bigint.

## getManagementPnl
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/finance/management-pnl-queries.ts
- Why safe: Hot: /dashboard/finance/management-pnl (page.tsx:56). TWO heavy org-scoped aggregates — statement_lines⋈owner_statements SUM(ABS(amount_minor)) for commission, and expense_lines with 4 LEFT JOINs (villas→projects, projects, payroll_runs, staff) + COALESCE org-resolution + GROUP BY for the cost breakdown. Period-scoped historical data is effectively immutable once a month closes; strong cache target. Key MUST include periodMonth (a closed month never changes).
- Recommendation: orgId = await requireOrgId() above the cache (line 121). Wrap BOTH db.execute calls (commissionRows {total_minor,line_count}::text and costRows {label,category,source,cost_minor,line_count}::text) inside one unstable_cache(async()=>({commission: rowsOf(...)[0]??null, cost: rowsOf(...)}), ['finance','mgmt-pnl', orgId, periodMonth], { revalidate: 300 })(). Do the BigInt(total_minor) reduce, netMargin and marginPct maths on the cached strings outside. cost_minor/total_minor are ::text → serializable.

## listManagementPnlPeriods
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/finance/management-pnl-queries.ts
- Why safe: Hot: same page (page.tsx:53), runs before getManagementPnl to build the period picker. Heavy: DISTINCT over owner_statements UNION DISTINCT date_trunc over expense_lines with 4 LEFT JOINs + org COALESCE. Returns plain string[] (no bigint at all). The set of months-with-data changes ~once/month.
- Recommendation: orgId = await requireOrgId() above the cache (line 69). Wrap the single db.execute returning {period_month:string}[] in unstable_cache(async()=>rowsOf<{period_month:string}>(await db.execute(sql`...${orgId}...`)).map(r=>r.period_month), ['finance','mgmt-pnl-periods', orgId], { revalidate: 300 })(). Trivially safe — output is already string[].

## getAiHubKpis
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/ai-agents/ai-hub-cabinet-queries.ts
- Why safe: Hot: /dashboard/ai (page.tsx:86). VERY heavy: one query with 5 correlated scalar subqueries, each a UNION/UNION ALL across agent_runs AND agent_invocation_log over a rolling 30-day window, plus a platform_agent_configs⋈org_agent_subscriptions liveness UNION. All org-scoped via requireOrgId(). Spend/run counts are dashboard glanceable numbers — 60s staleness is invisible.
- Recommendation: orgId = await requireOrgId() above the cache (line 313). Wrap the big 5-subquery db.execute returning {agents_live,runs_30d,avg_latency,token_spend_mtd,refusals_30d} (all ::text/AVG-text) in unstable_cache(async()=>rowsOf<...>(await db.execute(sql`...${orgId}...`))[0] ?? null, ['ai','hub-kpis', orgId], { revalidate: 60 })(). Compute tokenSpendMtdUsdMinor = BigInt(r.token_spend_mtd) and the agentsTotal/avgLatencyMs coercions OUTSIDE the cache — token_spend_mtd is cast to ::text so the cached row is bigint-free.

## listAgentsForCabinet
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/ai-agents/ai-hub-cabinet-queries.ts
- Why safe: Hot: /dashboard/ai (page.tsx:85) and /dashboard/ai/[agentCode] (page.tsx:118). TWO org-scoped round-trips (org_ai_agent_config + platform_agent_configs⋈org_agent_subscriptions) merged in JS against a static registry. No bigint anywhere (booleans/strings only). Agent config/subscription state changes rarely (operator toggles), so a 60-120s cache is very safe.
- Recommendation: orgId = await requireOrgId() above the cache (line 136). Wrap the two db.execute reads inside one unstable_cache(async()=>({legacy: rowsOf<...>(await db.execute(legacySql)), platform: rowsOf<...>(await db.execute(platformSql))}), ['ai','agents-cabinet', orgId], { revalidate: 120 })(). Keep the MGMT_AGENT_REGISTRY merge/Map-building logic outside. Payload is plain strings/booleans.

## getAttentionFeed
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/dashboard/attention-feed.ts
- Why safe: Hot: cross-cabinet feed on /dashboard Overview. Fans out 5 org-scoped source queries (statements, sla_breaches, owner_stay_requests, channel conflicts, capital_calls) via bounded mapPool — the single most multi-table read on the page. Output AttentionItem[] is all strings (no bigint). It already has a 3s per-source deadline; a 60s cache removes the fan-out from the steady-state render entirely.
- Recommendation: This fn currently resolves orgId per-source INSIDE each normaliser. To cache at the top level: hoist orgId = await requireOrgId() into getAttentionFeed, pass it down as an arg to each source fn (so the cache callback never touches cookies), then wrap the mapPool fan-out result in unstable_cache(async()=>{ const groups = await mapPool([...], 3, src=>safeSource(()=>src(orgId))); return groups.flat(); }, ['dash','attention-feed', orgId], { revalidate: 60 })(). Do the severity sort + counts on the cached AttentionItem[] outside. NOTE: AttentionItem has no bigint (capital_call total is rendered as a string), so it serializes; if any source is ever changed to carry bigint, cast to ::text first.

## getActiveProjectsRollup
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/lib/development/server/cabinets/dev-overview-queries.ts
- Why safe: Hot: /development-os Command Center. projects⋈villas COUNT GROUP BY, org-scoped via requireOrgId(). villaCount per project changes on the order of days; pure counts/strings (no bigint). Good low-risk dev-side roll-up.
- Recommendation: orgId = await requireOrgId() above the cache (line 27). Wrap the db.execute returning {id,project_code,name,status,management_status,villa_count(::text)} in unstable_cache(async()=>rowsOf<...>(await db.execute(sql`...${orgId}...`)), ['dev','active-projects-rollup', orgId], { revalidate: 120 })(). Do Number(villa_count) mapping outside. No bigint.

## getTeamRoster
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/lib/development/server/cabinets/dev-overview-queries.ts
- Why safe: Hot: /development-os Command Center roster band. app_users⋈user_roles⋈roles GROUP BY MIN(role) org-scoped. The team roster is one of the slowest-changing datasets in the app (changes when staff are added/removed). Strings only.
- Recommendation: orgId = await requireOrgId() above the cache (line 80). Wrap the db.execute returning {id,full_name,email,role_key} in unstable_cache(async()=>rowsOf<...>(await db.execute(sql`...${orgId}...`)), ['dev','team-roster', orgId], { revalidate: 300 })(). Build initials/primaryRole mapping outside. No bigint — safe.

## getInvestorDashboard
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/investor-portal/investor-portal-queries.ts
- Why safe: Hot: rendered on FOUR investor-portal pages (page.tsx:39, dashboard/page.tsx, q4-brief/page.tsx, +). The single heaviest read in the portal: 4 CTEs (my_commitments, project_totals, latest_nav DISTINCT ON, my_distributions) feeding 6 scalar SUM/COUNT/AVG subqueries. Per-investor key is already the function ARG (ctx.investorId, resolved from session by the page OUTSIDE this fn), so it satisfies the 'resolve identity outside, pass as key-part' rule cleanly. Capital/NAV/distribution totals change at most quarterly.
- Recommendation: investorId is already a plain string param. Wrap the single db.execute returning {total_committed,total_drawn,total_distributed,current_nav,projects_count,avg_profit_share} (ALL ::text) in unstable_cache(async()=>{ const db=getDb(); if(!db) return null; return rowsOf<...>(await db.execute(sql`...${investorId}...`))[0] ?? null; }, ['investor','dashboard-kpis', investorId], { revalidate: 300 })(). Keep the empty-DB fallback and all BigInt(r.total_committed) conversions OUTSIDE — every money column is ::text so the cached row carries no bigint. (Add the `import { unstable_cache } from 'next/cache'` this file currently lacks.)

## getOwnerDashboardKpis
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/owner-portal/owner-portal-queries.ts
- Why safe: Hot: owner portal home KPIs (latest net, 30-day occupancy, ADR, channel mix). Two round-trips: latest-statement lookup + a my_villas CTE / last30 CTE with channel-class CASE aggregation over the owner's bookings. ownerId is a plain function ARG resolved from session by the page (owner.ownerId) — outside the fn — so it's the correct per-tenant key-part. KPIs are MTD/rolling-30d roll-ups, fine to trail by a couple minutes.
- Recommendation: ownerId already a string param. Wrap BOTH reads inside one unstable_cache(async()=>{ const db=getDb(); if(!db) return null; const ls = rowsOf<...>(await db.execute(latestStmtSql))[0] ?? null; const ops = rowsOf<...>(await db.execute(opsSql))[0] ?? null; return { ls, ops }; }, ['owner','dashboard-kpis', ownerId], { revalidate: 120 })(). All cached columns are ::text (period_month, net_*_minor, nights, revenue, units). Do every BigInt(...) / idrMinorToUsdMinor / occupancy & ADR computation OUTSIDE on the cached strings. (Add unstable_cache import — file currently has none.)

## listMyVillas
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/features/owner-portal/owner-portal-queries.ts
- Why safe: Hot: imported in owner/layout.tsx:38 (renders on EVERY owner-portal page via the layout) and owner/villas/page.tsx. ownership_shares⋈villas⋈projects with an MTD bookings CTE (SUM gross + nights per villa). Because it's in the layout it runs on every owner navigation — high call frequency, MTD aggregate that barely moves intraday. ownerId is the function ARG (resolved outside).
- Recommendation: ownerId already a string param. Wrap the single db.execute returning the villa rows (share_percent, mtd_*::text, bedrooms) in unstable_cache(async()=>{ const db=getDb(); if(!db) return []; return rowsOf<...>(await db.execute(sql`...${ownerId}::uuid...`)); }, ['owner','my-villas', ownerId], { revalidate: 120 })(). Keep the dayOfMonth occupancy/ADR maths and BigInt(...) conversions OUTSIDE. Every aggregate column is COALESCE(...::text) so the cached payload is bigint-free. (Add unstable_cache import.)

## loadCfoCabinet
- File: /Users/nikitarazgulaev/Projects/arconique-management/src/lib/development/server/cabinets/cfo-cabinet-queries.ts
- Why safe: Hot: /development-os CFO cabinet apex. Runs ~6 SEQUENTIAL round-trips (executive_metrics_snapshots, dev_transactions, agent_outputs ×3, dev_invoices COUNT) — the most chatty single loader on the dev side. Money fields are read as Number(...) not bigint, and all SQL casts to ::text. RANKED LOWEST + CAVEAT: these snapshot/transaction tables have NO org filter in the SQL today (single-tenant), so use a STATIC key now, but it MUST gain an orgId key-part (requireOrgId resolved outside) the instant those tables get organization_id, or it would cross-tenant leak. requireOrgId is imported but the SQL doesn't yet scope by it.
- Recommendation: Wrap the whole sequence in unstable_cache(async()=>{ /* the 6 db.execute calls, returning rowsOf<...> arrays of ::text rows */ return { snapRows, txRows, taxRows, qsRow, pendingRow, invRow }; }, ['dev','cfo-cabinet'], { revalidate: 120 })(), then do rowToSnapshot/Number() mapping outside. As soon as org columns land: resolve orgId = await requireOrgId() ABOVE the cache, add it to the SQL WHEREs AND to the key array ['dev','cfo-cabinet', orgId]. No bigint in the payload (all ::text / numeric-as-text).

