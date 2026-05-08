# CRUD completeness

Pages where Add exists but Edit and/or Delete is missing (excluding `/new` routes which are subforms):

- `/dashboard/documents` — add=1, edit=0, delete=0
- `/dashboard/guest-journey/rules` — add=1, edit=0, delete=0
- `/dashboard/integrations/calendar-events` — add=1, edit=0, delete=0
- `/dashboard/integrations/calendar-feeds` — add=1, edit=0, delete=0
- `/dashboard/inventory` — add=1, edit=0, delete=0
- `/dashboard/inventory/items` — add=1, edit=0, delete=0
- `/dashboard/inventory/locations` — add=1, edit=0, delete=0
- `/dashboard/inventory/movements` — add=1, edit=0, delete=0
- `/dashboard/inventory/suppliers` — add=1, edit=0, delete=0
- `/dashboard/operations/housekeeping` — add=1, edit=0, delete=0
- `/dashboard/operations/maintenance` — add=1, edit=0, delete=0
- `/dashboard/operations/preventive` — add=2, edit=0, delete=0
- `/dashboard/operations/tasks` — add=1, edit=0, delete=0
- `/dashboard/owner-stays/equivalence-groups` — add=2, edit=0, delete=0
- `/dashboard/owner-stays/policies` — add=1, edit=0, delete=0
- `/dashboard/owners` — add=1, edit=0, delete=0
- `/dashboard/payments/providers` — add=1, edit=0, delete=0
- `/dashboard/pricing/rule-sets` — add=1, edit=0, delete=0
- `/dashboard/procurement` — add=2, edit=0, delete=0
- `/dashboard/projects` — add=1, edit=0, delete=0
- `/dashboard/security/cameras` — add=1, edit=0, delete=0
- `/dashboard/service-fulfilment/vendors` — add=1, edit=0, delete=0
- `/dashboard/settings/responsibility-scopes` — add=1, edit=0, delete=0
- `/dashboard/shares` — add=1, edit=0, delete=0
- `/dashboard/utilities/accounts` — add=1, edit=0, delete=0
- `/dashboard/villa-guides/emergency-contacts` — add=1, edit=0, delete=0
- `/dashboard/villa-guides/neighborhood` — add=1, edit=0, delete=0
- `/dashboard/villa-guides/sections` — add=1, edit=0, delete=0
- `/dashboard/villa-guides/wifi` — add=1, edit=2, delete=0
- `/dashboard/villas` — add=1, edit=0, delete=11
- `/development-os/asset-types` — add=1, edit=0, delete=0
- `/development-os/banking` — add=1, edit=0, delete=0
- `/development-os/boq` — add=1, edit=0, delete=0
- `/development-os/bulk-import/jobs` — add=1, edit=0, delete=0
- `/development-os/buyers` — add=1, edit=0, delete=0
- `/development-os/channels` — add=1, edit=0, delete=0
- `/development-os/drawings` — add=1, edit=0, delete=0
- `/development-os/finance/bank-accounts` — add=1, edit=0, delete=0
- `/development-os/finance/categories` — add=1, edit=0, delete=0
- `/development-os/finance/invoices` — add=1, edit=0, delete=0
- `/development-os/finance/rules` — add=1, edit=0, delete=0
- `/development-os/inbox/auto-responses` — add=1, edit=0, delete=0
- `/development-os/inbox/templates` — add=1, edit=0, delete=0
- `/development-os/inventory` — add=1, edit=0, delete=0
- `/development-os/inventory/items` — add=1, edit=0, delete=0
- `/development-os/investors` — add=1, edit=0, delete=0
- `/development-os/marketing/connections` — add=1, edit=0, delete=0
- `/development-os/marketing/lead-sources` — add=1, edit=0, delete=0
- `/development-os/materials` — add=1, edit=0, delete=0
- `/development-os/method-statements` — add=1, edit=0, delete=0
- `/development-os/procurement` — add=1, edit=0, delete=0
- `/development-os/procurement/purchase-requests` — add=1, edit=0, delete=0
- `/development-os/productivity` — add=1, edit=0, delete=0
- `/development-os/projects` — add=1, edit=0, delete=1
- `/development-os/qa-qc` — add=1, edit=0, delete=0
- `/development-os/quality-standards` — add=1, edit=0, delete=0
- `/development-os/reservations` — add=1, edit=0, delete=0
- `/development-os/safety` — add=1, edit=0, delete=0
- `/development-os/sales` — add=2, edit=0, delete=0



Heuristic note: based on visible button labels matching `Edit/Rename/Update` and `Delete/Remove/Archive/Revoke`. Per-row icon-only buttons without text labels are missed and need a hand check.
