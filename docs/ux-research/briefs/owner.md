# Owner / Investor brief — Stage 10.J

**Status:** draft (interviews pending)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** 10.J Owner Confidence Dashboard
**Existing surfaces (codebase):**
- Investor portal route group: `src/app/(investor-portal)/investor-portal/`
  - `/investor-portal/dashboard`, `/commitments`, `/distributions`, `/requests`, `/documents`, `/profile`, `/forecasts`, `/login`
- Operator-side: `/development-os/investors`, `/development-os/commitments`, `/development-os/distributions`, `/development-os/investor-requests`
- `/development-os/reports/investor-capital-timeline`
- Server actions: `src/lib/development/server/investors/*`, `src/lib/development/server/commitments/*`, `src/lib/development/server/distributions/*`

---

## 1. Who is this person?

- **Title variants:** Owner, Investor, LP (limited partner), Capital Partner
- **Tenure / skill profile:** sophistication varies wildly — small (1 villa, $50-200k), medium (3-5 villas, $1-5M), institutional family-office ($10M+); financial literacy mostly high; legal/regulatory varies
- **Device profile:** desktop primary for review; phone for status checks + signing
- **Working context:** outside the company, at home or office; treats Arconique as a "is my money OK?" check
- **Volume:** logs in 1-4x/month at steady state; 10x/month around capital calls + distributions
- **Reports to:** themselves / spouse / family-office partner. May share access with accountant / lawyer.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **Position-at-a-glance** — "is my money safe and growing?" — currently PDF reports + email memos
2. **Distribution + capital call review** — when, how much, signed/paid status — currently email back-and-forth
3. **Document access** — investor agreement, K-1 / tax docs, distribution memos — currently shared Drive folder

## 3. Friction (verbatim from interviews — TBD)

> "{quote}" — placeholder

Pattern hypothesis: existing investor portal is a list of pages (commitments, distributions, requests). What the investor wants is one **confidence dashboard** that says "you committed $X, paid $Y of it, received $Z back, projected $W" — and lets them drill into any piece.

## 4. Refusal points (hypothesis — verify in interviews)

- A portal that requires a separate password (must support OAuth + 2FA)
- Numbers that don't tie to the operator's GL (loss of trust = refund request)
- Any download that's behind login + login + login
- Forecasts that look like marketing (must be auditable)

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/owner.md` (research complete):
- **Pattern A** (Juniper Square / AppFolio) — position dashboard with status: Committed / Funded / Returned / Unfunded, plus IRR/MOIC live
- **Pattern B** (Juniper Square Treasury) — capital call + distribution timeline with sign/pay buttons inline
- **Pattern C** — document room with version history + signed-receipt audit trail

Anti-patterns:
- "PDF folder with login" — must be position-first
- Forecast without methodology disclosure
- Static IRR (must show as-of date + recompute on demand)

## 6. Proposed flow (sketch — fill from interviews)

### Flow 1: Confidence dashboard (target: answer "am I OK?" in <10 seconds)

```
/investor-portal/dashboard → 
  Top hero card: 
    Committed: $1.2M | Funded: $800k | Returned: $250k | Net: -$550k
    Projected total return: $1.8M | IRR: 14.2% (as of 2026-05-08)
  
  Below: 
    Capital call activity timeline (signed checkmarks + dates)
    Distribution timeline (paid checkmarks + dates)
    Next event: "Capital call C-3 expected June 1, est. $100k"
  
  Right rail: 
    Documents requiring signature: 0
    New distribution memos: 1 (NEW badge)
    Operator messages: 0
```

### Flow 2: Capital call sign + pay

```
Notification → opens capital-call detail
  Amount, due date, wire instructions, signed-by-operator memo
  [Review documents] → side-by-side
  [E-sign] → DocuSign-equiv flow (or operator-approved alternative)
  [Mark wire sent] (optional, for self-tracking) → reflects in operator-side commitments
```

### Flow 3: Document room with audit

```
/investor-portal/documents → 
  Categories: Agreements / K-1 + tax / Distribution memos / Capital call memos / Quarterly updates
  Each doc: filename, version, signed?, date
  Click → preview + download + sign-receipt log
```

## 7. Acceptance criteria (consumed by Stage 10.J)

- [ ] Investor sees position summary in <10 seconds from login (cached + ≤2 server calls)
- [ ] All KPIs (Committed / Funded / Returned / IRR / MOIC) tie to the operator GL within $1
- [ ] Capital call sign + payment-record loop closes operator-side state in <30 seconds
- [ ] Document room supports audit (who downloaded what, when)
- [ ] Forecast methodology disclosed inline (not in a hidden footnote) — IRR formula + assumptions
- [ ] Mobile parity for the dashboard view (read + sign; write actions can defer to desktop)

## 8. Out of scope for Stage 10

- Self-service secondary sales / transfer requests — Stage 11+
- Tax K-1 generation engine (operator-side, separate flow)
- Auto-generated investor narrative ("we beat plan because…") — Stage 11 AI candidate
- Multi-fund / cross-vehicle aggregation (single-fund for now)

## 9. Open questions

- How institutional do we expect investors to be? Affects compliance + audit features.
- Do investors expect daily pricing, or quarterly reporting cadence?
- Is e-signature a hard-block for some investors (e.g., regulated entities require ink)?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/owner.md`
- Interview synthesis: `docs/ux-research/interviews/owner/synthesis.md` (pending — sample 3-5; mix small/medium/institutional)
