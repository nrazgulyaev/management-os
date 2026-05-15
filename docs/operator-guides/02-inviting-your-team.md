# Inviting your team

How to grow your tenant from "just you" to a real working team — your
property manager, bookkeeper, cleaners, security, concierge.

## Where to invite

```
/dashboard/settings/team
```

This page lists everyone currently in your org + every pending
invitation. The "Invite teammate" form sits at the top.

## What to fill in

| Field | Notes |
|---|---|
| Email | The teammate's email. Must be unique platform-wide. |
| Role | Pick from the table below. This drives what cabinet they land in + which permissions they get. |
| Scope | `org_wide` (default) or `project_specific` (limit to one project; e.g. a site supervisor who only works on Villa A). |
| Scoped project (optional) | Only required when `scope=project_specific`. |
| Notes (optional) | Internal note that shows up on the invitations list. Not shown to the invitee. |

## Roles → cabinet mapping

| Role | Where they land | Day-to-day they can |
|---|---|---|
| `super_admin` | `/dashboard` (Mgmt-OS apex) | Everything — billing, settings, all cabinets. Use sparingly. |
| `admin` | `/dashboard` | Almost everything except platform-admin views. |
| `cfo_accountant` | `/development-os/cabinets/cfo-accountant` | Bookkeeping: transactions, invoices, bank reconciliation, cost categories. |
| `project_manager` | `/development-os/cabinets/project-manager` | Projects, work packages, BoQ, contracts, vendors. |
| `qs` | `/development-os/cabinets/qs` | BoQ pricing, cost forecasting, AI QS Cost Analyst. |
| `procurement_manager` | `/development-os/cabinets/procurement-manager` | Purchase requests, POs, vendor quotations. |
| `site_supervisor` | `/development-os/cabinets/site-supervisor` | Site reports, QA/QC, safety incidents, daily-digest AI. |
| `warehouse_manager` | `/development-os/cabinets/warehouse-manager` | Inventory items, stock movements, materials. |
| `sales_manager` | `/development-os/cabinets/sales-manager` | Leads pipeline, reservations, contracts. |
| `marketing_staff` | `/development-os/cabinets/marketing-staff` | Campaigns, lead sources, content, conversations review. |
| `front_office` | `/dashboard/front-office` | Arrivals, in-house guests, requests, exception list. |
| `housekeeping` | `/dashboard/housekeeping` (via concierge cabinet) | Turnover schedule, daily cleaning plan. |
| `security` | `/dashboard/security` | Overnight incidents, patrol completion, camera alerts. |
| `concierge` | `/dashboard/concierge` | Guest sessions, handoffs, service orders. |

The full role-permission matrix lives at
`src/features/auth/permission-matrix.ts`.

## What the invitee sees

1. Receives the invitation email with subject "You're invited to join
   {YourCompany} on Arconique". Body includes a 7-day-valid link.
2. Clicks the link → lands at `/accept-invitation/<token>`.
3. Sees a confirmation page with your company name + the role you
   assigned. They set a password + click "Accept".
4. The accept flow:
   - Creates their Supabase Auth user (if not already one).
   - Inserts their `app_users` row scoped to **your** org.
   - Grants the role you chose.
   - Marks the invitation `accepted`.
5. They sign in once → land at the cabinet apex for their role.

## Common patterns

### Inviting a property manager (Mgmt-OS user)

Role: `admin` (if you want them to manage billing too) or `super_admin`.
Scope: `org_wide`.

### Inviting a CFO / bookkeeper

Role: `cfo_accountant`. Scope: `org_wide`. They land in the CFO/
Accountant cabinet which gives access to transactions, invoices,
and the Tax Assistant AI agent.

### Inviting a site supervisor for ONE project

Role: `site_supervisor`. Scope: `project_specific`. Pick the project
from the dropdown. They'll see only that project's site reports +
QA/QC checklists.

## Pending invitations

The settings/team page shows every pending invitation with three
actions:

- **Resend** — re-queue the email (e.g. inviting got a typo'd email,
  fix it in a new invitation; or after 7 days, refresh the link).
- **Revoke** — mark the invitation `revoked`. The link stops working.
- **Copy link** — for manual delivery (e.g. paste into Slack).

## What didn't work before STAB-4 (and now does)

Prior to today's fix, every customer's "Invite teammate" action would
have created the invitation in the operator's `ARCONIQUE_DEFAULT`
org — your teammate would have accidentally joined the operator's
data, not yours. STAB-4 fixed this by reading the inviter's
`organization_id` from their session. Multi-tenant safe now.

## Known limits today

- **Email delivery is dry-run by default** if `RESEND_API_KEY` (or your
  configured provider) isn't set. The invitation still lives in the
  DB; the invitee just doesn't get an email. Use the "Copy link"
  button to deliver manually until you provision a real email
  sender.
- **No bulk invite** — one row at a time. CSV/bulk-invite is a backlog
  item.
- **No automatic role expiration** — once accepted, the role grant is
  permanent until you revoke it.
