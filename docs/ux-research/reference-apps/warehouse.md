# Warehouse manager reference apps

Role context: warehouse manager tracking villa-construction materials (cement, tiles, fixtures, FF&E) plus operations consumables (linens, toiletries, F&B). Daily flow: receives deliveries, picks for site/villa transfers, moves stock between locations (central warehouse, villa, in-transit). Mobile barcode scanning is the dominant input. Catalog size: 100-500 SKUs.

## Sortly

### Positioning
Mobile-first visual inventory app aimed at small teams who track physical assets across multiple sites without needing full ERP/WMS depth. Strong with photo-led item cards, custom fields, and QR/barcode workflows that a non-technical operator can run from a phone within an hour of onboarding. Used heavily in field service, construction trailers, and small distributed warehouses where the "system of record" needs to be the phone in the field, not a desktop terminal.

### Top 3 patterns
1. **Photo-first item cards with nested folders.** Each SKU shows a real photo as the primary identifier, not a SKU code. Items live inside folders that mirror physical locations (Warehouse > Bali Villa A > Pool House). For a Bali warehouse manager whose staff may not read English fluently and who is moving cement bags vs. teak panels vs. linens, the photo-as-primary-key removes a whole class of mis-picks.
2. **In-app QR/barcode label generation and printing.** Sortly generates QR labels for items the manager doesn't already have a SKU/barcode for - e.g. a custom-cut marble slab or a bundle of imported fixtures. The same scan flow handles both supplier barcodes and Sortly-generated QR. Eliminates the "we have no barcode for this" gap that breaks most warehouse rollouts.
3. **Low-stock and date-based alerts.** Per-item min-quantity thresholds plus expiry/service-date alerts on a single dashboard. For consumables (toiletries, F&B, chemicals with shelf life) and for villa-construction items with delivery lead times, the alert center becomes the manager's morning queue.

### Pricing
Free, Advanced ~$24/mo, Ultra ~$74/mo, Premium ~$149/mo, Enterprise custom (annual billing; monthly is higher). Barcode/QR scanning is on paid tiers; multi-user collaboration starts at Ultra.

### Why useful for Arconique
Sortly is the closest reference for the "phone is the warehouse" reality of a Bali ops site - intermittent wifi, mixed-literacy staff, no dedicated WMS hardware. The folder-as-location model maps directly to Arconique's villa hierarchy. Steal the photo-first card, the in-app QR label print, and the alert dashboard pattern.

## Fishbowl

### Positioning
Mid-market, on-prem-or-hosted inventory and warehouse system aimed at manufacturers and distributors who have outgrown spreadsheets but cannot justify a Tier-1 ERP. Strong on multi-location stock, BOMs, cycle counts, and a separate mobile companion (Fishbowl Drive / Fishbowl Go) for the warehouse floor. Tightly coupled to QuickBooks/Xero, which is how most of its mid-market customers do accounting.

### Top 3 patterns
1. **Dedicated mobile warehouse app split from the desktop console.** Fishbowl Drive/Go is a separate scanner-first app that does only Receive, Pick, Pack, Transfer, Cycle Count - not the whole desktop UI shoehorned onto a phone. Each screen is one job, large tap targets, and works with rugged Android scanners as well as phones. This split is the right pattern for villa ops where the floor user must not see procurement or finance views.
2. **Inter-warehouse transfers as a first-class object.** Transfers have their own status lifecycle (Pending > In-Transit > Received) with partial-receive support and discrepancy capture at the destination. Mirrors exactly what happens when a Bali central warehouse ships linens or fixtures to a villa: the items are no longer "in stock" but not yet "delivered" for hours or days.
3. **Cycle counting workflow with task assignment.** Instead of a yearly full count, the manager schedules rolling cycle counts (e.g. all linens this week, all FF&E next month), assigned to specific staff, with variance reports auto-generated. Closes the gap between "system says 40 sheets" and "shelf has 28."

### Pricing
Perpetual licenses, indicative starting prices: Professional ~$4,395 single user, Warehouse ~$4,395, Manufacturing ~$6,595, additional users ~$1,195 each. Hosted/SaaS option also offered. Significant implementation cost on top.

