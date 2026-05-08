# Bookkeeper reference apps

Role context: villa-business bookkeeper running 4-6 hours/day of high-volume invoice/expense entry, bank reconciliation, and monthly close across a Bali villa portfolio. Volume sits at 50-200 transactions/day. The biggest frictions are: (1) repetitive coding of similar transactions across many properties, (2) keyboard-vs-mouse mismatch in data entry, (3) reconciliation review where one mis-match means digging through dozens of similar lines.

## QuickBooks Online

### Positioning
The default cloud bookkeeping platform for SMBs in the US/AU/SG markets, optimised for accountants who service many client books. Strong on bank-feed ingestion, receipt capture (mobile + email forward), and a deep ecosystem of add-ons (Dext, RightTool) that fill gaps in batch entry.

### Top 3 patterns
- **Bank feed "review" tab with three actions per row (Match / Categorize / Add).** Each imported line offers a single-click "Add" that uses the rule's saved category and class, and "Match" auto-suggests an existing invoice/bill. For Arconique this is the right primitive for villa-level expense triage: one row per bank line, one click to assign to a villa.
- **Bank rules with conditions on description / amount / direction, plus auto-add toggle.** Rules can match "contains / is exactly / doesn't contain" and the bookkeeper chooses per rule whether to auto-post or only suggest. The auto-vs-suggest dial is the key trust mechanism — copy this for villa-specific recurring charges (Pertamina, PLN, internet).
- **Receipt capture by email forward with auto-match against bank feed.** Forward a receipt to a unique inbox, OCR extracts vendor/amount/date, and QBO attempts to attach it to the matching bank-feed line. This collapses two separate jobs (receipt entry and bank match) into one passive workflow.

### Pricing
$$ — Simple Start ~$35/mo, Plus ~$99/mo, Advanced ~$235/mo (US, 2026). Accountant access is free.

### Why useful for Arconique
QBO is the reference for bank-feed-first workflows and the rules engine that an Arconique villa portfolio needs (same vendors, same coding, repeated across 5-30 villas). Its weak spot — no true bulk-match in reconciliation — is exactly what Arconique should improve on.

## Xero

### Positioning
Cloud bookkeeping platform born in NZ/AU, dominant in APAC and the natural choice for Bali villa operators. Known for the cleanest reconciliation UI in the category and a rules engine that goes further than QBO on auto-coding.

### Top 3 patterns
- **Two-pane reconciliation: bank line on the left, suggested match on the right, single big green "OK" button.** Each row is a self-contained decision: accept the suggestion, override the category, or split. Keyboard arrow + Enter walks the bookkeeper down the list at ~1 line/second once rules are dialled in — this is the speed target Arconique should benchmark against.
- **Bank rules with priority ordering and a "suggest vs auto-apply" toggle per rule.** Rules are evaluated top-down so the user puts specific rules above generic ones; new rules default to "suggest only" until trusted, then promote to auto-apply. Mirror this graduation model for Arconique's villa-coding rules so the bookkeeper builds confidence before letting the system post automatically.
- **"Find & Match" for many-to-one and one-to-many matching.** A single bank deposit can be matched against multiple invoices (and vice versa) in one screen with running totals at the bottom — critical for villa bookings where one Booking.com payout covers 6 reservations across 3 villas. Arconique must support this; QBO's lack of it is a known pain point.

### Pricing
$$ — Starter ~$29/mo, Standard ~$65/mo, Premium ~$95/mo (US, 2026). Cash-coding view is on higher tiers.

### Why useful for Arconique
Xero's reconciliation screen is the gold standard for "look at every transaction, decide fast, move on." If Arconique builds a payments/expenses review surface, copy this two-pane pattern verbatim — it is what Bali bookkeepers already know.

## Wave

### Positioning
Free-tier bookkeeping for solopreneurs and micro-businesses, monetised through payment processing and payroll. Notable for proving that you can ship a usable double-entry product with a flat IA — no settings labyrinth, no module navigation.

### Top 3 patterns
- **Single global "+" create-anything button anchored in the header.** Invoice, bill, expense, transfer, journal — all from one menu, with sensible defaults pre-filled. For a villa bookkeeper switching contexts 50+ times/day, the cognitive saving of one create surface (vs hunting in module menus) is real.
- **Mobile receipt capture as a first-class entry path, not an afterthought.** Snap photo, OCR fills vendor/amount/date, transaction posts straight to the books and waits to be matched against the bank feed. The mobile app is intentionally slim — one job, fast — which is the right shape for villa managers in the field forwarding receipts to the bookkeeper.
- **Flat top-level navigation (Sales / Purchases / Accounting / Banking / Reports), no nested settings tabs.** Every primary task is reachable in one click from any screen. Arconique's information architecture should resist the QBO/Xero tendency toward five-level deep settings — bookkeepers pay for that depth in lookup time every day.

### Pricing
Free / $ — Starter free; Pro $16/mo; receipt scanning $8-11/mo add-on (2026).

### Why useful for Arconique
Wave is the reference for "what can you cut and still ship a working ledger?" Useful as a counterweight when the team wants to add yet another configuration screen — Wave shows the floor of what a bookkeeper actually needs day-to-day.

## Top 3 cross-app patterns to adopt

1. **Bank-feed-first workflow with one-row-one-decision UI.** All three apps anchor the bookkeeper's day on an inbox of imported bank lines, each resolved in a single click. Arconique should treat the bank/payment feed (not invoices, not the chart of accounts) as the home screen for the bookkeeper role.
2. **Rules engine with graduated trust (suggest -> auto-apply).** QBO and Xero both offer per-rule control over whether matches are auto-posted or proposed. This is the trust dial that makes high-volume coding tolerable; Arconique needs it scoped to villa + category + vendor.
3. **OCR receipt capture that auto-matches the bank-feed line.** All three (QBO, Xero via Hubdoc, Wave) collapse "enter receipt" and "reconcile bank line" into one passive flow. For Bali ops where managers WhatsApp photos of warung receipts daily, a forward-to-email or photo-upload path that lands pre-matched is the highest-leverage feature.

## Anti-patterns to avoid

- **Modal-trap "wizards" for daily entry.** QBO's New Transaction modals force a full-screen takeover for each invoice or expense — fine for occasional use, terrible at 100/day. Daily-volume entry must stay inline (Excel-grid or two-pane), never a multi-step modal.
- **Hiding split/match behind a secondary screen.** QBO buries many-to-one matching, forcing workarounds; Xero exposes it inline. Any frequently-needed action (split, match-multiple, attach receipt) must be reachable without leaving the bank-feed row.
- **Settings spread across 5+ tabs with overlapping concerns.** QBO's settings tree (Account and settings + Chart of accounts + Recurring transactions + Rules + Custom form styles + Products and services) is the canonical example of how a bookkeeper loses 15 min/day to navigation. Keep config flat and searchable.
- **>5 clicks for a daily action.** Recording a single villa expense in QBO can take 6-8 clicks (New -> Expense -> Payee -> Account -> Category -> Class -> Save). Arconique should hard-cap daily actions at 3 clicks / 3 keystrokes from the bank-feed row.
- **No keyboard navigation through review queues.** All three apps lean mouse-heavy. A bookkeeper doing 200 transactions/day needs Tab-to-next-field, Enter-to-confirm, and arrow keys down the queue — Arconique can win on speed alone if it ships true keyboard-first review.
