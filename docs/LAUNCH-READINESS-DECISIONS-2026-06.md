
---

## Cron → ledger-engine convergence (the replay found 3 blockers — your call) — added 2026-06-16

The configurable ledger engine can now reproduce the formula cron (`revenue_source='bookings'` + formula tax/reserve/mgmt). A replay test (`tests/statement-cron-replay.test.ts`) compared the two engines' net on identical data — it **converges on the simple case but diverges** on three points, so the monthly cron was **NOT repointed** (it still runs `statement-generation.ts`). To flip it, decide:

1. **Expense sources.** The formula cron deducts BOTH `dev_transactions` (opex/capex/cogs) AND posted owner-chargeable `expense_lines`. The engine's `bookings` path currently deducts only `dev_transactions`. **Q: should the bookings path also pull `expense_lines`?** (If yes, I port `loadOwnerChargeableExpenseLines` into it.)
2. **Statement granularity.** The cron generates per **(owner, villa)** and rounds tax/reserve/mgmt on **each villa's** gross. The ledger engine generates per **(owner, period)** and rounds once on the **summed** gross. For a multi-villa owner these round differently (a few minor units). **Q: is per-owner-per-period the canonical granularity (one statement per owner/month) — or keep per-villa?**
3. **Rounding.** Formula uses float `Math.round`; the engine uses BigInt half-up. Identical at realistic amounts; they differ only past 2^53 minor units (astronomically large). **Q: accept BigInt half-up as canonical?** (Recommended — exact.)

Once you answer (1)–(3), the replay can be made exact and the cron flipped onto the one configurable engine. Until then both run, with the engine driving the "Issue statement" / canonical path.

### Known config foot-guns (documented, not bugs)
- `revenue_source='bookings'` yields an empty statement for a **pool-only** owner (no villa share) — only set it where owners hold villa shares. Default `ledger` is unaffected.
- Custom-deduction scope precedence resolves independently of the settings-row precedence (owner's custom rows if any, else project's, else org's) — an owner-level settings row without owner-level custom deductions still gets the project/org custom deductions.
