# Arconique Management OS — Product Specification

**Domain:** `management.arconique.com`
**Document owner:** Product / CTO
**Status:** v0 Blueprint
**Last revised:** 2026-04-24

---

## 1. Product Vision

Arconique Management OS is the operating system behind every premium villa Arconique builds and manages in Bali. It is not a PMS. It is not a property-management SaaS. It is a **vertical operating platform** purpose-built to run a luxury villa company end-to-end:

- Investors see their money work, transparently, the way a family office sees a private fund.
- Owners see every night booked, every rupiah spent, every reserve funded, every payout calculated.
- Operations staff run daily turnovers, maintenance, procurement, and inspections on a fast mobile interface designed for Bali field conditions (humidity, intermittent connectivity, shared devices).
- Guests receive a stay experience that feels like a boutique hotel app, not an Airbnb checkout screen.
- Executives see the entire portfolio — Eternal Villas, Enso Villas, Ahau Gardens, and future projects — as one living asset.

The product must feel like **a mix of a luxury hospitality brand, a family-office reporting portal, and a modern operating system**, not a generic SaaS.

### Mission statement
Give luxury villa investors the clarity of a public REIT, give villa owners the confidence of a private banker, give staff the calm of a well-designed tool, and give guests the elegance of a five-star concierge — all in one permissioned platform.

### One-sentence positioning
*Arconique Management OS is the investor-grade operating system for premium villa portfolios.*

---

## 2. Problem Statement

Villa management in Bali is fragmented across WhatsApp groups, spreadsheets, hand-written turnover lists, OTA extranets, and opaque monthly PDFs. Investors receive inconsistent reports. Owners do not trust the numbers. Managers cannot prove operational quality. Guests receive inconsistent handovers. Most software on the market is either:

- **Built for hotels** (Opera, Mews) — too heavy and not multi-owner-aware.
- **Built for short-term rentals** (Hostaway, Guesty) — excellent channel management, weak investor reporting, no owner statement engine, no pooled-profit models, no reserve-fund accounting, no Bali-specific tax logic.
- **Built for property management** (AppFolio, Buildium) — US/EU real-estate bias, no hospitality logic.

No product treats a villa complex as **an asset with multiple owners, pooled yield, individual P&L, hospitality operations, and investor transparency** simultaneously. Arconique Management OS is built for exactly that.

---

## 3. Target Users (Personas)

The platform serves five surfaces with one shared data core.

### 3.1 Internal operator users (Admin Dashboard)

| Persona | Primary job | Device | Key pains today | Key wins |
|---|---|---|---|---|
| **Super Admin** | System custodian, access, integrations | Desktop | Provisioning, audit, compliance | Single control plane |
| **Director / Company Owner** | Portfolio P&L, strategy, investor trust | Desktop + mobile | No single source of truth | Live portfolio view |
| **Operations Manager** | Runs the daily machine across projects | Desktop + tablet | WhatsApp firefighting | Task board, SLAs |
| **Property Manager** | Owns a specific project or cluster | Desktop + mobile | Juggling 15 villas | One villa board |
| **Accountant / Finance Manager** | Monthly close, statements, taxes | Desktop | Manual Excel close | Automated close engine |
| **Concierge / Guest Relations** | Pre-arrival, in-stay, upsell | Desktop + mobile | Scattered inboxes | Unified inbox + AI |
| **Housekeeping Supervisor** | Turnover quality, photo approval | Mobile-first | Paper checklists | Photo-verified checklists |
| **Housekeeper / Cleaner** | Cleaning tasks, linen counts | Mobile only | Language + device issues | Icon-first UI, offline queue |
| **Technician / Maintenance** | Repairs, preventive ops | Mobile only | Ticket chaos | SLA ticket flow |
| **Procurement Manager** | Suppliers, PO, receipts | Desktop + mobile | No approval trail | PO + receipt flow |
| **Security** | Gate, access logs, cameras | Tablet at gate | Paper log books | Digital gate log |

