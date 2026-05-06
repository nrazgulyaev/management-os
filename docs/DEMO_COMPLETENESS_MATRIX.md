# Demo Completeness Matrix

> Established at Prompt 116A.  Companion to
> `docs/QA-DEMO-WALKTHROUGH.md` and
> `docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md`.

This is the operator-facing checklist that matches every dashboard /
portal route to its **expected demo data**, **seed source**, and
**known limitations**.  Use it as the gate for "is this surface
ready to show?".

Status legend:

- **populated** — module has demo content from seed or static
  fallback.
- **fallback** — module renders polished placeholder copy when no
  data; still clickable, never crashes.
- **empty-accepted** — empty state is intentional (e.g. no security
  events on a fresh database).

---

## Owner portal

| Route | Expected demo data | Seed source | Status | QA notes |
|---|---|---|---|---|
| `/owner` | Portfolio summary + 2 villa cards + 1 pool holding + workspace nav | `src/app/(owner)/owner/page.tsx` (static mock) | populated | After P116A always shows the workspace nav. |
| `/owner/villas` | All linked villas | `current_owner_ids()` + `villas` | populated | Owner ID fallback resolves to seeded demo owner in demo mode. |
| `/owner/villas/[id]` | Villa detail | `villas` + `villa_units` | populated | Each villa link from `/owner` works. |
| `/owner/calendar` | Owner-safe calendar rows | `owner_visible_events` | populated | Demo owner fallback resolves owner ids. Legend explains direct vs OTA. |
| `/owner/villas/[id]/calendar` | Per-villa calendar | `owner_visible_events` | populated | |
| `/owner/bookings` | ≥6 owner-visible bookings | `owner_booking_summaries` | populated | Source explanation paragraph (P115). |
| `/owner/bookings/[id]` | Booking detail | `owner_booking_summaries` | populated | Guest contact never exposed. |
| `/owner/revenue` | Source mix + 3 months | `owner_revenue_source_monthly` | populated | IDR-only note (P115). Statement canonicality copy. |
| `/owner/villas/[id]/revenue` | Per-villa revenue | same | populated | |
| `/owner/statements` | ≥3 statements (issued / approved / paid) | `owner_statements` | populated | |
| `/owner/statements/[id]` | Statement lines + transparency | `statement_lines` + `statement_source_groups` | populated | Canonicality copy (P115). PDF button present. |
| `/owner/stays` | ≥3 owner stay requests | `owner_stay_requests` | populated | |
| `/owner/stays/[id]` | Owner stay detail | same | populated | |
| `/owner/inbox` | ≥5 in-app notifications | `in_app_notifications` | populated | Demo fallback maps to seeded owner. |
| `/owner/preferences/calendar` | Owner-portal preferences form | static | populated | |

Demo linkage fix in P116A: `listOwnerIdsForCurrentUser()` falls back
to `DEMO_OWNER_IDS.emma` when in demo mode and the resolved list is
empty.  Production never invokes the fallback.

## Guest stay portal — `/stay/demo/**`

| Route | Expected demo data | Seed source | Status | QA notes |
|---|---|---|---|---|
| `/stay/demo` | Stay landing page + 10 nav cards | `src/features/demo-data/stay-demo-content.ts` | populated | All cards link to subroutes. |
| `/stay/demo/check-in` | Smart-lock placeholder + arrival instructions + driver phrase | static | populated | Demo lock code is `123456`. |
| `/stay/demo/wifi` | Network + password + QR placeholder | static | populated | Production: encrypted at rest. |
| `/stay/demo/guide` | 4 guide sections (appliances, AC, pool, quirks) | static | populated | |
| `/stay/demo/house-rules` | 5 rules | static | populated | |
| `/stay/demo/neighborhood` | Map placeholder + 7 places | static | populated | |
| `/stay/demo/services` | 8 services across 5 categories | static | populated | Each card opens `/stay/demo/services/[id]`. |
| `/stay/demo/services/[id]` | Service detail + disabled order form | static | populated | Demo only — submit disabled. |
| `/stay/demo/concierge` | Mock chat with 5 canned replies | static | populated | Client-side; no AI call. |
| `/stay/demo/requests` | 3 demo requests with timeline | static | populated | |
| `/stay/demo/emergency` | 5 contacts | static | populated | Numbers masked. |
| `/stay/demo/offline` | Printable summary | static | populated | PDF button placeholder. |

No token required for any `/stay/demo/**` route.

## Field / staff app

