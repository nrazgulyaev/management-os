# Modal-vs-page Add forms

Pages where the Add button likely navigates instead of opening a dialog (heuristic: `a[href$="/new"]` present, `button[aria-haspopup="dialog"]` absent):

- `/dashboard/documents` — add buttons: Add document
- `/dashboard/guest-journey/rules` — add buttons: New rule
- `/dashboard/integrations/calendar-feeds` — add buttons: Add feed
- `/dashboard/inventory` — add buttons: New item
- `/dashboard/inventory/items` — add buttons: New item
- `/dashboard/inventory/locations` — add buttons: New location
- `/dashboard/inventory/movements` — add buttons: New movement
- `/dashboard/inventory/suppliers` — add buttons: New supplier
- `/dashboard/operations/housekeeping` — add buttons: New cleaning
- `/dashboard/operations/maintenance` — add buttons: New ticket
- `/dashboard/operations/preventive` — add buttons: Generate due tasks, New schedule
- `/dashboard/operations/tasks` — add buttons: New task
- `/dashboard/owner-stays/equivalence-groups` — add buttons: + New group, Add member
- `/dashboard/owner-stays/policies` — add buttons: + New policy
- `/dashboard/owners` — add buttons: New owner
- `/dashboard/payments/providers` — add buttons: Add connection
- `/dashboard/pricing/rule-sets` — add buttons: New rule set
- `/dashboard/procurement` — add buttons: New PO, New request
- `/dashboard/projects` — add buttons: New project
- `/dashboard/security/cameras` — add buttons: + New camera
- `/dashboard/service-fulfilment/vendors` — add buttons: New vendor
- `/dashboard/shares` — add buttons: New share
- `/dashboard/utilities/accounts` — add buttons: + New account
- `/dashboard/villa-guides/emergency-contacts` — add buttons: + New contact
- `/dashboard/villa-guides/neighborhood` — add buttons: + New place
- `/dashboard/villa-guides/sections` — add buttons: + New section
- `/dashboard/villa-guides/wifi` — add buttons: + Add Wi-Fi
- `/dashboard/villas` — add buttons: Add villa
- `/development-os/banking` — add buttons: Add bank connection
- `/development-os/boq` — add buttons: New BOQ
- `/development-os/drawings` — add buttons: New drawing
- `/development-os/finance/invoices` — add buttons: + New invoice
- `/development-os/inventory` — add buttons: New SKU
- `/development-os/inventory/items` — add buttons: New SKU
- `/development-os/marketing/connections` — add buttons: Connect provider
- `/development-os/materials` — add buttons: Create material PO
- `/development-os/method-statements` — add buttons: New SOP
- `/development-os/procurement` — add buttons: + New request
- `/development-os/procurement/purchase-requests` — add buttons: + New request
- `/development-os/qa-qc` — add buttons: New issue
- `/development-os/quality-standards` — add buttons: New standard
- `/development-os/safety` — add buttons: + Record incident

Pattern target: every Add for an entity that lives in a list should be a modal Dialog, not a navigation. Dedicated `/new` pages are acceptable for multi-step flows (project creation, etc.).