### 3.2 External owner / investor users (Owner Portal)

| Persona | Needs | Emotional driver |
|---|---|---|
| **Individual villa owner** | Monthly statement, trust | "Is my villa being run well?" |
| **Pooled-model investor** | Portfolio yield, ROI | "Is the pool performing as promised?" |
| **Hybrid owner** | Own-villa P&L + pool share | "What's mine, what's shared?" |
| **Family office / LP** | Documents, audit trail, approvals | "Is this investable at scale?" |
| **Agent / Broker** | Pipeline, commissions | "Did I get paid for my referral?" |

### 3.3 Guest users (Guest Portal)

| Persona | Needs |
|---|---|
| **Leisure guest** | Smooth arrival, villa guide, upsells |
| **Long-stay guest / resident** | Service requests, monthly billing |
| **Owner-stay (owner using own villa)** | Free stay tracking, housekeeping |

### 3.4 External vendors (Supplier mini-portal — v5+)
Suppliers of linen, F&B, repairs, landscaping — minimal portal for PO acceptance and delivery confirmation.

---

## 4. Business Goals

Product success is measured against operator P&L and investor trust — not vanity SaaS metrics.

### Year-1 goals (from v1 launch)
1. **Investor NPS ≥ 60** — investors feel the reporting is "better than my bank".
2. **Monthly close ≤ 3 business days** after month-end (today: 10–15 days).
3. **Owner statement dispute rate < 2%** (today: ~20% of statements contested).
4. **Operational staff time saved ≥ 20%** via mobile checklists and auto-assignments.
5. **Zero data breaches**; full RLS in production.
6. **Support all three current projects** (Eternal Villas, Enso Villas, Ahau Gardens) in production.

### Long-term strategic goals
- Onboard **external third-party villa owners** not originally developed by Arconique, turning the platform into a revenue line of its own.
- Earn the right to say *"Managed on Arconique OS"* as a trust seal on villa listings.
- Build proprietary AI dataset of Bali hospitality operations, defensible over 3–5 years.

---

## 5. Product Principles

These principles are binding. They override convenience and schedule.

1. **Transparency over spin.** Every number shown to an owner or investor must be derivable from raw transactions on demand. No rounded-up summaries. No "trust us" reports.
2. **Permission-aware by default.** A query that cannot justify data access at the row level is not written. RLS is not an afterthought.
3. **Calm software.** No red-badge-everywhere dashboards. Status is conveyed through typography, spacing, and subtle motion — not alarm.
4. **Field-realistic mobile.** Staff flows must work on a 2-bar 4G connection under a humid roof. Offline queue is a feature, not a polish item.
5. **Investor-grade polish.** Every owner-facing surface should look like it belongs next to a JPMorgan private-wealth statement.
6. **AI that quotes, never invents.** AI assistants retrieve and cite. If data is missing, the assistant says so. Hallucinating a number on a villa statement is a trust-breaking incident.
7. **Bali-aware.** Rupiah, PPN, PHR (local hospitality tax), IMTA staff docs, LKPM reporting, Ramadan pricing, Nyepi closures — first-class, not localized-later.
8. **One data model, five surfaces.** Public site, admin, owner, guest, staff — all powered by the same canonical schema. No forked truth.
9. **Auditability is a feature.** Every financial write creates an immutable audit event with actor, reason, and timestamp.
10. **No cheap feelings.** No stock icons, no default shadcn blue, no rainbow charts, no SaaS bro gradients. Design is our marketing.

---

## 6. Product Scope — Modules Overview

The platform is organized as one monolithic app with **five surfaces** sharing one backend and one design system.

### 6.1 Public Website (marketing surface) — `management.arconique.com`
Editorial, calm, investment-grade. Converts three audiences: **new investors, existing owners, third-party villa owners considering management**. Pages: Home, Villa Management, Owner Portal, Investor Reporting, Guest Experience, Operations Technology, Portfolio, Case Studies, Contact / Apply.