| Route | Expected demo data | Seed source | Status | QA notes |
|---|---|---|---|---|
| `/field` | 15 demo tasks (overdue 2, today 5, in-progress 2, done 3, upcoming 3) | `buildDemoTasks()` static fallback | populated | Live data overrides when DB present. |
| `/field/inventory` | Inventory items + counts | `inventory_items` + `inventory_counts` | populated | |
| `/field/tasks/demo` | 22-item checklist across 8 sections | `TaskChecklist` component | populated | Includes 8 photo-required items. |
| `/field/tasks/[id]` | Task detail with checklist + attachments | `operation_tasks` | populated | |

## Vendor portal

| Route | Expected demo data | Seed source | Status | QA notes |
|---|---|---|---|---|
| `/vendor/service/[token]` | Token-scoped service request | `service_fulfilments` + token mint | fallback | Requires a minted vendor token in admin. |
| `/vendor/service/[token]/invoice` | Invoice metadata view | `service_fulfilment_invoices` | fallback | Same. |

Privacy copy added in P115.

## Direct booking

| Route | Expected demo data | Seed source | Status | QA notes |
|---|---|---|---|---|
| `/dashboard/direct-bookings` | Overview metrics + recent activity | `direct_booking_*` tables | populated | |
| `/dashboard/direct-bookings/holds` | ≥3 holds | `direct_booking_holds` | populated | |
| `/dashboard/direct-bookings/requests` | ≥3 requests | `direct_booking_requests` | populated | |
| `/dashboard/direct-bookings/deposits` | ≥2 deposits | `direct_booking_deposits` | populated | Manual stub. |
| `/dashboard/direct-bookings/reconciliation` | Reconciliation queue | `direct_booking_finance_links` | populated | |
| `/dashboard/direct-bookings/guest-status` | Per-token snapshot | `direct_booking_guest_status_snapshots` | populated | |
| `/dashboard/direct-bookings/messages` | Message threads | `direct_booking_messages` | populated | |

## Admin dashboard — module groups

(Each row applies to the corresponding `/dashboard/<module>` subtree.)

### Guest stays
| Section | Status | Notes |
|---|---|---|
| Overview | populated | |
| Tokens | populated | Hashed display only. |
| Villa Guides | populated | |
| Sections | populated | ≥3 demo sections. |
| Wi-Fi | populated | Demo encrypted blob. |
| Emergency Contacts | populated | ≥3. |
| Neighborhood | populated | ≥5 places. |
| Services Catalog | populated | ≥5. |
| Service Orders | populated | |
| Finance Bridge | populated | |
| Security · Events | empty-accepted | Empty on a fresh DB; documented. |
| Security · Verifications | populated | |
| Wi-Fi Migration | empty-accepted | One-shot tool. |
| Concierge AI · Sessions | populated | ≥2 demo sessions. |
| Concierge AI · Handoffs | populated | |
| Handoff SLA | populated | |
| Attachment Storage | populated | Bucket health page. |

### Owner stays
| Section | Status |
|---|---|
| Overview | populated |
| Requests | populated (≥3) |
| Policies | populated |
| Equivalence Groups | populated |
| Finance Bridge | populated |

### Maintenance intelligence
| Section | Status |
|---|---|
| Overview | populated |
| Templates | populated |
| Plans | populated (≥3) |
| Windows | populated |
| Risk Feed | populated |

### Utilities
| Section | Status |
|---|---|
| Overview | populated |
| Accounts | populated (≥3) |
| Readings | populated |
| Payments | populated |
| Risks | populated |

### Front office
| Section | Status |
|---|---|
| Today | populated |
| Arrivals | populated |
| Departures | populated |
| In-house | populated |
| Check-in/out Requests | populated |

### Availability
| Section | Status |
|---|---|
| Availability Board | populated |
| Calendar Blocks | populated |
| Readiness | populated |

### Security
| Section | Status | Notes |
|---|---|---|
| Overview | populated | |
| Cameras | empty-accepted | No real camera integration in v1. |
| Authentication | populated | |
| Login Attempts | empty-accepted | Empty on a fresh DB. |
| Events | empty-accepted | Same. |
| MFA Factors | populated | After admin bootstrap. |

### Integrations
| Section | Status |
|---|---|
| Overview | populated |
| Calendar Feeds | populated |
| Calendar Events | populated |
| Conflicts | empty-accepted |
| Automation Rules | populated |

### Finance
| Section | Status |
|---|---|
| Finance | populated |
| Material-Usage Bridge | populated |
| Statement Transparency | populated |

### Owner intelligence
| Section | Status |
|---|---|
| Overview | populated |
| Calendar | populated |
| Health Reports | populated |
| Reviews | populated |
| Preferences | populated |
| Rebuild Events | populated |
| Booking Projection | populated |
| Revenue Source Mix | populated |

### Guest journey
| Section | Status |
|---|---|
| Overview | populated |
| Rules | populated |
| Runs | populated |
| Suggestions | populated |
| Review Requests | populated |

