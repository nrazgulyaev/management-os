# Role appropriateness

This audit ran as the founder/super_admin. RBAC verification per role (`accountant`, `property_manager`, `technician`, `investor_owner`, etc.) requires running the audit harness with each role's credentials, then diffing the verdict matrix.

That follow-up scan is **out of scope for Stage 10.A** but is the natural input for Stage 10.I (role-specific cabinets).

For now, this section captures pages that look likely to be inappropriate for non-super-admin viewers based on URL alone:

- `/development-os/platform/*` — should be super_admin only (verify RBAC server-side)
- `/dashboard/system/*` — should be super_admin / operations_manager
- `/dashboard/audit-log` — should be admin-tier
- `/dashboard/settings/team*` — admin / owner only

Hand-verify in Stage 10.I.