### 6.2 Admin Dashboard — `/app/*`
The full operator control plane. Major module groups:

1. **Portfolio & Assets**
   - Portfolio Overview, Projects, Villas, Units, Rooms, Amenities, Photos, Documents
2. **Ownership & Investors**
   - Owners, Investor Profiles, Ownership Shares, Pool participation, KYC documents, Approvals
3. **Revenue & Bookings**
   - Bookings, Guests, Channels (Airbnb, Booking.com, Direct, Agoda, Expedia, Agent), Nightly rates, Cleaning fees, Upsells, Refunds, Chargebacks
4. **Finance**
   - Revenue ledger, Expense ledger, Taxes (PPN, PHR, withholding), Fees (OTA, payment, bank, FX), Reserve Funds (renovation, depreciation/FF&E), Payouts, Owner Statements, Bank accounts, Reconciliation
5. **Operations**
   - Villa Status Board, Housekeeping, Maintenance, Preventive Maintenance, Staff Tasks, Damage Reports, Lost & Found, Guest Complaints, Staff Performance
6. **Inventory & Procurement**
   - Inventory catalog, Stock levels, Warehouse & villa locations, Stock movements, Minimum-stock alerts, Write-offs, Purchase Requests, Purchase Orders, Suppliers, Receipts
7. **Access & Security**
   - Smart Access (lock codes, card codes, physical keys), Access Logs, Cameras, Camera Access Permissions, Camera Audit Logs
8. **CRM & Communication**
   - CRM / Leads, Messages / Unified Inbox (WhatsApp, email, SMS, Telegram, Instagram DMs), Templates, Campaigns (v6+)
9. **Reporting**
   - Scheduled Reports, Ad-hoc Reports, PDF exports, Dashboards, KPIs (occupancy, ADR, RevPAR, MIR, GOP)
10. **AI Assistants**
    - Eight assistants (see AI spec), each with its own UI surface but sharing one retrieval layer
11. **System**
    - Users, Roles, Permissions, Settings, Integrations, API keys, Webhooks, Audit Logs, Billing of the OS itself

### 6.3 Owner / Investor Portal — `/owner/*`
An editorial, calm surface for owners and investors. Not an admin-lite. It looks and feels like a private wealth statement. Modules: Portfolio dashboard, Owned villas / shares, Pooled profit participation, Bookings (read-only), Monthly P&L breakdown, Fees, Taxes, Utilities, Maintenance, Reserves, Net payout, ROI / IRR / annualized yield, Documents vault, Statements archive, Large-expense approvals, AI Investor Assistant.

### 6.4 Guest Portal — `/stay/[token]`
Tokenized per-booking page. No login required; signed, time-boxed URL sent on booking confirmation. Modules: Stay overview, Check-in instructions, Smart-lock code (released T-24h), Wi-Fi, Villa guide (PDF + in-page), House rules, Service requests, Concierge chat (AI + WhatsApp handoff), Upsells (transfer, massage, private chef, extra cleaning, laundry, scooter, driver, breakfast), Review request post-checkout.

### 6.5 Staff Mobile Portal — `/field/*`
PWA-first, installable, offline-queue-ready. Optimized for low-end Android devices. Modules: Today's tasks, Housekeeping checklist (with photo upload), Maintenance checklist, Preventive inspections, Damage report, Inventory use, Purchase request, Task completion + supervisor approval. Mandatory bilingual support (EN / ID).

---

## 7. Financial Model (Product-level)

This is the canonical money model the product must express. Details in `DATABASE_SCHEMA.md`.

### 7.1 Ownership models supported simultaneously
1. **Individual** — owner owns a specific villa, receives its P&L net of fees.
2. **Pooled** — owner holds shares in a project-level pool; receives share of pooled net profit.
3. **Hybrid** — the canonical Arconique case. Villa-specific revenue and expenses belong to the villa owner; shared complex costs (security, landscaping, common area power, GM salary allocation) are distributed across the pool by agreed weight (per villa, per share, per revenue).