### Service fulfilment
| Section | Status |
|---|---|
| Overview | populated |
| Fulfilments | populated (≥5) |
| Vendors | populated |
| Invoices | populated |
| Ratings | populated |
| Finance Bridge | populated |

### Dynamic pricing
| Section | Status |
|---|---|
| Overview | populated |
| Rule Sets | populated (≥1) |
| Calendar | populated |
| Quote Tester | populated |
| Logs | populated |
| Channel Push | populated (simulation) |

### Payments
| Section | Status |
|---|---|
| Overview | populated |
| Providers | populated (manual stub) |
| Webhooks | empty-accepted |

### Operations
| Section | Status |
|---|---|
| Command Center | populated |
| Tasks | populated (≥10) |
| Housekeeping | populated |
| Maintenance | populated |
| Preventive | populated |
| Checklists | populated |
| Service Requests | populated |
| Damage Reports | populated |

### Inventory
| Section | Status |
|---|---|
| Stock Command | populated |
| Items | populated (≥10) |
| Stock by Location | populated |
| Movements | populated |
| Locations | populated |
| Categories | populated |
| Suppliers | populated |
| Counts | populated |

### Procurement
| Section | Status |
|---|---|
| Overview | populated |
| Purchase Requests | populated (≥2) |
| Purchase Orders | populated (≥2) |

### Documents
| Section | Status |
|---|---|
| Documents | populated |

### Intelligence
| Section | Status |
|---|---|
| AI Assistants | populated |

### System
| Section | Status |
|---|---|
| Background Jobs | populated |
| Job Runs | populated |
| Job Locks | populated |
| System Health | populated |
| Demo Walkthrough | populated |
| Notifications | populated |
| Inbox | populated |
| Delivery Log | populated |
| Notification Preferences | populated |
| Audit Log | empty-accepted |
| Settings | populated |
| Responsibility Scopes | populated |
| My Account Security | populated |

---

## Owner portal demo expected counts (P116B)

When demo mode is on (`NEXT_PUBLIC_ENABLE_DEMO_MODE=1` or `ARCONIQUE_FORCE_MOCK=1`)
and `NODE_ENV !== "production"`, the owner portal services in
`@/features/demo-data/owner-portal-fallback` swap in static rows when
the live DB has no rows for the demo owner. Expected minimums on the
owner-portal pages:

| Surface | Minimum | Source |
|---|---|---|
| `/owner/bookings` | 8 rows (2 direct posted, 1 direct pending, 2 OTA, 1 owner stay, 1 maintenance, 1 internal hold) | `listDemoOwnerBookings()` |
| `/owner/revenue` | non-zero gross + 7 monthly rows across 3 months | `listDemoOwnerRevenueMonthly()` |
| `/owner/stays` | 4 stays (requested · pending review · approved · charges posted) | `listDemoOwnerStayRequests()` |
| `/owner/inbox` | 6 notifications (3 unread + 3 read) | `listDemoOwnerInboxNotifications()` |
| `/owner/calendar` | visual month grid + per-villa list | `OwnerCalendarGrid` + `listOwnerBookingSummariesForCurrentUser` |
| `/owner/villas/[id]/calendar` | per-villa visual grid + list | same |

## Visual calendar checklist

The visual grid lives at
`src/components/owner/owner-calendar-grid.tsx`.  Verify on demo:

- Month header with previous / next navigation.
- Weekday columns (Mon → Sun).
- Day cells with date numbers; today is highlighted.
- Multi-day event bars rendered above the day cells.
- Six event kinds with distinct colours: direct booking, OTA stay,
  owner stay, maintenance, internal hold, pending direct booking.
- Bars include a masked-initials chip when a guest label exists.
- Bars never display email / phone / token / provider IDs.
- Legend at the bottom matches the bar colours.

## Demo readiness checklist

Walk this list before any stakeholder demo:

1. ☐ `npm run db:seed` against the demo database (or set `NEXT_PUBLIC_ENABLE_DEMO_MODE=1`).
2. ☐ `/owner` renders portfolio + workspace cards.
3. ☐ `/owner/calendar`, `/owner/bookings`, `/owner/revenue`, `/owner/statements`, `/owner/stays`, `/owner/inbox` all show data.
4. ☐ `/stay/demo` and every subroute load + are clickable.
5. ☐ `/field` shows overdue + today + in-progress + done counts > 0.
6. ☐ `/dashboard` home, `/dashboard/system/deployment`, `/dashboard/system/health`, `/dashboard/system/storage` all green.
7. ☐ `/dashboard/demo` Demo Completeness Score ≥ 80.
8. ☐ `npm run demo:validate` exits with score ≥ 80 (when DB present).
