# Arconique Management OS — Implementation Roadmap

**Status:** v0 Blueprint
**Last revised:** 2026-04-24

This roadmap breaks the build into eleven versions (v0 → v10). Each version has a focused goal. Later versions can begin in parallel with earlier ones where dependencies allow, but the **release order** is binding: we do not ship v3 before v2 is production-grade; we do not ship v7 before v6.

Every version lists: **goals, features, routes, database needs, UI components, acceptance criteria, risks, what not to build yet**. Unless noted, every version inherits the design system and permission model from earlier versions.

Estimated calendar is indicative and excludes holidays and integration lead times; the order and scope are the primary contract.

---

## Version 0 — Blueprint

**Status:** this document set.

**Goals**
- Agree on product vision, modules, data model, role model, AI strategy, design direction, and roadmap.
- Produce artifacts that a new senior engineer + designer could onboard to without extra context.

**Deliverables**
- `PRODUCT_SPEC.md`
- `TECHNICAL_ARCHITECTURE.md`
- `ROUTES_STRUCTURE.md`
- `DATABASE_SCHEMA.md`
- `USER_ROLES_AND_PERMISSIONS.md`
- `AI_ASSISTANTS_STRATEGY.md`
- `DESIGN_SYSTEM.md`
- `IMPLEMENTATION_ROADMAP.md` (this file)

**Acceptance criteria**
- All eight documents exist under `arconique.com/management/docs/`.
- Docs reviewed and approved by product lead, engineering lead, and design lead.
- No source code, package installation, or Next.js scaffold has been created.

**Risks**
- Scope creep before v1. Mitigation: this document is the freeze line.

**Do not build yet**
- Any code, any `package.json`, any `app/` scaffold, any migrations.

---

## Version 1 — Public Website + App Shell

**Goals**
- Ship `management.arconique.com` marketing site publicly.
- Scaffold the entire app with the final stack choices and design system in place.
- Ship authentication, base navigation shells, and the PWA manifest across all five surfaces.
- Stand up staging and production infrastructure.

**Features**
- Marketing pages: Home, Villa Management, Owner Portal (marketing), Investor Reporting (marketing), Guest Experience (marketing), Operations (marketing), Portfolio + project pages, Case Studies index + template, Contact, Apply, Legal.
- Design system implementation: tokens, type, Radix + shadcn components restyled, motion presets, icon set.
- App shells for admin, owner, guest, field — navigation, auth, 404/500, empty states, theme switcher.
- Auth: email+password, magic link, password reset, invitation flow, sign-out; MFA stubs.
- PWA: manifest variants, service worker (network-first/static), install prompt, offline fallback.
- Observability baseline: Sentry, structured logging, request ids, health endpoints.
- Legal: cookie consent, privacy, terms pages.
- Public forms: Contact + Apply (stored in `leads` table; minimal CRM backend).

**Routes**
- All `(marketing)/*`, `(auth)/*`, `/app` (empty shell), `/owner` (empty shell), `/stay/[token]` (rendered "invalid" by default), `/field` (empty shell), `/api/v1/health`, `/api/v1/version`, `/api/v1/me`.

**Database needs**
- `users`, `user_types`, `roles`, `permissions`, `role_permissions`, `user_roles`, `api_keys`, `sessions_meta`, `settings`, `feature_flags`.
- Minimal `leads` + `messages` + `threads` for contact form handling.
- `audit.events` and `audit.auth_events`.
- Seed the role/permission matrix.