### 7.2 Revenue recognition
Revenue booked on **checkout date** for stay-night revenue. Cleaning fees and upsells recognized on service delivery. Refunds and chargebacks create negative revenue entries linked to original booking. Currency: base IDR with FX snapshot at posting time; display in IDR or USD per owner preference.

### 7.3 Expense allocation rules
Every expense carries an **allocation key**:
- `villa` — charged 100% to one villa owner.
- `project_pool` — split across villas in the project per the pool rule.
- `company` — not charged to any owner; absorbed by Arconique.
- `shared_custom` — manual split with documented justification.

Allocation rule changes are versioned; historical statements never re-allocate retroactively.

### 7.4 Reserve funds
- **Renovation reserve** — % of net revenue per villa (configurable, default 3%).
- **FF&E / Depreciation reserve** — % of net revenue per villa (default 5%).
- **Emergency / Operating reserve** — project-level buffer.

Reserves are *liability* entries against the villa or pool, not expenses removed from the world — owners see them growing.

### 7.5 Fees
- **OTA commissions** (Airbnb 3%, Booking.com 15%, Agoda 17%, Expedia 18% — configurable).
- **Payment processing** (Stripe ~3%, Xendit ~2.9%, bank transfer fixed).
- **Bank fees, FX loss** (captured on settlement).
- **Management fee** — % of net revenue or fixed, per contract.
- **Agent / broker commission** — per referral, one-time or recurring.

### 7.6 Owner statement formula (per villa, per month)
```
Gross Revenue
  − OTA Commission
  − Payment Processing Fee
  − Bank & FX Loss
= Net Received Revenue
  − Local Taxes (PHR, PPN as applicable)
  − Cleaning Costs (villa-specific)
  − Utilities (villa-specific)
  − Maintenance & Repairs (villa-specific)
  − Pool-allocated Shared Costs
  − Management Fee
  − Renovation Reserve contribution
  − FF&E Reserve contribution
= Owner Net Payout
```
The statement shows every line, every transaction drill-down, and a PDF export signed by the Finance Manager.

---

## 8. Operations Model

### 8.1 Villa status lifecycle
`Occupied → Checkout Pending → Cleaning In Progress → Supervisor Inspection → Ready for Check-in`
Parallel states: `Maintenance Blocked`, `Owner Stay`, `Out of Service`.

Status is the single source of truth shown on the status board; PMS, housekeeping, and guest portal all read from it.

### 8.2 Housekeeping flow
1. Booking ends → auto task created at checkout time.
2. Assigned to housekeeper by rota or manual override.
3. Housekeeper completes mobile checklist with photos.
4. Supervisor reviews photos; approves or returns with notes.
5. On approval, villa status moves to `Ready for Check-in`.

### 8.3 Maintenance flow
1. Ticket created (staff mobile, concierge, guest portal, preventive schedule, or AI-surfaced issue).
2. Priority (P1–P4) auto-assigned by type, with SLA.
3. Technician accepts; uploads diagnosis + photos.
4. If parts needed → auto-create Purchase Request.
5. Resolution confirmed; guest/owner notified if relevant.
6. SLA breaches escalate to Operations Manager.

### 8.4 Preventive maintenance
Per-villa schedules: AC service (quarterly), pool pump (monthly), pest (monthly), roof & gutter (semi-annual), deep clean (quarterly), fire safety (annual). Generated as tasks ahead of due date.

### 8.5 Staff performance
Each completed task is timestamped and photo-verified. Performance metrics: on-time completion, rework rate, supervisor approval rate, guest rating of tidy-up, inventory accuracy. Reviewed monthly; visible to the individual staff member and their supervisor only.

---

## 9. Inventory & Procurement Model