### Why useful for Arconique
Fishbowl is the reference for "what a real warehouse module looks like" once Arconique is past 50+ SKUs and 5+ villas. The transfer-as-first-class-object pattern and the separate-mobile-app-for-floor-tasks pattern are the two patterns to copy, even though Fishbowl's pricing model and stack is wrong for an SMB SaaS.

## Cin7

### Positioning
Cloud-native inventory + light-ERP platform with two product lines: Cin7 Core (formerly DEAR) for SMBs and Cin7 Omni for larger multichannel operations. Differentiates by bundling a real WMS app, deep ecommerce/3PL integrations, and B2B portals into one stack. Treats inventory as a multi-channel, multi-location problem from day one rather than a single-warehouse problem.

### Top 3 patterns
1. **Cin7 Core WMS mobile app with bin-level operations.** A separate WMS app handles Pick, Pack, Receive, Put-Away, Stock Lookup, Bin Transfer - up to 1,000 lines per pick - using device camera or paired scanner. Critically, bin transfers (moving an item from "Receiving" to "Linen Closet B") are one-tap, which is what makes a Bali warehouse with 30+ physical zones tractable.
2. **Serial / batch / lot tracking attached to scan flow.** When receiving, the scanner prompts for serials or batch numbers inline. For villa construction (track which marble batch went to which villa for warranty claims) and for F&B (lot/expiry on imported wines, oils), this avoids the common failure where lot data is captured "later, in the spreadsheet."
3. **Unified product master across locations and channels.** One SKU, one master record, with stock fanned out across many warehouses and channels. The desktop view shows "200 hand towels: 80 central, 60 Villa A, 40 Villa B, 20 in transit" on one row. This is the right mental model for a portfolio operator who never wants per-villa SKU duplicates.

### Pricing
Cin7 Core: Standard ~$349/mo, Pro ~$599/mo, Advanced ~$999/mo. Cin7 Omni: custom enterprise pricing. Annual billing; integrations and add-ons billed separately.

### Why useful for Arconique
Cin7 Core is the closest "what we should look like in 18 months" reference - SaaS, multi-location native, real mobile WMS, batch/serial tracking. The unified-product-master view and the bin-transfer-as-one-tap pattern are the two highest-value patterns to adopt.

## Top 3 cross-app patterns to adopt

1. **Separate mobile "floor" app from desktop console.** All three apps split the warehouse-floor experience (scan, pick, receive, transfer) from the desktop manager experience (reports, reorder, supplier mgmt). Each floor screen is one job, large tap targets, scanner-first input. Arconique should not try to render its desktop dashboard on a phone for the warehouse staffer.
2. **Transfer as a first-class lifecycle object, not a stock adjustment.** Receive > In-Transit > Delivered with partial-receive and discrepancy capture. This is exactly the central-warehouse-to-villa flow and must not be modeled as "subtract here, add there."
3. **Item card uses photo + scannable code as primary identifiers, SKU is secondary.** Photo for human recognition (multilingual staff, similar-looking items), QR/barcode for machine speed, SKU only for finance/exports. Sortly does this most aggressively; Cin7 and Fishbowl both support it on item detail.

## Anti-patterns to avoid

- **Spreadsheet-style grid as primary mobile UI.** Fishbowl's older desktop screens and Cin7 Omni's denser views become unusable on a phone. The floor user does not want a table.
- **One SKU per location.** Duplicating "Hand Towel - Villa A" and "Hand Towel - Villa B" as separate items destroys reordering and reporting. Always one product master, stock fanned across locations.
- **Mandatory barcode on every item before go-live.** Many villa-construction items arrive without scannable codes. The system must let the manager generate and print a QR on the spot (Sortly pattern); blocking receipt until a barcode exists kills adoption.
- **Treating low-stock alerts as email-only.** Alerts must surface inside the app's home screen as a work queue, not buried in an email digest the manager will not open on a Bali site.
- **Forcing a full annual count instead of rolling cycle counts.** Full counts shut the warehouse for a day; rolling counts (Fishbowl pattern) keep the data trustworthy without halting ops.
- **Hiding in-transit stock.** If stock that has left the central warehouse but not arrived at the villa disappears from the view, the ops manager will assume it is lost. Always show in-transit as a visible bucket.