**UI components**
- `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `Tabs`, `Dialog`, `Sheet`/`Drawer`, `Popover`, `Tooltip`, `Toast`, `DropdownMenu`, `ContextMenu`, `Breadcrumb`, `Avatar`, `Badge`, `Card`, `Panel`, `Separator`, `Skeleton`, `Pagination`, `CommandPalette` (cmd-K shell).
- Marketing: `HeroEditorial`, `SectionPillar`, `TestimonialQuiet`, `PortfolioGrid`, `CaseStudyHeader`, `StatsStrip`, `ApplyForm`.
- Icon system.

**Acceptance criteria**
- Marketing Lighthouse ≥ 95 performance / 100 accessibility / 100 best practices / 100 SEO on a cold mobile 4G profile.
- All five surfaces reachable behind auth where applicable; RLS enabled on every user-facing table and tested via `pgtap` against the role matrix.
- PWA installable on iOS Safari, Android Chrome, and desktop Chrome; offline shell works on each.
- Apply and Contact forms create leads with an audit event.
- Staging environment deployed; a production DNS cutover is possible without additional work.
- No feature from later versions is partially built.

**Risks**
- Over-designing the marketing site before the app is real. Mitigation: marketing site is done when the six pillar pages ship; a beta badge on everything operational surfaces is acceptable.
- Supabase Singapore region availability for Indonesia residency. Mitigation: confirm at provisioning; document fallback.

**Do not build yet**
- Admin tables / CRUD beyond the shell.
- Finance engine.
- Inventory.
- AI.
- Integrations beyond email transactional.

---

## Version 2 — Core Data Model

**Goals**
- Stand up the full operational domain: projects, villas, owners, shares, bookings, guests, channels.
- Enable internal operators to onboard three projects (Eternal Villas, Enso Villas, Ahau Gardens) and their villas, owners, and manual bookings.
- RLS + permissions enforced everywhere; audit trail live.

**Features**
- Projects CRUD and settings.
- Villas CRUD, amenities, photos, villa guide.
- Owners CRUD, KYC document upload, ownership shares with date ranges and 100% constraint per villa/pool.
- Bookings CRUD (manual), guests CRUD, channels registry.
- Global calendar + villa calendar (availability).
- Villa status board (manual status transitions at this stage).
- Document vault (scoped).
- Audit log viewer for super admin + director.
- MFA enforced for sensitive roles.

**Routes**
- `/app/projects/*`, `/app/villas/*` (except finance), `/app/owners/*`, `/app/shares`, `/app/bookings/*` (manual), `/app/guests`, `/app/channels`, `/app/villas/status-board`, `/app/documents/*`, `/app/audit`.

**Database needs**
- `company`, `projects`, `villas`, `villa_status_events`, `villa_guides`, `owners`, `ownership_shares`, `payout_methods`, `channels`, `guests`, `bookings`, `booking_guests`, `booking_events`, `documents`, `document_access_log`.
- Full RLS + scope-aware policies. Triggers: `fn_check_share_sum`, `fn_villa_status_transition`, `trg_updated_at`, `trg_audit_write` (scoped).

**UI components**
- `DataTable` (sticky header, column config, sort, filter, pagination, CSV export).
- `VillaCard`, `VillaStatusBoard`, `BookingForm`, `OwnerProfileCard`, `ShareAllocationEditor` (with live validation of sum ≤ 100%).
- `DocumentViewer`, `DocumentUpload` (with category + scope picker).
- `Calendar` (month + villa rows), `DateRangePicker`.
- `AuditLogList`.

**Acceptance criteria**
- An admin can onboard a project, its villas, owners, and shares end-to-end.
- An owner invited can log into `/owner` and see only their villas (empty data is fine).
- A property manager assigned to Eternal Villas sees only Eternal Villas; RLS tests pass for all 15+ scoping scenarios.
- Share percentages cannot exceed 100% on any date (enforced at DB).
- Audit log shows every create/update/delete to villas, owners, shares, bookings, documents.

**Risks**
- Data migration from existing spreadsheets. Mitigation: a structured import CSV + dry-run tool as part of this version.
- RLS complexity. Mitigation: CI `pgtap` suite mandatory.

**Do not build yet**
- Finance engine (statements, payouts).
- Operations tasks / maintenance.
- Inventory.
- AI.
- Channel manager integration (use manual bookings).

---

## Version 3 — Finance & Investor Reporting

**Goals**
- Turn the platform into a true source of financial truth.
- Produce the first Arconique owner statements from the platform.
- Ship the owner portal with statement viewer and PDF export.
- Ship the first two AI assistants (read-only): **Investor Assistant**, **Finance Analyst**.

**Features**
- Revenue ledger auto-generated from bookings (nightly recognition on checkout).
- Expense ledger with manual entry + receipt upload + supplier tagging.
- Fee engine: OTA, payment, bank, FX, agent commissions — configured per channel.
- Taxes (PPN, PHR) configurable per project.
- Reserve funds (renovation, FF&E, operating, emergency) per villa/project with configurable rules.
- Allocation rules with versioning and per-expense allocation outputs.
- Monthly close workflow: freeze period → allocate → compute P&L → reserve contributions → management fee → statement draft.
- Statement approval (two-person rule) + publish + PDF export with hash.
- Owner portal: portfolio dashboard, villa P&L, statements archive, PDF download, large-expense approvals inbox.
- AI Investor Assistant (read) and AI Finance Analyst (read) — citation-based, structured outputs.
- Payouts: draft batches, approval, sent, paid, failure tracking.
- FX rates ingestion (daily) + per-transaction snapshot.
- Bank transactions import + manual reconciliation.

**Routes**
- `/app/finance/*`, `/app/owners/[id]/statements`, `/app/owners/[id]/payouts`.
- `/owner`, `/owner/villas/[id]`, `/owner/villas/[id]/finance`, `/owner/statements/*`, `/owner/payouts/*`, `/owner/approvals/*`, `/owner/documents/*`, `/owner/assistant`.
- `/api/v1/revenue`, `/api/v1/expenses`, `/api/v1/fees`, `/api/v1/taxes`, `/api/v1/reserves`, `/api/v1/payouts`, `/api/v1/statements`, `/api/v1/ai/chat` (SSE), `/api/v1/ai/explain-statement`.

**Database needs**
- `accounts`, `revenue_lines`, `fee_lines`, `expense_lines`, `allocation_rules`, `expense_allocations`, `taxes`, `reserves`, `bank_accounts`, `bank_transactions`, `payouts`, `statements`, `statement_lines`, `fx_rates`, `invoices`, `owner_approvals`.
- `ai.assistants`, `ai.assistant_events`, `ai.embeddings`, `ai.tool_registry`, `ai.guardrail_incidents`.
- Triggers: `fn_allocate_expense`, `fn_generate_statement`, `fn_lock_closed_period`.

**UI components**
- `LedgerTable` (revenue / expense), `ExpenseEntryForm` (with receipt + allocation), `AllocationRuleEditor`, `TaxConfigPanel`, `ReserveBalanceCard`.
- `StatementTable` (editorial), `StatementPreview` (approaching print layout), `PDFPreview`.
- `OwnerPortfolioDashboard` (hero KPIs, monthly strip, projects breakdown).
- `VillaPLView` (monthly drilldown with transaction drawer).
- `PayoutBatchEditor`, `PayoutStatusList`.
- AI chat: `AssistantChat`, `CitationBadge`, `StructuredPayloadCard`, `ToolConfirmDialog`.
- PDF templates (statement, payout advice).

**Acceptance criteria**
- Monthly close for three projects runs in ≤ 3 business days with current team.
- A test owner receives a statement with every line traceable to source transactions; PDF hash matches stored hash.
- Investor Assistant can answer "why did my payout change vs last month" grounded in statement data with zero fabricated numbers (verified in evals).
- Finance Analyst can compute GOP, NOI, ADR, RevPAR per villa per period citing source rows.
- Two-person approval enforced for statement publish and payout send.
- Closed-period writes blocked without override; override creates a critical audit event.
- Statement PDFs identical under regeneration (determinism) once approved.

**Risks**
- Bali tax subtleties (PHR base, PPN applicability on cleaning fees). Mitigation: rules table + accountant sign-off per project.
- AI hallucination on finance. Mitigation: verifier pass + golden-set evals gated in CI.
- FX rate timing mismatches. Mitigation: snapshot at posting time, configurable daily source, manual override allowed with reason.

**Do not build yet**
- Channel manager integration (still manual or CSV).
- Housekeeping automation / mobile flows.
- Inventory / procurement.
- Maintenance tickets.
- Guest portal.
- Other AI assistants beyond Investor + Finance.

---

## Version 4 — Operations

**Goals**
- Stand up the operations backbone: tasks, checklists, maintenance, preventive, status automation, staff mobile portal.
- Replace WhatsApp-based turnover coordination with auditable task flows.
- Ship the **Operations Copilot**, **Maintenance Assistant**, and **Report Writer** (basic).

**Features**
- Tasks: lifecycle, assignment, checklist, completion, supervisor approval, photo upload, offline queue.
- Housekeeping: auto-generated turnover tasks on checkout; assignment rota; photo-verified checklist.
- Maintenance tickets: creation, triage, SLA, escalation, resolution, part sourcing, photo before/after.
- Preventive schedules: auto-generated tasks for quarterly/monthly cadences.
- Villa status transitions driven by task events.
- Damage reports, lost & found, guest complaints.
- Staff performance dashboards (on-time, approval rate, photo compliance).
- Rotas / shift planning (basic).
- Staff mobile PWA portal (offline-capable): today, tasks, checklists, damage report, inventory use (lightweight), approvals for supervisors.
- AI Operations Copilot (read + summarize), Maintenance Assistant (read + draft + propose PR), Report Writer (drafts).

**Routes**
- `/app/operations/*`, `/app/villas/[id]/operations`, `/app/staff/*`.
- `/field/*` (full staff PWA surface).
- `/api/v1/tasks/*`, `/api/v1/maintenance/*`, `/api/v1/preventive/*`, `/api/v1/rt/tasks`, `/api/v1/rt/status-board`.

**Database needs**
- `tasks`, `checklist_templates`, `checklist_instances`, `maintenance_tickets`, `preventive_schedules`, `damage_reports`, `lost_found`, `complaints`, `staff_performance` (materialized view), `rotas`.
- Push subscriptions for field.
- `ai.assistant_events` extended; prompts for three new assistants.

**UI components**
- `TaskCard` (desktop + mobile), `TaskBoard`, `ChecklistRunner` (mobile, photo capture), `MaintenanceTicketDetail`, `PreventiveScheduleEditor`, `StatusBoard` (realtime), `DamageReportForm`, `ComplaintThread`, `StaffPerformanceChart`.
- Field shell: `FieldLayout`, `TodayList`, `BigPrimaryButton`, `OfflineBanner`, `PhotoCapture`, `QuickRequestSheet`.
- AI: inline drawer for ops/maintenance pages, report composer skeleton.

**Acceptance criteria**
- A full turnover runs end-to-end from checkout event to "Ready for Check-in" with photo evidence and supervisor approval.
- Field PWA works offline for the full turnover flow: open task, run checklist, capture photos, complete. Sync upon reconnection.
- SLA breaches generate notifications and escalate to Operations Manager.
- Operations Copilot can produce "today's turnover plan across Eternal Villas" grounded in tasks.
- Maintenance Assistant drafts a resolution note citing the ticket and prior similar tickets.
- Report Writer drafts a weekly operations report for a project with clickable citations.
- Zero out-of-scope access: a housekeeper only sees their assigned villas today.

**Risks**
- Field adoption by low-tech staff. Mitigation: bilingual UI, icon-first, minimum text, on-site training plan.
- Photo upload size in bad-connectivity conditions. Mitigation: client-side resize + resumable TUS upload.
- Offline conflict resolution. Mitigation: last-write-wins at task level with server-stamped timestamps; conflicts surfaced to supervisor.

**Do not build yet**
- Full inventory catalog beyond basic "used X at villa Y".
- Procurement PO flow.
- Guest portal.
- Channel manager integration.

---

## Version 5 — Inventory & Procurement

**Goals**
- Replace spreadsheets of linen, toiletries, and supplies with a real inventory system.
- Enable end-to-end purchase request → approval → PO → receipt → expense allocation.
- Ship the **Procurement Assistant**.

**Features**
- Inventory catalog, categories, units, par levels, reorder thresholds.
- Locations: warehouses, per-villa assigned stock, vehicles, vendor holds.
- Movements: receive, transfer, consume (linked to tasks), writeoff (damage + linen), adjust.
- Min-stock alerts with routing to Procurement Manager + surfaced on `/app` portfolio card.
- Purchase requests from field and admin; approval thresholds per role.
- Purchase orders: draft, send, receive partially, close, cancel; supplier-facing PDF.
- Receipts upload with OCR hints and direct-link to expense line creation with allocation key.
- Supplier management: profile, category, payment terms, rating, history.
- Expense allocation on PO-linked expense: villa / project_pool / company / shared_custom with documented justification.
- AI Procurement Assistant: low-stock report, supplier suggestion, PO drafting (suggest-only), demand forecast basics.

**Routes**
- `/app/inventory/*`, `/app/procurement/*`, `/app/suppliers/*`.
- `/field/inventory`, `/field/inventory/scan`, `/field/purchase-request`, `/field/purchase-request/new`.
- `/api/v1/inventory/*`, `/api/v1/procurement/*`, `/api/v1/suppliers/*`.

**Database needs**
- `inventory_items`, `inventory_locations`, `inventory_stock`, `inventory_movements`, `suppliers`, `purchase_requests`, `purchase_orders`, `purchase_order_lines`, `supplier_invoices`.

**UI components**
- `InventoryItemCard`, `StockLevelGrid`, `MovementForm` (mobile-friendly), `LowStockAlertList`, `PurchaseRequestForm`, `POBuilder` (line-editor with allocations), `SupplierProfile`, `SupplierRatingEditor`.
- PDF template for PO.

**Acceptance criteria**
- A housekeeper records consuming a bottle of dish soap in the mobile field app; inventory decrements; if below threshold, a low-stock alert appears within minutes.
- A purchase request over threshold is blocked from one-click approval and escalates to Director.
- Every PO line becomes an expense with a correct allocation key visible on the owner's statement (villa, pool, or company).
- Procurement Assistant answers "which items are below par across Enso" with current snapshot citations.
- Weekly stock report exportable as PDF.

**Risks**
- Data entry burden for field staff. Mitigation: QR-code scan flow; two-tap common items; preset kits.
- Supplier diversity (many small local suppliers in Bali). Mitigation: soft matching + dedupe tools.

**Do not build yet**
- Automated reordering without human approval (v7+).
- External price intelligence (v8).
- Guest portal.

---

## Version 6 — Guest Portal & Concierge

**Goals**
- Replace the Airbnb-style welcome email with a true guest experience surface.
- Capture upsell revenue systematically.
- Ship the **AI Guest Concierge** (v1).

**Features**
- Guest portal `/stay/[token]`: stay overview, check-in (with T-24h smart-lock code placeholder), Wi-Fi, villa guide, house rules, services catalog with booking, service requests, concierge chat, post-stay review.
- Tokenized signed URL generation on booking confirmation; sent via email, WhatsApp, SMS.
- Upsell catalog with supplier links and per-villa availability.
- Service request flow: creates a task assigned to appropriate role.
- Concierge chat with AI Guest Concierge, WhatsApp handoff to human on demand or escalation.
- Review capture (internal) + request-for-review flow for external OTAs.
- Multi-language (EN/ID/basic DE/FR/RU via machine + human-review toggle).

**Routes**
- `/stay/[token]/*` (all), `/go/checkin/[token]`, `/go/guide/[token]`, `/go/concierge/[token]`.
- `/api/v1/ai/chat` used with `assistant=guest_concierge`.

**Database needs**
- `upsells_catalog`, `booking_upsells`, `threads`, `messages` extended to guest channel.
- Enable Guest Concierge prompt + tools.

**UI components**
- `StayHero`, `CheckinCard` (code revealed conditionally), `WifiCard`, `GuideReader` (beautifully typeset), `RulesChecklist`, `UpsellGrid`, `UpsellDetail`, `ServiceRequestSheet`, `ConciergeChat`, `ReviewPrompt`, `InvoiceFolio`.

**Acceptance criteria**
- A guest receives a link pre-arrival and can complete check-in entirely from the portal with no operator intervention (where unattended).
- Smart-lock code only surfaces to guest UI after T-24h and is revoked T+3h after checkout (code placeholder works without lock integration yet).
- Service request creates a task; staff sees it in `/field`.
- Concierge AI never reveals smart-lock code; refuses questions outside scope; escalates safety/medical to WhatsApp within seconds.
- Upsell booking creates `booking_upsells` row and downstream revenue on delivery.
- Review capture triggers OTA review flow on consent.

**Risks**
- Link delivery reliability across SMS/WhatsApp/email. Mitigation: multi-channel send + link shortener + resend from admin.
- Token leak. Mitigation: short expiry, IP fingerprinting optional, re-issue tool.

**Do not build yet**
- Actual smart-lock code generation (waits for v8 integrations) — placeholder string rendered but static until then.
- Channel manager inbound (v8).
- Voice concierge (v8).

---

## Version 7 — AI Layer (full rollout)

**Goals**
- Bring every assistant to feature complete, with mutating tools behind feature flags.
- Add cross-assistant routing, advanced evaluators, and predictive features.
- Add **AI CRM Assistant**.

**Features**
- Guest Concierge: full upsell orders tool, upsell catalog search, service request creation, WhatsApp handoff.
- Investor Assistant: approval tool (owner approvals), period comparison structured output.
- Operations Copilot: task assignment + escalation tools, predictive workload.
- Finance Analyst: narrative drafting, variance detection, reconciliation flagging.
- Maintenance Assistant: cost estimation, PR creation tool.
- Procurement Assistant: demand forecasting, supplier scoring.
- Report Writer: attached figure generation, branded templates.
- AI CRM Assistant: lead classification, reply drafting, follow-up creation, villa matching.
- Evaluations in CI gating prompt changes; sampled hallucination classifier.
- Cross-assistant routing: a question outside an assistant's scope can suggest switching to the right one (with consent).
- Per-user usage telemetry and rate limits.

**Routes**
- `/app/ai/crm`, mutating tool endpoints `/api/v1/ai/tools/*`.

**Database needs**
- Extended `ai.tool_registry` with all tools.
- Feedback + feature flag tables for staged rollout.

**UI components**
- `ToolExecutionCard`, `PeriodCompareView`, `NarrativeEditor`, `ReplyComposer`, `LeadMatcher`.

**Acceptance criteria**
- Grounding rate ≥ 98% on sampled responses; zero fabricated numbers in finance contexts (audited).
- Mutating tools require explicit confirmation UI and are logged in audit.
- Feature flags allow turning off individual tools or assistants instantly.
- Weekly evals run in CI; regressions block merges.

**Risks**
- Tool misuse leading to unintended writes. Mitigation: double guard (UI confirm + server `can()`), staged rollout per tool, kill switch.
- Latency with larger contexts. Mitigation: retrieval chunk limits, caching, provider streaming.

**Do not build yet**
- Voice AI.
- External data (price intelligence) — partial arrives with v8 integrations.

---

## Version 8 — Integrations

**Goals**
- Connect the platform to the real external world: OTAs, channel manager, messaging, smart locks, cameras, payments, pricing, accounting.

**Features**
- **Channel manager** adapter (Hostaway primary; Guesty, Smoobu, Lodgify swappable): inbound bookings, calendar sync, rate sync, cancellations, messages.
- **Direct booking** engine on Arconique site (rates, availability, checkout via Xendit/Stripe).
- **Messaging**: WhatsApp Business Cloud API, Telegram Bot, Instagram/Meta leads, SMS provider, email (Resend/SES) — inbox unified.
- **Smart locks**: Igloohome, Yale, Aqara adapters; real code generation replacing v6 placeholder.
- **Cameras**: RTSP proxy service (Fly.io) with role-gated stream tokens; per-view logging. Privacy rules enforced.
- **Dynamic pricing**: PriceLabs integration; daily price pushes; logs of applied prices.
- **Accounting**: Xero / QuickBooks outbound export (invoices, expenses, taxes, payouts as journal entries). Cursor-based sync state.
- **Payments**: Xendit (IDR direct), Stripe (USD), bank-transfer reconciliation aided by bank integration.
- **Document storage**: Optional Google Drive mirror of key documents with signed links.
- **Outbound webhooks** for customer integrations.

**Routes**
- `/app/settings/integrations/*`, `/api/v1/integrations/**` (all webhook + connection endpoints).

**Database needs**
- `integrations.connections`, `integrations.webhook_events`, `integrations.listing_map`, `integrations.price_snapshots`.
- Per-integration credential encryption.

**UI components**
- `IntegrationDirectory`, `ConnectWizard` per provider, `SyncStatusPanel`, `ListingMapEditor`, `CameraStreamViewer` (with reason prompt), `PricingControlPanel`.

**Acceptance criteria**
- Onboarded an OTA via Hostaway and confirm bookings import with correct channel fees and auto-generated revenue lines.
- Smart-lock integration generates a time-boxed code for a booking and logs activation events.
- Camera live view requires a reason code and is logged; Super Admin audit view shows every session.
- PriceLabs daily push completes; applied prices reflected on channel extranets.
- Xero export produces a valid GL entries file for a closed period; dry-run first.
- WhatsApp inbound messages appear in unified inbox; outbound sends via approved templates.

**Risks**
- Vendor API volatility. Mitigation: adapters behind stable internal interfaces; contract tests per adapter.
- Duplicate bookings from double-push (OTA + channel manager). Mitigation: canonical booking key, idempotency on inbound webhooks.
- Camera privacy. Mitigation: camera access policy enforced; never-inside-villa rule; every view logged; owner visibility for their own villas only.

**Do not build yet**
- Our own channel-manager replacement.
- Full native mobile.
- PWA advanced polish (v9).

---

## Version 9 — PWA Polish

**Goals**
- Bring the PWA experience to feel like a native app across admin, owner, guest, and field.
- Harden offline, push, deep links, and install prompts.

**Features**
- Per-surface refined manifest and icons.
- Web Push notifications for tasks, statements, approvals, messages (per user prefs).
- Background sync reliability on field (retry policies, conflict surfacing).
- Pull-to-refresh and native-feel gestures where appropriate.
- Install coaching per surface; handle iOS Add-to-Home-Screen nuances.
- Share targets (iOS/Android) for photo upload from camera roll directly into a task.
- Deep links: `/go/checkin/*` works from SMS into installed PWA if present.
- Performance: INP ≤ 100ms p95 on mid-range Android; LCP ≤ 2s.
- Reduced-motion, high-contrast, font-size settings.
- AI chat offline queue (compose now, send on reconnect) on field surface.

**Routes**
- No new routes; refinement and PWA-only endpoints like `/manifest.webmanifest?surface=field`.

**Database needs**
- `push_subscriptions` production-hardened; `notification_preferences` UI.

**UI components**
- `PushPermissionCard`, `InstallCoach`, `ShareTargetHandler`, `ConflictResolveSheet`, `DeepLinkReceiver`.

**Acceptance criteria**
- PWA passes Lighthouse "installable" and reliable checks on all four installable surfaces.
- Web Push delivered to installed admin and owner within 5 seconds of event.
- Field can run a full day offline (assuming login pre-fetched) and sync cleanly at end of day with < 0.5% error rate.
- Statement notification opens directly to the statement in the owner PWA.

**Risks**
- iOS Web Push limitations (historical). Mitigation: progressive enhancement — iOS users still get email + SMS if push unavailable.
- Battery / storage cost. Mitigation: lean caches, purge policies.

**Do not build yet**
- Native app.

---

## Version 10 — Future Native Apps

**Goals**
- Ship native apps where they add value beyond PWA: notifications, hardware access, store presence.
- Keep one codebase of business logic; apps are thin consumers of `/api/v1`.

**Features**
- React Native via Expo apps for: **Guest** (Apple Wallet "stay card", native push, biometric auth), **Owner** (biometric, investor-grade feel), **Field** (optional — PWA covers it unless hardware requires otherwise).
- Shared types / Zod schemas / permission constants from the main repo as an internal package.
- Deep links and universal links with Apple App Site Association and Android asset links.
- App store presence with reviewed screenshots and privacy nutrition labels.
- Secure storage for tokens; biometric unlock.
- Push reliability via APNs + FCM.
- MDM compatibility for corporate investors if requested.

**Routes**
- No app routes; native screens map to existing APIs.

**Database needs**
- `device_registrations` for push tokens.
- MFA for mobile (TOTP / biometric attestation).

**UI components**
- RN translations of key design system primitives.

**Acceptance criteria**
- Guest app check-in produces parity experience with PWA, plus Apple Wallet addition and native push.
- Owner app opens a statement via biometric auth in < 2s.
- Store listings approved on iOS + Android with accurate privacy disclosure.

**Risks**
- App store review cycles and delays. Mitigation: release early to TestFlight and internal tracks.
- Divergence between web and native. Mitigation: shared types + integration tests against staging.

**Do not build yet**
- Everything else — roadmap is complete by v10.

---

## Cross-cutting Tracks (continuous)

These are not versions but constant workstreams.

- **Security review:** quarterly; penetration test before v3 (finance launch) and before v8 (external integrations).
- **Accessibility audit:** before v1 launch and before v6 (guest portal).
- **Design governance:** quarterly design debt review; token source-of-truth maintained.
- **Data migration:** owner + villa + historical booking import scripts maintained until v4; then locked to import API.
- **Runbooks:** every integration and every AI assistant ships with a runbook (how to disable, how to replay, how to audit).
- **Evals:** AI evals in CI from v3; grow the golden set quarterly.
- **Training:** staff enablement sessions at v4 (operations), v5 (procurement), v6 (guest), v7 (AI adoption).

---

## Release Gates (binding)

A version cannot be declared done unless:
1. Acceptance criteria met (manual sign-off by product lead + engineering lead).
2. Tests green including the permission matrix (pgtap) and, where applicable, AI evals.
3. Observability dashboards exist for the new surfaces.
4. Runbook and rollback plan exist.
5. Design system drift is zero or documented with an ADR.
6. Security review ticket closed for anything touching auth, finance, access, or cameras.