Catalog of items (linen, toiletries, F&B consumables, cleaning supplies, spare parts). Stock lives in **warehouses** and **villa-assigned stock**. Movements: receive, transfer, consume, damage, write-off. Minimum-stock alerts per location.

Purchase request → approval (configurable thresholds) → PO → supplier → receipt + invoice → expense ledger + allocation. Every expense must have an allocation key (villa / pool / company). Receipts stored in Supabase Storage with immutable hash.

---

## 10. Smart Access & Cameras Model

### Access
Every access event is logged. Codes are time-boxed (guest code valid for stay window; staff code valid for shift). Physical keys tracked by checkout/checkin to named staff. Lost key triggers re-key workflow.

### Cameras
Cameras are registered with location (common areas only — never inside villa interiors beyond the entrance). Access to live feeds and recordings is role-gated and fully audit-logged. **Privacy rule:** any camera feed view is logged with reason code; owner-villa cameras viewable by owner.

---

## 11. Integrations (scope-level view)

| Area | Partners to support |
|---|---|
| Channel manager | Hostaway (primary), Guesty, Smoobu, Lodgify (adapters) |
| OTA direct | Airbnb, Booking.com, Agoda, Expedia |
| Direct booking | Arconique site |
| Messaging | WhatsApp Business Cloud API, Telegram Bot, Instagram / Meta, SMS (Twilio/Vonage), Email (Resend/SES) |
| Access | Igloohome, Yale, Aqara, generic MQTT |
| Cameras | Reolink, Hikvision, UniFi (RTSP proxy via internal service) |
| Pricing | PriceLabs, Beyond |
| Accounting | Xero, QuickBooks (export-first, sync v8) |
| Payments | Xendit (IDR), Stripe (USD), bank transfer |
| Storage | Supabase Storage (primary); Google Drive sync optional |
| PDF | React-PDF / Puppeteer service |

Every integration is abstracted behind an internal adapter; the core domain knows only our canonical types.

---

## 12. Security & Compliance (product-level)

- **Auth:** Supabase Auth (email+password, magic link, SSO later). MFA mandatory for Super Admin, Director, Finance Manager from v2.
- **Authorization:** RBAC + ABAC (attribute: project, villa, owner). Enforced at RLS level.
- **Data isolation:** Investor data never shared across owners. Guest data never exposed to other guests.
- **Document access:** Every document has an explicit visibility scope (roles, users, owners).
- **Camera access:** Always logged. Viewable only by authorized roles + the relevant villa owner.
- **AI boundaries:** AI assistants run inside the same auth context as the user — they cannot read what the user cannot read.
- **Audit:** Append-only audit log on all writes to finance, access, ownership, roles, and documents.
- **Compliance targets:** Indonesian data-residency preferences; GDPR posture for EU-based investors; SOC2-inspired internal controls from day 1.

---

## 13. Out of Scope (explicit non-goals)

- Long-term-rental lease management (month-plus leases handled as a booking type, not a tenancy module).
- Full hotel PMS functionality (front desk, POS, night audit — we do not run reception).
- Own channel-manager stack (we integrate, we do not compete with Hostaway).
- Building a dedicated accounting ledger that replaces Xero/QuickBooks — we are the operational source of truth and sync outward.
- Native mobile app in v1–v9 (PWA covers it until v10).
- Marketplace for external guests (we are operator, not OTA).

---

## 14. Success Definition

This product has succeeded when:
1. An investor logs in on a Monday morning, sees their February statement, drills into one line, and closes the tab without emailing us.
2. An owner forwards their statement to their accountant without manual annotation.
3. A new housekeeper onboarded on Tuesday is running turnovers solo on Thursday, with every task timestamped.
4. A finance manager closes the month in two days, not two weeks.
5. The director opens one dashboard and can describe the portfolio's health in thirty seconds.
6. When a prospective owner asks *"how will you manage my villa?"*, the answer is *"let me show you the platform"*.
