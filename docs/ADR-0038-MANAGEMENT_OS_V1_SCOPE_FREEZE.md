# ADR-0038 — Management OS v1 Scope Freeze (Prompt 115)

## Status
Accepted.  Implemented across:

- `docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md`
- `docs/MANAGEMENT_OS_V1_SCOPE_FREEZE.md`
- `docs/MANAGEMENT_OS_ROLE_SURFACE_MATRIX.md`
- `docs/MANAGEMENT_OS_ROUTE_MAP.md`
- `docs/MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY.md`
- `docs/MANAGEMENT_OS_POST_V1_BACKLOG.md`
- `src/features/prelaunch/known-issues.ts`
- Polish updates to `/dashboard/demo`, `/dashboard/system/{deployment,health}`,
  `/owner`, `/owner/calendar`, `/owner/bookings`, `/owner/revenue`,
  `/owner/statements/[id]`, `/stay/demo`, `/book/hold/[token]/status`,
  `/field`, `/vendor/service/[token]`
- `tests/p115-management-os-prelaunch-polish.test.ts`
- README "Management OS v1 status" section

## Context

After Prompts 107 → 114, Management OS reached feature-completeness
for a v1 launch:

- 5 audiences served (admin, owner, guest, field, vendor)
- 20 modules (per the product map)
- 591 tests passing
- 8 static checks + 8 production gates green on the local
  environment
- Markdown readiness report + 6 deployment runbooks in place

The team had two reasonable next directions:

1. **Add more business features** (real PSP, real smart-lock, OTA
   write API, WhatsApp, AI write tools, FX, i18n, PWA offline,
   etc.) before any first launch.
2. **Freeze scope** at v1, polish the demo + stakeholder surfaces,
   document the trade-offs explicitly, and prepare for either a
   staging deployment of Management OS or a pivot to the next
   operating system in the family (Development OS / Construction OS).

This ADR records the choice to take direction (2).

## Decision

Freeze v1 scope at the post-Prompt-114 baseline.  Subsequent prompts
inside v1 may only:

- fix bugs,
- improve copy / empty-states / a11y,
- harden production / staging readiness tooling,
- improve documentation,
- run the deployment runbook against staging / production.

New business features land in **post-v1** with an explicit prompt
that re-opens scope.

## Why freeze now

1. **Adding more features before any first launch increases the
   blast radius.**  Every additional integration brings a webhook
   secret, a rate limit, a billing relationship, a vendor API
   contract — all of which can fail in production in ways the test
   suite cannot replicate.

2. **The product is already coherent.**  The five audiences each have
   a usable surface; the finance engine produces canonical owner
   statements; security baseline + audit + production gates are in
   place; the demo walkthrough covers every flow.

3. **The trade-offs are well understood.**  Every stub (manual PSP,
   smart-lock, channel push, notification dry-run, AI dry-run,
   vendor payouts) has documented copy in the UI, an ADR, and a
   post-v1 upgrade path.  Adding more stubs without first launching
   any of them reduces clarity.

4. **Operator confidence requires repetition.**  An operator who has
   walked through the deployment runbook once successfully is more
   useful than the same operator faced with twice as many surfaces.

5. **The next prompt should be a deployment, not a feature.**  This
   ADR points the next prompt at Prompt 116 — Staging Deployment
   Execution.

## Risks of adding more features before launch

- Mixing PSP integration with security baseline rework increases the
  chance of a credential leak.
- Adding real smart-lock / channel-push integrations introduces
  vendor-side downtime as a new failure mode that has not been
  exercised in production.
- WhatsApp / Telegram providers require approved business accounts
  and template approvals — slow vendor processes that should not
  block the launch.
- AI write tools require a separate human-in-the-loop approval design
  that is not yet implemented in the platform.

## Accepted limitations (summary)

For the full list see `MANAGEMENT_OS_V1_SCOPE_FREEZE.md` § 2 and
`src/features/prelaunch/known-issues.ts`.

| Area | Limitation | Workaround in v1 |
|---|---|---|
| Payments | No real PSP | Manual provider stub; deposit + balance tracked |
| OTA | No outbound write API | Read-only iCal sync; channel push is a simulation |
| Smart lock | No real provider | Stub records intent; staff issues codes manually |
| Notifications | No WhatsApp / Telegram | in_app + email + SMS via Resend / Twilio |
| AI | Read-only | Insights only; no DB / external mutation |
| Security | No WebAuthn | TOTP MFA + recovery codes |
| Localisation | EN only | Copy is consistent + glossary in place |
| Field PWA | Online-first | Offline cache for the stay landing page only |

## Future roadmap impact

- **Prompt 116** — staging deployment execution.
- **Prompt 117+** — production cutover or a parallel start on
  Development OS / Construction OS, depending on commercial
  priority.
- Each post-v1 feature lands inside **its own ADR** with a fresh
  scope-open decision.

## Consequences

### Positive
- Operators have a clear, frozen target.
- The launch readiness summary is unambiguous.
- The next prompt is small and focused (deployment, not feature).
- Investors / stakeholders see a coherent v1 with documented
  trade-offs.

### Negative / risks
- "Frozen" v1 may temporarily look "less ambitious" than competitors
  with PSP or OTA write integrations live.  Mitigation: the post-v1
  backlog is concrete and prioritised.
- Any urgent feature request mid-launch will require an explicit
  scope-open prompt + ADR.

### Out of scope (deferred)
- See `MANAGEMENT_OS_POST_V1_BACKLOG.md`.

## Recommended next prompt

**Prompt 116 — Management OS Staging Deployment Execution**: use the
deployment runbooks and preflight tools to perform the actual staging
deployment checklist: configure env, provision Supabase, apply
migrations, provision storage buckets, configure Vercel cron,
bootstrap admin, run smoke tests, capture issues, and produce a
staging deployment report.  No new product code unless fixing
deployment blockers.
