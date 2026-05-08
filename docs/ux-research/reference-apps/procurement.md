# Procurement reference apps

Role context: procurement manager running RFQs across 5-15 suppliers per week (concrete, fixtures, consumables). Compares quotes side-by-side, places POs, tracks delivery + invoice match. Desktop primary, mobile for on-site delivery acceptance.

## Coupa

### Positioning

Coupa is the enterprise leader in source-to-pay — the platform Fortune 500 procurement teams use to run sourcing, contracts, purchasing, expenses, and AP under one roof. It is known for breadth and AI-driven analytics across spend, with deep RFx capabilities (RFI, RFP, RFQ, plus English / Dutch / Japanese reverse auctions) and a unified "Open Buy" catalog that lets requesters price-compare across all approved suppliers in one search.

### Top 3 patterns

- **Sourcing event with structured RFQ and bid-analysis grid.** A buyer creates an RFQ, defines line items + required attributes (price, lead time, MOQ, certifications), invites suppliers; supplier responses populate a normalized bid-comparison grid. Each cell is rankable, weighted, and exportable to award decision. This is exactly the shape Arconique needs for "concrete, three vendors, factor in lead time + price + payment terms."
- **Open Buy unified search across catalogs + punchouts.** A requester searches "interior wall paint" once and sees price + availability across all approved suppliers (hosted catalogs and supplier punchouts) in one ranked list. No tab-switching. For a Bali procurement manager juggling 15 supplier portals, this collapses 30 minutes of work into 1 search.
- **Approval-chain routing with policy guardrails.** A PO over a threshold auto-routes through the approval chain defined by category + amount + entity; a PO that violates a policy (no contract on file, supplier not vetted, budget exceeded) is blocked at submit with the specific rule cited. Policy enforcement is visible, not hidden — buyers learn the rules in-flow.

### Pricing

$$$ — enterprise quote-only; deployments routinely $50-250k+/year, with implementation services on top.

### Why useful for Arconique

Coupa is the gold standard for the *RFx -> award -> PO -> match* spine. Steal the bid-analysis grid and the policy-guardrail-on-submit pattern. Do not copy the enterprise breadth; Arconique is one or two orders of magnitude smaller.

## Procurify

### Positioning

Procurify is the leading procure-to-pay platform built for mid-market and small-enterprise teams that find Coupa overbuilt. It is known for an approachable mobile-first UX, configurable approval workflows by location / department / amount, and tight integrations with QuickBooks, NetSuite, and Sage Intacct. Its core promise is "spend control that requesters actually use."

### Top 3 patterns

- **Mobile purchase request with one-tap budget check.** A requester on site (foreman, ops lead) creates a PR from phone, picks items from a saved catalog, and the form shows a live budget-remaining bar for that category before submit. If they are over budget, the PR routes to a higher approver automatically — they never get a "rejected" surprise after the fact.
- **Configurable approval workflows by location, department, amount.** Build unlimited approval chains: a fixtures PO under $1k auto-approves at site lead; over $5k routes to PM + CFO; over $20k adds the holding-co board. Arconique needs exactly this — different villas, different categories, different thresholds, all configurable without code.
- **In-app status feed + Slack / email digest of pending approvals.** Approvers see a single feed of "things waiting on me" with one-tap approve / reject / comment. Slack notifications batch into a daily digest rather than firing per-PR. Approval cycle time drops because the approver is never hunting in email.

### Pricing

$$ — quote-only; mid-market deployments typically $1-3k/mo at small scale, scaling to $15-40k/year. Per-user component.

### Why useful for Arconique

Procurify is the closest size-and-shape match for Arconique's procurement volume. Steal the mobile PR with live budget bar, the configurable per-location / per-category approval chains, and the digest-based approver UX.

## Tradogram

### Positioning

Tradogram is the SMB-friendly procurement platform with an unusually generous free tier (1 user, 10 POs/month) and clean RFQ + supplier-management features. It is known for being the easiest tool in this category to onboard — a small construction or trade business can self-serve setup in an afternoon — while still covering RFQs, POs, contracts, and approval routing.

### Top 3 patterns

- **RFQ with sealed-bid vs. open-negotiation toggle per event.** The buyer chooses up front whether suppliers can see each other's bids (open) or not (sealed). For commodity items (concrete, rebar) Arconique might run sealed; for relationship items (custom millwork) open negotiation surfaces better terms. Surfacing this as a per-event choice is a small UX detail that materially changes outcomes.
- **Supplier repository with contract + price-history attached to the vendor record.** Each supplier carries their contract terms, historical prices, lead times, and on-time-delivery score on the vendor profile. When the buyer launches a new RFQ, suggested invitees are ranked by past performance — not just by who they emailed last time.
- **PO -> goods-receipt -> invoice 3-way match with discrepancy flagging.** Receive the delivery on mobile (quantity + photo + signature), invoice arrives, system auto-matches PO + receipt + invoice and flags variance >tolerance for human review. This is the ground-truth loop Arconique needs for site deliveries; the pattern is mature and well-understood.

### Pricing

$ — Basic free (1 user, 10 POs/mo); Pro from ~$195/mo, Premium ~$375/mo, Enterprise quote-based.

### Why useful for Arconique

Tradogram is the reference for "how lean can a complete procurement loop be." Steal the sealed-vs-open RFQ toggle, the vendor-record-as-source-of-truth pattern, and the mobile goods-receipt + 3-way match.

## Top 3 cross-app patterns to adopt

1. **Side-by-side bid-comparison grid with weighted scoring.** Suppliers across columns, line items + attributes (price, lead time, MOQ, payment terms, past performance) across rows. Buyer can weight columns and see a ranked award recommendation. This is the single most-loved feature in every procurement tool.
2. **Policy-as-data approval routing.** Approval chains driven by configurable rules on category / amount / location / vendor risk — not hardcoded. Threshold violations block at submit with the rule cited inline so requesters learn the system.
3. **3-way match (PO + goods receipt + invoice) with mobile receipt capture.** The site supervisor accepts the delivery on phone with photo + signature; the invoice match happens automatically; only variances surface to a human. This is the loop that catches over-billing and short-shipments — non-negotiable for a Bali villa supply chain.

## Anti-patterns to avoid

- **RFQ flows that require buyers to email suppliers and re-key responses.** If the platform does not host the supplier response, you have a CRM, not a procurement tool. Suppliers must be able to respond in-product (or via a tokenized email link that posts to the system).
- **Approval emails with no mobile-friendly approve link.** Approvers will not log in to a desktop portal to approve a $400 PO. One-tap approve from email or Slack is non-negotiable.
- **Over-engineering the catalog for a small supplier base.** Coupa's catalog system is overkill for a procurement manager working with ~30 vendors. Arconique should start with a flat searchable item list per supplier and only add catalog complexity when justified.
- **Decoupled vendor records across modules.** A supplier's contract, RFQ history, POs, and performance score must live on one vendor profile. If procurement, AP, and PM each have their own vendor list, data drifts and trust collapses.
- **No price-history visibility at quote time.** When a supplier quotes $X for concrete, the buyer must see immediately what that supplier and their competitors charged on the last 5 orders. Otherwise every RFQ is negotiated in the dark.
